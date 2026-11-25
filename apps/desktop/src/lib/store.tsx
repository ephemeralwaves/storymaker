import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { blankProject, bookKey, libraryWasSaved, loadLibrary, readBook, writeLibrary, type BookMeta } from "./library";
import { normalizeProject } from "./normalize";
import { createSeed } from "../seed";
import { saveTrack } from "./tracks";
import { markVaultReady, readLinkedProject, setVaultBook, writeLinkedProject } from "./vaultFolder";
import { buildPreset, reckon, remapMonths } from "./calendar";
import type {
  CalendarMonth,
  CalendarPresetId,
  CalendarSettings,
  Character,
  LoreEntry,
  Project,
  Relationship,
  Scene,
  ThreadEvent,
  TrashedScene,
  ViewId,
  VisionCard,
  VisionEdge,
} from "../types";
import { deleteTrack, trackId } from "./tracks";
import { countWords, todayKey, uid, yesterdayKey } from "./util";

interface StoryApi {
  project: Project;
  view: ViewId;
  setView: (view: ViewId) => void;
  focusMode: boolean;
  setFocusMode: (value: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (value: boolean) => void;
  selectedCharacterId: string | null;
  selectedLoreId: string | null;
  selectedSceneId: string | null;
  selectCharacter: (id: string) => void;
  selectLore: (id: string) => void;
  selectScene: (id: string) => void;
  selectedEventId: string | null;
  selectEvent: (id: string) => void;
  openEvent: (id: string) => void;
  sessionWords: number;
  summaryOpen: boolean;
  closeSummary: () => void;
  patchProject: (recipe: (project: Project) => Project) => void;
  renameProject: (name: string, tagline: string) => void;
  setComfort: (patch: Partial<Project["comfort"]>) => void;
  lightLamp: () => void;
  extinguishLamp: () => void;
  saveCharacter: (character: Character) => void;
  addCharacter: () => void;
  deleteCharacter: (id: string) => void;
  saveRelationship: (relationship: Relationship) => void;
  addRelationship: () => void;
  deleteRelationship: (id: string) => void;
  addBondKind: () => void;
  renameBondKind: (id: string, name: string) => void;
  removeBondKind: (id: string) => void;
  saveLore: (entry: LoreEntry) => void;
  addLore: () => void;
  deleteLore: (id: string) => void;
  saveEvent: (event: ThreadEvent) => void;
  addEvent: (partial?: Partial<ThreadEvent>) => void;
  deleteEvent: (id: string) => void;
  addMonth: () => void;
  updateMonth: (index: number, patch: Partial<CalendarMonth>) => void;
  removeMonth: (index: number) => void;
  moveMonth: (index: number, delta: -1 | 1) => void;
  setCalendar: (patch: Partial<CalendarSettings>) => void;
  applyCalendarPreset: (id: Exclude<CalendarPresetId, "custom">) => void;
  addVisionCard: (card: Omit<VisionCard, "id">) => void;
  moveVisionCard: (id: string, x: number, y: number) => void;
  updateVisionCard: (id: string, patch: Partial<VisionCard>) => void;
  deleteVisionCard: (id: string) => void;
  addVisionEdge: (fromId: string, toId: string) => void;
  updateVisionEdge: (edge: VisionEdge) => void;
  deleteVisionEdge: (id: string) => void;
  saveScene: (scene: Scene, opts?: { checkpoint?: boolean; skipHistory?: boolean }) => void;
  undoSceneBody: () => void;
  sceneUndoDepth: number;
  addChapter: () => void;
  addScene: (chapterId: string) => void;
  setAsideScene: (id: string) => void;
  recoverScene: (id: string) => void;
  discardTrashedScene: (id: string) => void;
  emptyTrash: () => void;
  replaceProject: (project: Project) => void;
  resetSeed: () => void;
  bookId: string;
  books: BookMeta[];
  openBook: (id: string) => void;
  addBook: (title: string) => void;
  removeBook: (id: string) => void;
}

const StoryContext = createContext<StoryApi | null>(null);

const MAX_SCENE_REVISIONS = 10;
const SCENE_EDIT_BURST_MS = 2000;

async function mirrorToDesktop(project: Project): Promise<void> {
  const marker = (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  if (!marker) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("save_project", { json: JSON.stringify(project) });
}

export async function loadDesktopProject(): Promise<Project | null> {
  const marker = (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  if (!marker) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  const json = await invoke<string | null>("load_project");
  if (!json) return null;
  return JSON.parse(json) as Project;
}

function applyOpen(next: Project, setSelected: {
  setSelectedCharacterId: (id: string | null) => void;
  setSelectedLoreId: (id: string | null) => void;
  setSelectedSceneId: (id: string | null) => void;
  setSelectedEventId: (id: string | null) => void;
}) {
  setSelected.setSelectedCharacterId(next.characters[0]?.id ?? null);
  setSelected.setSelectedLoreId(next.lore[0]?.id ?? null);
  setSelected.setSelectedSceneId(next.scenes[0]?.id ?? null);
  setSelected.setSelectedEventId(next.events[0]?.id ?? null);
}

export function StoryProvider({ children }: { children: ReactNode }) {
  const library = useState(() => loadLibrary())[0];
  const [project, setProject] = useState<Project>(library.project);
  const [books, setBooks] = useState<BookMeta[]>(library.books);
  const [bookId, setBookId] = useState(library.activeId);
  const [view, setView] = useState<ViewId>("home");
  const [focusMode, setFocusMode] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(project.characters[0]?.id ?? null);
  const [selectedLoreId, setSelectedLoreId] = useState<string | null>(project.lore[0]?.id ?? null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(project.scenes[0]?.id ?? null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(project.events[0]?.id ?? null);
  const [sessionBase, setSessionBase] = useState(0);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [historyTick, setHistoryTick] = useState(0);
  const projectRef = useRef(project);
  projectRef.current = project;
  const sceneHistoryRef = useRef<Record<string, string[]>>({});
  const editBurstRef = useRef<{ sceneId: string; at: number } | null>(null);
  const selectedSceneIdRef = useRef(selectedSceneId);
  selectedSceneIdRef.current = selectedSceneId;

  const clearSceneHistory = (id?: string) => {
    if (id) {
      if (!sceneHistoryRef.current[id]) return;
      const next = { ...sceneHistoryRef.current };
      delete next[id];
      sceneHistoryRef.current = next;
    } else {
      sceneHistoryRef.current = {};
      editBurstRef.current = null;
    }
    setHistoryTick((tick) => tick + 1);
  };

  const pushSceneRevision = (sceneId: string, body: string) => {
    const stack = sceneHistoryRef.current[sceneId] ?? [];
    if (stack[stack.length - 1] === body) return;
    sceneHistoryRef.current = {
      ...sceneHistoryRef.current,
      [sceneId]: [...stack, body].slice(-MAX_SCENE_REVISIONS),
    };
    setHistoryTick((tick) => tick + 1);
  };

  useEffect(() => {
    setVaultBook(bookId);
  }, [bookId]);

  useEffect(() => {
    setBooks((current) => {
      const book = current.find((item) => item.id === bookId);
      if (!book || (book.title === project.name && book.tagline === project.tagline)) return current;
      return current.map((item) => (item.id === bookId ? { ...item, title: project.name, tagline: project.tagline } : item));
    });
  }, [bookId, project.name, project.tagline]);

  useEffect(() => {
    const alive = Boolean(bookId && books.some((book) => book.id === bookId));
    writeLibrary({ activeId: bookId, books, project });
    if (!alive) return;
    void mirrorToDesktop(project).catch(() => undefined);
    const timer = window.setTimeout(() => {
      void writeLinkedProject(project);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [project, books, bookId]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const linked = await readLinkedProject(projectRef.current);
        if (cancel) return;
        if (linked) {
          for (const track of linked.tracks) {
            await saveTrack(track.id, new Blob([track.bytes.slice()], { type: track.mime }));
          }
          if (!cancel) setProject(linked.project);
          return;
        }
        if (libraryWasSaved()) return;
        const native = await loadDesktopProject();
        if (!cancel && native?.characters) setProject(normalizeProject(native));
      } catch {
        /* keep the copy already open */
      } finally {
        if (!cancel) markVaultReady();
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const totalWords = useMemo(
    () => project.scenes.reduce((sum, scene) => sum + countWords(scene.body), 0),
    [project.scenes],
  );

  const sceneUndoDepth = useMemo(() => {
    void historyTick;
    return selectedSceneId ? (sceneHistoryRef.current[selectedSceneId]?.length ?? 0) : 0;
  }, [historyTick, selectedSceneId]);

  const patchProject = (recipe: (current: Project) => Project) => {
    setProject((current) => recipe(current));
  };

  const noteWords = (before: number, after: number, current: Project): Project => {
    const delta = after - before;
    if (delta <= 0) return current;
    const day = todayKey();
    const wordsByDay = { ...current.wordsByDay, [day]: (current.wordsByDay[day] ?? 0) + delta };
    const streak =
      current.lastWriteDay === day ? current.streak : current.lastWriteDay === yesterdayKey() ? current.streak + 1 : 1;
    return { ...current, wordsByDay, streak, lastWriteDay: day };
  };

  const api: StoryApi = {
    project,
    view,
    setView,
    focusMode,
    setFocusMode,
    searchOpen,
    setSearchOpen,
    selectedCharacterId,
    selectedLoreId,
    selectedSceneId,
    selectCharacter: setSelectedCharacterId,
    selectLore: setSelectedLoreId,
    selectScene: setSelectedSceneId,
    selectedEventId,
    selectEvent: setSelectedEventId,
    openEvent: (id) => {
      setSelectedEventId(id);
      setView("threads");
    },
    sessionWords: Math.max(0, totalWords - sessionBase),
    summaryOpen,
    closeSummary: () => setSummaryOpen(false),
    patchProject,
    renameProject: (name, tagline) => patchProject((current) => ({ ...current, name, tagline })),
    setComfort: (patch) => patchProject((current) => ({ ...current, comfort: { ...current.comfort, ...patch } })),
    lightLamp: () => {
      setSessionBase(totalWords);
      setSummaryOpen(false);
      patchProject((current) => ({ ...current, lampLit: true }));
    },
    extinguishLamp: () => {
      setSummaryOpen(true);
      patchProject((current) => ({ ...current, lampLit: false }));
    },
    saveCharacter: (character) =>
      patchProject((current) => ({
        ...current,
        characters: current.characters.map((item) => (item.id === character.id ? character : item)),
      })),
    addCharacter: () => {
      const character: Character = {
        id: uid("person"),
        name: "New person",
        role: "Supporting",
        age: "",
        origin: "",
        gift: "",
        status: "",
        personality: "",
        summary: "",
        backstory: "",
        habits: "",
        fears: "",
        image: "",
        x: 80 + (project.characters.length % 3) * 240,
        y: 80 + Math.floor(project.characters.length / 3) * 180,
      };
      setSelectedCharacterId(character.id);
      setView("people");
      patchProject((current) => ({ ...current, characters: [...current.characters, character] }));
    },
    deleteCharacter: (id) => {
      patchProject((current) => ({
        ...current,
        characters: current.characters.filter((item) => item.id !== id),
        relationships: current.relationships.filter((item) => item.fromId !== id && item.toId !== id),
      }));
      setSelectedCharacterId((current) => (current === id ? null : current));
    },
    saveRelationship: (relationship) =>
      patchProject((current) => ({
        ...current,
        relationships: current.relationships.some((item) => item.id === relationship.id)
          ? current.relationships.map((item) => (item.id === relationship.id ? relationship : item))
          : [...current.relationships, relationship],
      })),
    addRelationship: () => {
      const [from, to] = project.characters;
      if (!from || !to) return;
      const relationship: Relationship = {
        id: uid("bond"),
        fromId: from.id,
        toId: to.id === from.id ? project.characters[1]?.id ?? from.id : to.id,
        kind: project.bondKinds[0]?.id ?? "friend",
        note: "",
      };
      patchProject((current) => ({ ...current, relationships: [...current.relationships, relationship] }));
    },
    deleteRelationship: (id) =>
      patchProject((current) => ({
        ...current,
        relationships: current.relationships.filter((item) => item.id !== id),
      })),
    addBondKind: () =>
      patchProject((current) => ({
        ...current,
        bondKinds: [...current.bondKinds, { id: uid("kind"), name: "New bond" }],
      })),
    renameBondKind: (id, name) =>
      patchProject((current) => ({
        ...current,
        bondKinds: current.bondKinds.map((kind) => (kind.id === id ? { ...kind, name } : kind)),
      })),
    removeBondKind: (id) =>
      patchProject((current) => {
        if (current.bondKinds.length <= 1) return current;
        const bondKinds = current.bondKinds.filter((kind) => kind.id !== id);
        const fallback = bondKinds[0].id;
        return {
          ...current,
          bondKinds,
          relationships: current.relationships.map((bond) => (bond.kind === id ? { ...bond, kind: fallback } : bond)),
        };
      }),
    saveLore: (entry) =>
      patchProject((current) => ({
        ...current,
        lore: current.lore.map((item) => (item.id === entry.id ? entry : item)),
      })),
    addLore: () => {
      const entry: LoreEntry = {
        id: uid("lore"),
        title: "New note",
        category: project.categories[0] ?? "Places",
        summary: "",
        body: "",
        image: "",
      };
      setSelectedLoreId(entry.id);
      setView("lore");
      patchProject((current) => ({ ...current, lore: [...current.lore, entry] }));
    },
    deleteLore: (id) => {
      patchProject((current) => ({ ...current, lore: current.lore.filter((item) => item.id !== id) }));
      setSelectedLoreId((current) => (current === id ? null : current));
    },
    saveEvent: (event) =>
      patchProject((current) => ({
        ...current,
        events: current.events.some((item) => item.id === event.id)
          ? current.events.map((item) => (item.id === event.id ? event : item))
          : [...current.events, event],
      })),
    addEvent: (partial) => {
      const event: ThreadEvent = {
        id: uid("event"),
        title: "New event",
        summary: "",
        monthIndex: project.calendar.now.monthIndex,
        day: project.calendar.now.day,
        year: project.calendar.now.year,
        characterIds: [],
        ...partial,
      };
      setSelectedEventId(event.id);
      setView("threads");
      patchProject((current) => ({ ...current, events: [...current.events, event] }));
    },
    addMonth: () =>
      patchProject((current) => ({
        ...current,
        months: [...current.months, { id: uid("month"), name: "New month", days: 30 }],
        calendar: { ...current.calendar, preset: "custom" },
      })),
    updateMonth: (index, patch) =>
      patchProject((current) => {
        const months = current.months.map((month, i) => (i === index ? { ...month, ...patch, id: month.id } : month));
        const next = remapMonths(current, months);
        return { ...next, calendar: { ...next.calendar, preset: "custom" } };
      }),
    removeMonth: (index) =>
      patchProject((current) => {
        if (current.months.length <= 1) return current;
        const next = remapMonths(current, current.months.filter((_, i) => i !== index));
        return { ...next, calendar: { ...next.calendar, preset: "custom" } };
      }),
    moveMonth: (index, delta) =>
      patchProject((current) => {
        const target = index + delta;
        if (target < 0 || target >= current.months.length) return current;
        const months = [...current.months];
        [months[index], months[target]] = [months[target], months[index]];
        const next = remapMonths(current, months);
        return { ...next, calendar: { ...next.calendar, preset: "custom" } };
      }),
    setCalendar: (patch) =>
      patchProject((current) => {
        const calendar = { ...current.calendar, ...patch };
        if (!("preset" in patch)) calendar.preset = "custom";
        const r = reckon(current.months, calendar);
        calendar.now = r.clamp(calendar.now);
        calendar.weekStart = Math.min(calendar.weekStart, Math.max(0, calendar.weekdays.length - 1));
        calendar.epochWeekday = Math.min(calendar.epochWeekday, Math.max(0, calendar.weekdays.length - 1));
        return { ...current, calendar };
      }),
    applyCalendarPreset: (id) =>
      patchProject((current) => {
        const { months, calendar } = buildPreset(id, id === "blank" ? undefined : current.calendar.preset === "custom" ? undefined : current.calendar.now);
        const r = reckon(months, calendar);
        const events = current.events.map((event) => {
          const date = r.clamp({ year: event.year, monthIndex: event.monthIndex, day: event.day });
          return { ...event, monthIndex: date.monthIndex, day: date.day };
        });
        return { ...current, months, calendar, events };
      }),
    addVisionCard: (card) =>
      patchProject((current) => ({
        ...current,
        vision: { ...current.vision, cards: [...current.vision.cards, { ...card, id: uid("card") }] },
      })),
    moveVisionCard: (id, x, y) =>
      patchProject((current) => ({
        ...current,
        vision: {
          ...current.vision,
          cards: current.vision.cards.map((card) => (card.id === id ? { ...card, x, y } : card)),
        },
      })),
    updateVisionCard: (id, patch) =>
      patchProject((current) => ({
        ...current,
        vision: {
          ...current.vision,
          cards: current.vision.cards.map((card) => (card.id === id ? { ...card, ...patch, id: card.id } : card)),
        },
      })),
    deleteVisionCard: (id) =>
      patchProject((current) => {
        const card = current.vision.cards.find((item) => item.id === id);
        const stored = card ? trackId(card.media) : null;
        if (stored) void deleteTrack(stored);
        return {
          ...current,
          vision: {
            cards: current.vision.cards.filter((item) => item.id !== id),
            edges: current.vision.edges.filter((edge) => edge.fromId !== id && edge.toId !== id),
          },
        };
      }),
    addVisionEdge: (fromId, toId) =>
      patchProject((current) => {
        if (fromId === toId) return current;
        if (current.vision.edges.some((edge) => edge.fromId === fromId && edge.toId === toId)) return current;
        const edge: VisionEdge = { id: uid("link"), fromId, toId, label: "" };
        return { ...current, vision: { ...current.vision, edges: [...current.vision.edges, edge] } };
      }),
    updateVisionEdge: (edge) =>
      patchProject((current) => ({
        ...current,
        vision: {
          ...current.vision,
          edges: current.vision.edges.map((item) => (item.id === edge.id ? edge : item)),
        },
      })),
    deleteVisionEdge: (id) =>
      patchProject((current) => ({
        ...current,
        vision: { ...current.vision, edges: current.vision.edges.filter((edge) => edge.id !== id) },
      })),
    deleteEvent: (id) =>
      patchProject((current) => ({ ...current, events: current.events.filter((item) => item.id !== id) })),
    saveScene: (scene, opts) => {
      const previous = projectRef.current.scenes.find((item) => item.id === scene.id);
      if (previous && previous.body !== scene.body && !opts?.skipHistory) {
        const now = Date.now();
        const burst = editBurstRef.current;
        const freshBurst = !burst || burst.sceneId !== scene.id || now - burst.at > SCENE_EDIT_BURST_MS;
        if (opts?.checkpoint || freshBurst) {
          pushSceneRevision(scene.id, previous.body);
        }
        editBurstRef.current = { sceneId: scene.id, at: now };
      }
      patchProject((current) => {
        const prior = current.scenes.find((item) => item.id === scene.id);
        const before = prior ? countWords(prior.body) : 0;
        const nextScenes = current.scenes.map((item) => (item.id === scene.id ? scene : item));
        return noteWords(before, countWords(scene.body), { ...current, scenes: nextScenes });
      });
    },
    undoSceneBody: () => {
      const id = selectedSceneIdRef.current;
      if (!id) return;
      const stack = sceneHistoryRef.current[id] ?? [];
      if (!stack.length) return;
      const body = stack[stack.length - 1];
      sceneHistoryRef.current = {
        ...sceneHistoryRef.current,
        [id]: stack.slice(0, -1),
      };
      setHistoryTick((tick) => tick + 1);
      editBurstRef.current = null;
      patchProject((current) => {
        const prior = current.scenes.find((item) => item.id === id);
        if (!prior) return current;
        const before = countWords(prior.body);
        const next = { ...prior, body };
        const nextScenes = current.scenes.map((item) => (item.id === id ? next : item));
        return noteWords(before, countWords(body), { ...current, scenes: nextScenes });
      });
    },
    sceneUndoDepth,
    addChapter: () =>
      patchProject((current) => ({
        ...current,
        chapters: [
          ...current.chapters,
          { id: uid("chapter"), title: `Chapter ${current.chapters.length + 1}`, order: current.chapters.length },
        ],
      })),
    addScene: (chapterId) => {
      const scene: Scene = {
        id: uid("scene"),
        chapterId,
        title: "New scene",
        status: "Draft",
        body: "",
        goal: 500,
        characterIds: [],
        loreIds: [],
        order: project.scenes.filter((item) => item.chapterId === chapterId).length,
      };
      setSelectedSceneId(scene.id);
      setView("hearth");
      patchProject((current) => ({ ...current, scenes: [...current.scenes, scene] }));
    },
    setAsideScene: (id) => {
      clearSceneHistory(id);
      const remaining = projectRef.current.scenes.filter((item) => item.id !== id);
      const nextSelected = selectedSceneIdRef.current === id ? (remaining[0]?.id ?? null) : selectedSceneIdRef.current;
      patchProject((current) => {
        const scene = current.scenes.find((item) => item.id === id);
        if (!scene) return current;
        const chapterTitle = current.chapters.find((chapter) => chapter.id === scene.chapterId)?.title || "Chapter";
        const entry: TrashedScene = {
          scene,
          chapterTitle,
          trashedAt: new Date().toISOString(),
        };
        return {
          ...current,
          scenes: current.scenes.filter((item) => item.id !== id),
          trash: [entry, ...(current.trash ?? []).filter((item) => item.scene.id !== id)],
        };
      });
      setSelectedSceneId(nextSelected);
    },
    recoverScene: (id) => {
      let recoveredId: string | null = null;
      patchProject((current) => {
        const entry = (current.trash ?? []).find((item) => item.scene.id === id);
        if (!entry) return current;
        let chapters = current.chapters;
        let chapterId = entry.scene.chapterId;
        if (!chapters.some((chapter) => chapter.id === chapterId)) {
          if (!chapters.length) {
            const chapter = { id: uid("chapter"), title: entry.chapterTitle || "Chapter 1", order: 0 };
            chapters = [chapter];
            chapterId = chapter.id;
          } else {
            chapterId = chapters.slice().sort((a, b) => a.order - b.order)[0].id;
          }
        }
        const order = current.scenes.filter((scene) => scene.chapterId === chapterId).length;
        const scene: Scene = { ...entry.scene, chapterId, order };
        recoveredId = scene.id;
        return {
          ...current,
          chapters,
          scenes: [...current.scenes, scene],
          trash: (current.trash ?? []).filter((item) => item.scene.id !== id),
        };
      });
      if (recoveredId) {
        setSelectedSceneId(recoveredId);
        setView("hearth");
      }
    },
    discardTrashedScene: (id) => {
      clearSceneHistory(id);
      patchProject((current) => ({
        ...current,
        trash: (current.trash ?? []).filter((item) => item.scene.id !== id),
      }));
    },
    emptyTrash: () => {
      for (const entry of projectRef.current.trash ?? []) clearSceneHistory(entry.scene.id);
      patchProject((current) => ({ ...current, trash: [] }));
    },
    replaceProject: (next) => {
      clearSceneHistory();
      const normalized = normalizeProject(next);
      setProject(normalized);
      setSelectedCharacterId(next.characters[0]?.id ?? null);
      setSelectedLoreId(next.lore[0]?.id ?? null);
      setSelectedSceneId(normalized.scenes[0]?.id ?? null);
      setSelectedEventId(normalized.events[0]?.id ?? null);
    },
    resetSeed: () => {
      clearSceneHistory();
      const next = normalizeProject(createSeed());
      setProject(next);
      setSelectedCharacterId(next.characters[0]?.id ?? null);
      setSelectedLoreId(next.lore[0]?.id ?? null);
      setSelectedSceneId(next.scenes[0]?.id ?? null);
      setSelectedEventId(next.events[0]?.id ?? null);
    },
    bookId,
    books,
    openBook: (id) => {
      const next = readBook(id);
      if (!next) return;
      clearSceneHistory();
      setVaultBook(id);
      setBookId(id);
      setProject(next);
      applyOpen(next, { setSelectedCharacterId, setSelectedLoreId, setSelectedSceneId, setSelectedEventId });
      setView("home");
      setFocusMode(false);
    },
    addBook: (title) => {
      const id = uid("book");
      const next = blankProject(title);
      const book: BookMeta = { id, title: next.name, tagline: next.tagline, spine: books.length };
      clearSceneHistory();
      setBooks((current) => [...current, book]);
      setVaultBook(id);
      setBookId(id);
      setProject(next);
      applyOpen(next, { setSelectedCharacterId, setSelectedLoreId, setSelectedSceneId, setSelectedEventId });
      setView("home");
      setFocusMode(false);
    },
    removeBook: (id) => {
      const book = books.find((item) => item.id === id);
      if (!book) return;
      if (!confirm(`Take “${book.title}” off the shelf? This removes it from StoryMaker on this computer.`)) return;
      localStorage.removeItem(bookKey(id));
      const rest = books.filter((item) => item.id !== id);
      setBooks(rest);
      if (id !== bookId) return;
      const fallback = rest[0];
      if (!fallback) {
        setBookId("");
        setView("home");
        return;
      }
      const next = readBook(fallback.id);
      if (!next) {
        setBookId("");
        setView("home");
        return;
      }
      setVaultBook(fallback.id);
      setBookId(fallback.id);
      setProject(next);
      applyOpen(next, { setSelectedCharacterId, setSelectedLoreId, setSelectedSceneId, setSelectedEventId });
    },
  };

  return <StoryContext.Provider value={api}>{children}</StoryContext.Provider>;
}

export function useStory(): StoryApi {
  const value = useContext(StoryContext);
  if (!value) throw new Error("useStory must be used inside StoryProvider");
  return value;
}
