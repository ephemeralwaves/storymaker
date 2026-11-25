import { normalizeProject } from "./normalize";
import { createSeed, STORAGE_KEY } from "../seed";
import type { Project } from "../types";
import { uid } from "./util";

export const LIBRARY_KEY = "storymaker.library.v1";

export interface BookMeta {
  id: string;
  title: string;
  tagline: string;
  spine: number;
}

export interface LibraryState {
  activeId: string;
  books: BookMeta[];
  project: Project;
}

export function bookKey(id: string): string {
  return `storymaker.book.${id}`;
}

let savedBeforeLoad = false;

export function libraryWasSaved(): boolean {
  return savedBeforeLoad;
}

export function loadLibrary(): LibraryState {
  savedBeforeLoad = Boolean(localStorage.getItem(LIBRARY_KEY) || localStorage.getItem(STORAGE_KEY));
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as { activeId?: string; books?: BookMeta[] };
      const books = (stored.books ?? []).filter((book) => book?.id && readBook(book.id));
      if (!books.length) return { activeId: "", books: [], project: blankProject("Untitled story") };
      const activeId = books.some((book) => book.id === stored.activeId) ? stored.activeId! : books[0].id;
      const project = readBook(activeId) ?? blankProject("Untitled story");
      return { activeId, books: books.map((book) => decorate(book, book.id === activeId ? project : null)), project };
    }
  } catch {
    /* fall through to the single-project save */
  }
  const project = readLegacy();
  const book: BookMeta = { id: project.id || uid("book"), title: project.name, tagline: project.tagline, spine: 0 };
  const state = { activeId: book.id, books: [book], project };
  writeLibrary(state);
  return state;
}

export function readBook(id: string): Project | null {
  try {
    const raw = localStorage.getItem(bookKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Project;
    if (!parsed?.characters || !parsed.comfort) return null;
    return normalizeProject(parsed);
  } catch {
    return null;
  }
}

export function writeLibrary(state: { activeId: string; books: BookMeta[]; project: Project }): void {
  if (!state.activeId || !state.books.some((book) => book.id === state.activeId)) {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify({ activeId: state.activeId, books: state.books }));
    return;
  }
  localStorage.setItem(bookKey(state.activeId), JSON.stringify(state.project));
  localStorage.setItem(LIBRARY_KEY, JSON.stringify({ activeId: state.activeId, books: state.books }));
}

export function blankProject(name: string): Project {
  const seed = createSeed();
  return normalizeProject({
    ...seed,
    id: uid("story"),
    name: name.trim() || "Untitled story",
    tagline: "A new story, still quiet.",
    characters: [],
    relationships: [],
    lore: [],
    events: [],
    chapters: [{ id: uid("chapter"), title: "Chapter 1", order: 0 }],
    scenes: [],
    trash: [],
    vision: { cards: [], edges: [] },
    wordsByDay: {},
    streak: 0,
    lastWriteDay: null,
    lampLit: false,
  });
}

function readLegacy(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return normalizeProject(createSeed());
    const parsed = JSON.parse(raw) as Project;
    if (!parsed?.characters || !parsed.comfort) return normalizeProject(createSeed());
    return normalizeProject(parsed);
  } catch {
    return normalizeProject(createSeed());
  }
}

function decorate(book: BookMeta, project: Project | null): BookMeta {
  return {
    id: book.id,
    title: project?.name || book.title || "Untitled story",
    tagline: project?.tagline || book.tagline || "",
    spine: Number.isFinite(book.spine) ? book.spine : 0,
  };
}
