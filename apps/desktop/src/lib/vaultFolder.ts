import { openDb } from "./idb";
import { loadTrack, saveTrack, trackId } from "./tracks";
import { downloadBlob } from "./util";
import { hoistVaultRoot, projectToVault, vaultFilesFromBytes, vaultToProject, type ImportedTrack, type VaultFile } from "./vault";
import { unzip, zipStore } from "./zip";
import type { Project } from "../types";

const HANDLES = "handles";
const MANIFEST = ".storymaker/files.json";

export interface VaultStatus {
  folder: string | null;
  error: string;
  savedAt: string | null;
}

let status: VaultStatus = { folder: null, error: "", savedAt: null };
let ready = false;
let vaultBookId = "vault";
const listeners = new Set<(status: VaultStatus) => void>();

export function subscribeVault(listener: (status: VaultStatus) => void): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

export function vaultIsReady(): boolean {
  return ready;
}

export function markVaultReady(): void {
  ready = true;
}

export function setVaultBook(id: string): void {
  vaultBookId = id || "vault";
}

function setStatus(patch: Partial<VaultStatus>): void {
  status = { ...status, ...patch };
  listeners.forEach((listener) => listener(status));
}

type PickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: "read" | "readwrite"; id?: string }) => Promise<FileSystemDirectoryHandle>;
};

type VaultRoot =
  | { kind: "browser"; handle: FileSystemDirectoryHandle }
  | { kind: "desktop"; path: string; name: string }
  | { kind: "named"; name: string };

interface DesktopFile {
  path: string;
  text?: string | null;
  base64?: string | null;
}

export class FolderChoiceCancelled extends Error {
  constructor() {
    super("The folder window was closed before a folder was chosen.");
    this.name = "FolderChoiceCancelled";
  }
}

export function explainVaultError(error: unknown): string | null {
  if (error instanceof FolderChoiceCancelled) return null;
  if (error instanceof DOMException && error.name === "AbortError") return null;
  if (error instanceof Error && /user aborted a request/i.test(error.message)) return null;
  return error instanceof Error ? error.message : "Could not use that folder.";
}

export async function rememberVault(handle: FileSystemDirectoryHandle): Promise<void> {
  await rememberRoot(handle);
  setStatus({ folder: handle.name, error: "" });
}

export async function linkedVault(): Promise<FileSystemDirectoryHandle | null> {
  const root = await linkedRoot();
  return root?.kind === "browser" ? root.handle : null;
}

function vaultKey(): string {
  return `book:${vaultBookId}`;
}

export function vaultUsesDesktopPicker(): boolean {
  return Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

export function canChooseWritableFolder(): boolean {
  return vaultUsesDesktopPicker() || typeof (window as PickerWindow).showDirectoryPicker === "function";
}

export async function rememberFolderName(name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) return;
  await rememberRoot(`name:${clean}`);
  setStatus({ folder: clean, error: "" });
}

function folderName(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function rootName(root: VaultRoot): string {
  return root.kind === "browser" ? root.handle.name : root.name;
}

function isAbort(error: unknown): boolean {
  return (error instanceof DOMException && error.name === "AbortError") || (error instanceof Error && /user aborted a request/i.test(error.message));
}

async function rememberRoot(value: FileSystemDirectoryHandle | string): Promise<void> {
  const db = await openDb();
  try {
    await requestTo(db, "readwrite", (store) => store.put(value, vaultKey()));
  } finally {
    db.close();
  }
}

async function linkedRoot(): Promise<VaultRoot | null> {
  const db = await openDb();
  try {
    let stored = await requestFrom<unknown>(db, (store) => store.get(vaultKey()));
    if (stored == null && vaultBookId !== "vault") {
      stored = await requestFrom<unknown>(db, (store) => store.get("vault"));
      if (stored != null) await requestTo(db, "readwrite", (store) => store.put(stored, vaultKey()));
    }
    const root = asRoot(stored);
    if (root) setStatus({ folder: rootName(root) });
    else setStatus({ folder: null, error: "", savedAt: null });
    return root;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

function asRoot(stored: unknown): VaultRoot | null {
  if (typeof stored === "string" && stored.startsWith("name:")) {
    const name = stored.slice(5).trim();
    return name ? { kind: "named", name } : null;
  }
  if (typeof stored === "string" && stored) return { kind: "desktop", path: stored, name: folderName(stored) };
  if (stored && typeof stored === "object" && "kind" in stored && (stored as FileSystemDirectoryHandle).kind === "directory") {
    return { kind: "browser", handle: stored as FileSystemDirectoryHandle };
  }
  return null;
}

async function readRoot(root: VaultRoot): Promise<VaultFile[]> {
  if (root.kind === "named") return [];
  if (root.kind === "browser") return readTree(root.handle);
  const { invoke } = await import("@tauri-apps/api/core");
  const files = await invoke<DesktopFile[]>("read_vault_folder", { root: root.path });
  return files.map((file) => ({
    path: file.path,
    text: file.text ?? undefined,
    bytes: file.base64 ? base64ToBytes(file.base64) : undefined,
  }));
}

async function writeDesktop(path: string, project: Project): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  const manifest = await invoke<string | null>("read_vault_text", { root: path, relative: MANIFEST });
  const previous = manifestPaths(manifest);
  const files = await filesFor(project);
  const nextPaths = new Set(files.map((file) => file.path));
  const payload = files.map((file) => ({
    path: file.path,
    text: file.text ?? null,
    base64: file.bytes ? bytesToBase64(file.bytes) : null,
  }));
  payload.push({ path: MANIFEST, text: JSON.stringify([...nextPaths], null, 2), base64: null });
  nextPaths.add(MANIFEST);
  await invoke("write_vault_folder", {
    root: path,
    files: payload,
    remove: previous.filter((item) => !nextPaths.has(item)),
  });
}

function manifestPaths(text: string | null): string[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function chooseVaultFolder(): Promise<{ name: string }> {
  if (vaultUsesDesktopPicker()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const path = await invoke<string | null>("pick_vault_folder");
    if (!path) throw new FolderChoiceCancelled();
    const name = folderName(path);
    await rememberRoot(path);
    setStatus({ folder: name, error: "" });
    return { name };
  }
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) throw new Error("This window cannot pick a folder. Use Import vault folder, or download a zip and open that folder in Obsidian.");
  const handle = await pickBrowserFolder(picker);
  await permit(handle, true);
  await rememberVault(handle);
  return { name: handle.name };
}

async function pickBrowserFolder(
  picker: NonNullable<PickerWindow["showDirectoryPicker"]>,
): Promise<FileSystemDirectoryHandle> {
  try {
    return await picker({ mode: "read" });
  } catch (error) {
    if (isAbort(error)) throw new FolderChoiceCancelled();
    throw error;
  }
}

export async function readLinkedProject(base: Project): Promise<{ project: Project; tracks: ImportedTrack[] } | null> {
  const root = await linkedRoot();
  if (!root || root.kind === "named") return null;
  if (root.kind === "browser" && !(await permit(root.handle, false, "read"))) return null;
  const files = hoistVaultRoot(await readRoot(root));
  if (!files.some((file) => file.path.endsWith(".md"))) return null;
  return vaultToProject(files, base);
}

export async function writeLinkedProject(project: Project): Promise<void> {
  if (!ready) return;
  try {
    await writeRememberedVault(project);
  } catch (error) {
    setStatus({ error: error instanceof Error ? error.message : "Could not save the vault." });
  }
}

export async function writeRememberedVault(project: Project): Promise<boolean> {
  const root = await linkedRoot();
  if (!root || root.kind === "named") return false;
  if (root.kind === "browser") {
    if (!(await permit(root.handle, true))) return false;
    await writeVault(root.handle, project);
  } else await writeDesktop(root.path, project);
  setStatus({ folder: rootName(root), error: "", savedAt: new Date().toLocaleTimeString() });
  return true;
}

export async function writeVault(handle: FileSystemDirectoryHandle, project: Project): Promise<void> {
  const files = await filesFor(project);
  const previous = await readManifest(handle);
  for (const file of files) await writeVaultFile(handle, file);
  const nextPaths = new Set(files.map((file) => file.path));
  for (const path of previous) {
    if (!nextPaths.has(path)) await removeVaultFile(handle, path);
  }
  await writeVaultFile(handle, { path: MANIFEST, text: JSON.stringify([...nextPaths], null, 2) });
}

export async function downloadVaultZip(project: Project): Promise<void> {
  const files = await filesFor(project);
  const encoder = new TextEncoder();
  const blob = zipStore(
    files.map((file) => ({
      path: file.path,
      bytes: file.bytes ?? encoder.encode(file.text ?? ""),
    })),
  );
  downloadBlob(`${safeDownloadName(project.name)}.zip`, blob);
}

export async function importVaultFiles(files: VaultFile[], base: Project): Promise<{ project: Project; tracks: ImportedTrack[] }> {
  const imported = vaultToProject(hoistVaultRoot(files), base);
  await keptProject(imported);
  return imported;
}

export async function keptProject(loaded: { project: Project; tracks: ImportedTrack[] }): Promise<Project> {
  for (const track of loaded.tracks) {
    await saveTrack(track.id, new Blob([track.bytes.slice()], { type: track.mime }));
  }
  return loaded.project;
}

export async function importVaultZip(buffer: ArrayBuffer, base: Project): Promise<{ project: Project; tracks: ImportedTrack[] }> {
  return importVaultFiles(vaultFilesFromBytes(await unzip(buffer)), base);
}

export async function filesFromDirectoryInput(list: Iterable<File>): Promise<VaultFile[]> {
  const files: VaultFile[] = [];
  for (const file of list) {
    const relative = file.webkitRelativePath || file.name;
    const bytes = new Uint8Array(await file.arrayBuffer());
    files.push(...vaultFilesFromBytes([{ path: relative, bytes }]));
  }
  return hoistVaultRoot(files);
}

async function filesFor(project: Project): Promise<VaultFile[]> {
  const audio = new Map<string, { bytes: Uint8Array; mime: string }>();
  for (const card of project.vision.cards) {
    const id = trackId(card.media);
    if (!id || audio.has(id)) continue;
    const blob = await loadTrack(id);
    if (!blob) continue;
    audio.set(id, { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type || "audio/mpeg" });
  }
  return projectToVault(project, audio);
}

async function readTree(dir: FileSystemDirectoryHandle, prefix = ""): Promise<VaultFile[]> {
  const files: VaultFile[] = [];
  for await (const [name, handle] of directoryEntries(dir)) {
    if (name === ".obsidian" || name === "node_modules") continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") files.push(...(await readTree(handle as FileSystemDirectoryHandle, path)));
    else if (handle.kind === "file") files.push(await readFile(handle as FileSystemFileHandle, path));
  }
  return files;
}

async function readFile(handle: FileSystemFileHandle, path: string): Promise<VaultFile> {
  const file = await handle.getFile();
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (["md", "markdown", "txt", "canvas", "json"].includes(ext)) return { path, text: await file.text() };
  return { path, bytes: new Uint8Array(await file.arrayBuffer()) };
}

async function writeVaultFile(root: FileSystemDirectoryHandle, file: VaultFile): Promise<void> {
  const handle = await fileHandle(root, file.path, true);
  const writable = await handle.createWritable();
  const payload = file.bytes ? new Blob([file.bytes.slice()]) : (file.text ?? "");
  await writable.write(payload);
  await writable.close();
}

async function removeVaultFile(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  const parts = path.split("/");
  const name = parts.pop();
  if (!name) return;
  try {
    let dir = root;
    for (const part of parts) dir = await dir.getDirectoryHandle(part);
    await dir.removeEntry(name);
  } catch {
    /* already gone */
  }
}

async function readManifest(root: FileSystemDirectoryHandle): Promise<string[]> {
  try {
    const handle = await fileHandle(root, MANIFEST, false);
    const text = await (await handle.getFile()).text();
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function fileHandle(root: FileSystemDirectoryHandle, path: string, create: boolean): Promise<FileSystemFileHandle> {
  const parts = path.split("/");
  const name = parts.pop();
  if (!name) throw new Error("Missing file name.");
  let dir = root;
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create });
  return dir.getFileHandle(name, { create });
}

async function permit(handle: FileSystemDirectoryHandle, request: boolean, mode: "read" | "readwrite" = "readwrite"): Promise<boolean> {
  const descriptor = { mode };
  const withPermission = handle as FileSystemDirectoryHandle & {
    queryPermission?: (descriptor: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
    requestPermission?: (descriptor: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  };
  try {
    if (!withPermission.queryPermission || !withPermission.requestPermission) return true;
    if ((await withPermission.queryPermission(descriptor)) === "granted") return true;
    if (mode === "readwrite" && (await withPermission.queryPermission({ mode: "read" })) === "granted" && !request) return false;
    if (!request) return false;
    return (await withPermission.requestPermission(descriptor)) === "granted";
  } catch {
    return mode === "read";
  }
}

function directoryEntries(dir: FileSystemDirectoryHandle): AsyncIterable<[string, FileSystemHandle]> {
  const readable = dir as FileSystemDirectoryHandle & { entries?: () => AsyncIterable<[string, FileSystemHandle]> };
  if (!readable.entries) throw new Error("This window cannot read folders.");
  return readable.entries();
}

function requestTo(db: IDBDatabase, mode: IDBTransactionMode, write: (store: IDBObjectStore) => IDBRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLES, mode);
    write(tx.objectStore(HANDLES));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not remember that folder."));
  });
}

function requestFrom<T>(db: IDBDatabase, read: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLES, "readonly");
    const request = read(tx.objectStore(HANDLES));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the saved folder."));
  });
}

function safeDownloadName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "").trim() || "story";
}
