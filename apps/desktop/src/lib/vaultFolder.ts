import { openDb } from "./idb";
import { readBook, type BookMeta } from "./library";
import { normalizeProject } from "./normalize";
import { loadTrack, saveTrack, trackId } from "./tracks";
import { downloadBlob } from "./util";
import { hoistVaultRoot, projectToVault, vaultFilesFromBytes, vaultToProject, type ImportedTrack, type VaultFile } from "./vault";
import { unzip, zipStore } from "./zip";
import type { Project } from "../types";

const TRACK_EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/flac": "flac",
};

const TRACK_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  flac: "audio/flac",
};

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

/** One zip for the whole shelf: each book folder holds project.storymaker.json, tracks/, and an Obsidian vault/. */
export async function downloadShelfZip(args: {
  books: BookMeta[];
  activeId: string;
  activeProject: Project;
}): Promise<void> {
  const encoder = new TextEncoder();
  const entries: { path: string; bytes: Uint8Array }[] = [];
  const used = new Set<string>();
  const indexBooks: { id: string; title: string; tagline: string; spine: number; folder: string }[] = [];

  for (const book of args.books) {
    const project = book.id === args.activeId ? args.activeProject : readBook(book.id);
    if (!project) continue;
    const folder = uniqueDownloadFolder(used, project.name || book.title);
    indexBooks.push({
      id: book.id,
      title: project.name,
      tagline: project.tagline,
      spine: book.spine,
      folder,
    });
    entries.push({
      path: `${folder}/project.storymaker.json`,
      bytes: encoder.encode(JSON.stringify(project, null, 2)),
    });
    const seenTracks = new Set<string>();
    for (const card of project.vision.cards) {
      const id = trackId(card.media);
      if (!id || seenTracks.has(id)) continue;
      seenTracks.add(id);
      const blob = await loadTrack(id);
      if (!blob) continue;
      const ext = TRACK_EXT[blob.type] || "mp3";
      entries.push({
        path: `${folder}/tracks/${id}.${ext}`,
        bytes: new Uint8Array(await blob.arrayBuffer()),
      });
    }
    const vault = await filesFor(project);
    for (const file of vault) {
      entries.push({
        path: `${folder}/vault/${file.path}`,
        bytes: file.bytes ?? encoder.encode(file.text ?? ""),
      });
    }
  }

  entries.unshift({
    path: "shelf.json",
    bytes: encoder.encode(
      JSON.stringify(
        {
          format: "storymaker.shelf.v1",
          exportedAt: new Date().toISOString(),
          activeId: args.activeId,
          books: indexBooks,
        },
        null,
        2,
      ),
    ),
  });

  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(`StoryMaker-shelf-${stamp}.zip`, zipStore(entries));
}

export interface ShelfBackup {
  books: BookMeta[];
  activeId: string;
  projects: Record<string, Project>;
}

export function looksLikeShelfZip(entries: { path: string }[]): boolean {
  const paths = entries.map((entry) => entry.path.replace(/\\/g, "/"));
  if (paths.some((path) => path === "shelf.json" || path.endsWith("/shelf.json"))) return true;
  return paths.some((path) => path === "project.storymaker.json" || path.endsWith("/project.storymaker.json"));
}

export async function importShelfZip(buffer: ArrayBuffer): Promise<ShelfBackup> {
  const raw = await unzip(buffer);
  if (!looksLikeShelfZip(raw)) throw new Error("That zip is not a StoryMaker shelf backup. Use Export all books to make one.");
  const entries = hoistShelfRoot(raw);
  const decoder = new TextDecoder();
  const byPath = new Map(entries.map((entry) => [entry.path.replace(/\\/g, "/"), entry]));

  const shelfText = byPath.get("shelf.json");
  type ShelfIndex = {
    activeId?: string;
    books?: { id: string; title: string; tagline: string; spine: number; folder: string }[];
  };
  let index: ShelfIndex | null = null;
  if (shelfText) {
    try {
      index = JSON.parse(decoder.decode(shelfText.bytes)) as ShelfIndex;
    } catch {
      index = null;
    }
  }

  const folderNames = new Set<string>();
  if (index?.books?.length) {
    for (const book of index.books) {
      if (book.folder) folderNames.add(book.folder.replace(/\\/g, "/").replace(/\/$/, ""));
    }
  } else {
    for (const path of byPath.keys()) {
      if (path === "project.storymaker.json") folderNames.add("");
      const match = path.match(/^([^/]+)\/project\.storymaker\.json$/);
      if (match) folderNames.add(match[1]);
    }
  }

  if (!folderNames.size) throw new Error("That shelf backup has no books inside.");

  const books: BookMeta[] = [];
  const projects: Record<string, Project> = {};
  let spine = 0;

  for (const folder of folderNames) {
    const jsonPath = folder ? `${folder}/project.storymaker.json` : "project.storymaker.json";
    const jsonEntry = byPath.get(jsonPath);
    if (!jsonEntry) continue;
    let parsed: Project;
    try {
      parsed = JSON.parse(decoder.decode(jsonEntry.bytes)) as Project;
    } catch {
      continue;
    }
    if (!parsed?.characters || !parsed.comfort) continue;

    const meta = index?.books?.find((book) => book.folder === folder);
    const id = meta?.id || parsed.id || `book-${spine}`;
    const project = normalizeProject({ ...parsed, id: parsed.id || id });
    await restoreShelfTracks(folder, project, byPath);

    books.push({
      id,
      title: meta?.title || project.name,
      tagline: meta?.tagline || project.tagline,
      spine: Number.isFinite(meta?.spine) ? meta!.spine : spine,
    });
    projects[id] = project;
    spine += 1;
  }

  if (!books.length) throw new Error("That shelf backup had no readable books.");
  books.sort((a, b) => a.spine - b.spine);
  const activeId = books.some((book) => book.id === index?.activeId) ? index!.activeId! : books[0].id;
  return { books, activeId, projects };
}

async function restoreShelfTracks(
  folder: string,
  project: Project,
  byPath: Map<string, { path: string; bytes: Uint8Array }>,
): Promise<void> {
  const prefix = folder ? `${folder}/tracks/` : "tracks/";
  for (const [path, entry] of byPath) {
    if (!path.startsWith(prefix)) continue;
    const name = path.slice(prefix.length);
    if (!name || name.includes("/")) continue;
    const dot = name.lastIndexOf(".");
    if (dot <= 0) continue;
    const id = name.slice(0, dot);
    const ext = name.slice(dot + 1).toLowerCase();
    const mime = TRACK_MIME[ext] || "audio/mpeg";
    await saveTrack(id, new Blob([entry.bytes.slice()], { type: mime }));
  }

  // Older shelf zips only kept audio inside vault/attachments; rebuild those track ids from the canvas.
  const needed = project.vision.cards
    .map((card) => trackId(card.media))
    .filter((id): id is string => Boolean(id));
  if (!needed.length) return;
  const vaultPrefix = folder ? `${folder}/vault/` : "vault/";
  const vaultFiles: VaultFile[] = [];
  for (const [path, entry] of byPath) {
    if (!path.startsWith(vaultPrefix)) continue;
    vaultFiles.push(...vaultFilesFromBytes([{ path: path.slice(vaultPrefix.length), bytes: entry.bytes }]));
  }
  if (!vaultFiles.length) return;
  const canvas = vaultFiles.find((file) => file.path.replace(/\\/g, "/") === "Vision.canvas");
  if (!canvas?.text) return;
  try {
    const parsed = JSON.parse(canvas.text) as { nodes?: { id?: string; file?: string }[] };
    const fileByCard = new Map<string, string>();
    for (const node of parsed.nodes ?? []) {
      if (node.id && node.file) fileByCard.set(node.id, node.file.replace(/\\/g, "/"));
    }
    const vaultByPath = new Map(vaultFiles.map((file) => [file.path.replace(/\\/g, "/"), file]));
    for (const card of project.vision.cards) {
      const id = trackId(card.media);
      if (!id) continue;
      const filePath = fileByCard.get(card.id);
      if (!filePath) continue;
      const file = vaultByPath.get(filePath);
      if (!file?.bytes) continue;
      const ext = filePath.split(".").pop()?.toLowerCase() ?? "mp3";
      await saveTrack(id, new Blob([file.bytes.slice()], { type: TRACK_MIME[ext] || "audio/mpeg" }));
    }
  } catch {
    /* canvas was optional */
  }
}

function hoistShelfRoot(entries: { path: string; bytes: Uint8Array }[]): { path: string; bytes: Uint8Array }[] {
  const paths = entries.map((entry) => entry.path.replace(/\\/g, "/"));
  if (paths.some((path) => path === "shelf.json" || path === "project.storymaker.json")) return entries.map((entry) => ({ ...entry, path: entry.path.replace(/\\/g, "/") }));
  const tops = new Set(paths.map((path) => path.split("/")[0]).filter(Boolean));
  if (tops.size !== 1) return entries.map((entry) => ({ ...entry, path: entry.path.replace(/\\/g, "/") }));
  const root = [...tops][0];
  const nested = paths.filter((path) => path.startsWith(`${root}/`));
  if (!nested.some((path) => path === `${root}/shelf.json` || path.endsWith("/project.storymaker.json"))) {
    return entries.map((entry) => ({ ...entry, path: entry.path.replace(/\\/g, "/") }));
  }
  return entries.map((entry) => {
    const path = entry.path.replace(/\\/g, "/");
    return { path: path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path, bytes: entry.bytes };
  });
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

function uniqueDownloadFolder(used: Set<string>, name: string): string {
  const base = safeDownloadName(name);
  let folder = base;
  let n = 2;
  while (used.has(folder.toLowerCase())) {
    folder = `${base}-${n}`;
    n += 1;
  }
  used.add(folder.toLowerCase());
  return folder;
}
