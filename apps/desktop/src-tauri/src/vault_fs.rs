use std::fs;
use std::path::{Component, Path, PathBuf};

use base64::Engine;
use serde::{Deserialize, Serialize};

const SKIP_DIRS: &[&str] = &[".obsidian", "node_modules", ".git"];
const TEXT_EXT: &[&str] = &["md", "markdown", "txt", "canvas", "json"];
const MAX_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Serialize)]
pub struct VaultRead {
    path: String,
    text: Option<String>,
    base64: Option<String>,
}

#[derive(Deserialize)]
pub struct VaultWrite {
    path: String,
    text: Option<String>,
    base64: Option<String>,
}

#[tauri::command]
pub fn pick_vault_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        return pick_windows_folder(owner_hwnd(&app));
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("This desktop window cannot open a folder picker. Use Import vault folder.".into())
    }
}

#[cfg(windows)]
fn owner_hwnd(app: &tauri::AppHandle) -> isize {
    use tauri::Manager;
    app.get_webview_window("main")
        .and_then(|window| window.hwnd().ok())
        .map(|hwnd| hwnd.0 as isize)
        .unwrap_or(0)
}

#[cfg(windows)]
fn pick_windows_folder(owner: isize) -> Result<Option<String>, String> {
    let script = format!(
        r#"
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
class FileOpenDialogRCW {{}}
[ComImport, Guid("d57c7288-d4ad-4768-be02-9d969532d960"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IFileOpenDialog {{
  [PreserveSig] int Show(IntPtr parent);
  void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
  void SetFileTypeIndex(uint iFileType);
  void GetFileTypeIndex(out uint piFileType);
  void Advise(IntPtr pfde, out uint pdwCookie);
  void Unadvise(uint dwCookie);
  void SetOptions(uint fos);
  void GetOptions(out uint fos);
  void SetDefaultFolder(IShellItem psi);
  void SetFolder(IShellItem psi);
  void GetFolder(out IShellItem ppsi);
  void GetCurrentSelection(out IShellItem ppsi);
  void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
  void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
  void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
  void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
  void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
  void GetResult(out IShellItem ppsi);
  void AddPlace(IShellItem psi, uint fdap);
  void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
  void Close(int hr);
  void SetClientGuid(ref Guid guid);
  void ClearClientData();
  void SetFilter(IntPtr pFilter);
  void GetResults(out IntPtr ppenum);
  void GetSelectedItems(out IntPtr ppsai);
}}
[ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IShellItem {{
  void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
  void GetParent(out IShellItem ppsi);
  void GetDisplayName(uint sigdnName, out IntPtr ppszName);
  void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
  void Compare(IShellItem psi, uint hint, out int piOrder);
}}
public class StoryMakerFolder {{
  public static string Pick() {{
    var dialog = (IFileOpenDialog)new FileOpenDialogRCW();
    dialog.SetOptions(0x20 | 0x40 | 0x8);
    dialog.SetTitle("Choose an Obsidian vault folder");
    dialog.SetOkButtonLabel("Select Folder");
    int hr = dialog.Show(new IntPtr({owner}L));
    if (hr == unchecked((int)0x800704C7)) return "";
    if (hr != 0) throw new InvalidOperationException("Could not open the folder window.");
    IShellItem item;
    dialog.GetResult(out item);
    IntPtr psz;
    item.GetDisplayName(0x80058000, out psz);
    string path = Marshal.PtrToStringUni(psz);
    Marshal.FreeCoTaskMem(psz);
    return path ?? "";
  }}
}}
"@
[Console]::Out.Write(([StoryMakerFolder]::Pick()))
"#
    );
    let child = std::process::Command::new("powershell")
        .args(["-NoProfile", "-STA", "-WindowStyle", "Hidden", "-EncodedCommand", &encode_powershell(&script)])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|err| format!("Could not open the folder window: {err}"))?;
    let output = child.wait_with_output().map_err(|err| err.to_string())?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if detail.is_empty() { "Could not open the folder window.".into() } else { detail });
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().trim_start_matches('\u{feff}').to_string();
    if path.is_empty() { Ok(None) } else { Ok(Some(path)) }
}

#[cfg(windows)]
fn encode_powershell(script: &str) -> String {
    let mut bytes = Vec::with_capacity(script.len() * 2);
    for unit in script.encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

#[tauri::command]
pub fn read_vault_folder(root: String) -> Result<Vec<VaultRead>, String> {
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() {
        return Err("That folder is no longer there.".into());
    }
    let mut files = Vec::new();
    walk(&root_path, &root_path, &mut files)?;
    Ok(files)
}

#[tauri::command]
pub fn read_vault_text(root: String, relative: String) -> Result<Option<String>, String> {
    let root_path = PathBuf::from(&root);
    let path = safe_join(&root_path, &relative)?;
    if !path.is_file() {
        return Ok(None);
    }
    let bytes = fs::read(&path).map_err(|err| err.to_string())?;
    Ok(Some(String::from_utf8_lossy(&bytes).into_owned()))
}

#[tauri::command]
pub fn write_vault_folder(root: String, files: Vec<VaultWrite>, remove: Vec<String>) -> Result<(), String> {
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() {
        return Err("That folder is no longer there.".into());
    }
    for file in files {
        let path = safe_join(&root_path, &file.path)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
        let bytes = file_bytes(&file)?;
        fs::write(&path, bytes).map_err(|err| format!("Could not write {}: {err}", file.path))?;
    }
    for relative in remove {
        let path = match safe_join(&root_path, &relative) {
            Ok(path) => path,
            Err(_) => continue,
        };
        if path.is_file() {
            let _ = fs::remove_file(path);
        }
    }
    Ok(())
}

fn walk(root: &Path, dir: &Path, files: &mut Vec<VaultRead>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|err| err.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|err| err.to_string())?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if SKIP_DIRS.contains(&name.as_ref()) {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            walk(root, &path, files)?;
            continue;
        }
        if !path.is_file() {
            continue;
        }
        let meta = entry.metadata().map_err(|err| err.to_string())?;
        if meta.len() > MAX_BYTES {
            continue;
        }
        let relative = relative_slash(root, &path);
        let bytes = fs::read(&path).map_err(|err| err.to_string())?;
        if is_text(&relative) {
            files.push(VaultRead {
                path: relative,
                text: Some(String::from_utf8_lossy(&bytes).into_owned()),
                base64: None,
            });
        } else {
            files.push(VaultRead {
                path: relative,
                text: None,
                base64: Some(base64::engine::general_purpose::STANDARD.encode(bytes)),
            });
        }
    }
    Ok(())
}

fn file_bytes(file: &VaultWrite) -> Result<Vec<u8>, String> {
    if let Some(text) = &file.text {
        return Ok(text.as_bytes().to_vec());
    }
    if let Some(encoded) = &file.base64 {
        return base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|_| format!("Could not write {}.", file.path));
    }
    Ok(Vec::new())
}

fn is_text(path: &str) -> bool {
    let ext = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    TEXT_EXT.contains(&ext.as_str())
}

fn relative_slash(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .components()
        .filter_map(|component| match component {
            Component::Normal(part) => Some(part.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn safe_join(root: &Path, relative: &str) -> Result<PathBuf, String> {
    if relative.is_empty() || relative.contains('\0') {
        return Err("Missing file name.".into());
    }
    let rel = Path::new(relative);
    if rel.is_absolute() || rel.components().any(|component| matches!(component, Component::ParentDir | Component::RootDir | Component::Prefix(_))) {
        return Err(format!("Refusing to write {relative}."));
    }
    Ok(root.join(rel))
}
