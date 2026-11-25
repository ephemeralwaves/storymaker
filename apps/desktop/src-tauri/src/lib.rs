mod vault_fs;

#[tauri::command]
fn save_project(app: tauri::AppHandle, json: String) -> Result<(), String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|err| err.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    std::fs::write(dir.join("project.json"), json).map_err(|err| err.to_string())
}

#[tauri::command]
fn load_project(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri::Manager;
    let path = app
        .path()
        .app_data_dir()
        .map_err(|err| err.to_string())?
        .join("project.json");
    if !path.exists() {
        return Ok(None);
    }
    let json = std::fs::read_to_string(path).map_err(|err| err.to_string())?;
    Ok(Some(json))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            save_project,
            load_project,
            vault_fs::pick_vault_folder,
            vault_fs::read_vault_folder,
            vault_fs::read_vault_text,
            vault_fs::write_vault_folder
        ])
        .run(tauri::generate_context!())
        .expect("StoryMaker failed to start");
}
