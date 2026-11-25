export type ThemeId = "hearth" | "moss" | "harbor" | "blossom" | "candlelit" | "plum" | "ember" | "pine" | "wool" | "rainlamp";

export type AmbienceId = "off" | "rain" | "fire" | "library" | "forest" | "cafe";

export type Role = "Protagonist" | "Antagonist" | "Supporting" | "Mentor" | "Love interest";

export type SceneStatus = "Draft" | "Revised" | "Final";

export type ViewId =
  | "home"
  | "people"
  | "lore"
  | "threads"
  | "calendar"
  | "hearth"
  | "storybook"
  | "bonds"
  | "vision"
  | "settings";

export interface Character {
  id: string;
  name: string;
  role: Role;
  age: string;
  origin: string;
  gift: string;
  status: string;
  personality: string;
  summary: string;
  backstory: string;
  habits: string;
  fears: string;
  image: string;
  x: number;
  y: number;
}

export interface BondKind {
  id: string;
  name: string;
}

export interface Relationship {
  id: string;
  fromId: string;
  toId: string;
  kind: string;
  note: string;
}

export interface LoreEntry {
  id: string;
  title: string;
  category: string;
  summary: string;
  body: string;
  image: string;
}

export interface ThreadEvent {
  id: string;
  title: string;
  summary: string;
  monthIndex: number;
  day: number;
  /** Continuous timeline year (see CalendarEra). */
  year: number;
  /** True while the thread waits in the Calendar's "Not on the calendar yet" list. */
  undated?: boolean;
  characterIds: string[];
}

export interface Chapter {
  id: string;
  title: string;
  order: number;
}

export interface Scene {
  id: string;
  chapterId: string;
  title: string;
  status: SceneStatus;
  body: string;
  goal: number;
  characterIds: string[];
  loreIds: string[];
  order: number;
}

export interface TrashedScene {
  scene: Scene;
  chapterTitle: string;
  trashedAt: string;
}

export interface CustomPlugin {
  id: string;
  name: string;
  template: string;
}

export type ManuscriptFont = "serif" | "sans" | "clear";

export type ReaderSkin = "gilded" | "illuminated" | "glow";

export interface Comfort {
  theme: ThemeId;
  fontScale: number;
  manuscriptScale: number;
  manuscriptFont: ManuscriptFont;
  readerSkin: ReaderSkin;
  reducedMotion: boolean;
  warmLight: boolean;
  clearType: boolean;
  ambience: AmbienceId;
  ambienceVolume: number;
  ollamaUrl: string;
  ollamaModel: string;
  mcpUrl: string;
  customPlugins: CustomPlugin[];
}

export interface CalendarMonth {
  id: string;
  name: string;
  days: number;
  /** Abbreviation for short dates, e.g. "Nov" or "พ.ย.". Falls back to the first three letters. */
  short?: string;
}

/** A way of counting years. Year numbers on threads are continuous timeline years; eras only change how they read. */
export interface CalendarEra {
  id: string;
  name: string;
  short: string;
  /** Whether the short form is written before the number ("พ.ศ. 2569") or after it ("2026 CE"). */
  place: "before" | "after";
  /** Timeline year that is year 1 of this era. Ignored for the one era that counts down. */
  start: number;
  counts: "up" | "down";
}

export interface CalendarHoliday {
  id: string;
  name: string;
  monthIndex: number;
  day: number;
  kind: "holiday" | "season";
}

export interface CalendarDate {
  year: number;
  monthIndex: number;
  day: number;
}

export type LeapKind = "gregorian" | "every" | "none";
export type DateFormat = "long" | "us" | "short-era" | "numeric";
export type CalendarPresetId = "gregorian" | "renamed" | "thai" | "blank" | "custom";

export interface CalendarSettings {
  preset: CalendarPresetId;
  /** Month that gains a day in leap years, or null for no leap day. */
  leapMonthId: string | null;
  leap: { kind: LeapKind; every: number };
  /** Day names; their count is the length of the week. Empty means days are not named. */
  weekdays: string[];
  weekStart: number;
  /** Weekday index of timeline year 1, first month, day 1. */
  epochWeekday: number;
  eras: CalendarEra[];
  showEra: boolean;
  /** "Now" in the story: where the Calendar opens and what Home and the Storybook use. */
  now: CalendarDate;
  holidays: CalendarHoliday[];
  moon: { on: boolean; name: string; cycle: number; newMoon: CalendarDate };
  format: DateFormat;
}

export type VisionKind = "note" | "person" | "lore" | "thread" | "scene" | "photo" | "music";

export interface VisionCard {
  id: string;
  kind: VisionKind;
  refId: string;
  x: number;
  y: number;
  note: string;
  media: string;
}

export interface VisionEdge {
  id: string;
  fromId: string;
  toId: string;
  label: string;
}

export interface VisionBoard {
  cards: VisionCard[];
  edges: VisionEdge[];
}

export interface Project {
  id: string;
  name: string;
  tagline: string;
  months: CalendarMonth[];
  calendar: CalendarSettings;
  categories: string[];
  characters: Character[];
  relationships: Relationship[];
  bondKinds: BondKind[];
  lore: LoreEntry[];
  events: ThreadEvent[];
  chapters: Chapter[];
  scenes: Scene[];
  trash: TrashedScene[];
  vision: VisionBoard;
  comfort: Comfort;
  wordsByDay: Record<string, number>;
  streak: number;
  lastWriteDay: string | null;
  lampLit: boolean;
}

export const THEMES: { id: ThemeId; name: string; blurb: string }[] = [
  { id: "hearth", name: "Hearth Parchment", blurb: "Warm paper and ember orange" },
  { id: "moss", name: "Moss and Lantern", blurb: "Soft greens and cream" },
  { id: "harbor", name: "Harbor Ink", blurb: "Fog blue and brass" },
  { id: "blossom", name: "Blossom Tea", blurb: "Petal pink and cocoa" },
  { id: "candlelit", name: "Candlelit Study", blurb: "Dark wood and honey light" },
  { id: "plum", name: "Royal Plum", blurb: "Evening violet and gold" },
  { id: "ember", name: "Ember Room", blurb: "Coals, copper, and a low red glow" },
  { id: "pine", name: "Pine Cabin", blurb: "Night green and a honey lamp" },
  { id: "wool", name: "Wool Dusk", blurb: "Dusty rose, cocoa, and knit-warm dark" },
  { id: "rainlamp", name: "Rain Lamp", blurb: "Slate evening and brass light" },
];

export const AMBIENCES: { id: AmbienceId; name: string }[] = [
  { id: "off", name: "Quiet" },
  { id: "rain", name: "Rain on the window" },
  { id: "fire", name: "Hearth fire" },
  { id: "library", name: "Quiet library" },
  { id: "forest", name: "Night forest" },
  { id: "cafe", name: "Late cafe" },
];

export const ROLES: Role[] = ["Protagonist", "Antagonist", "Supporting", "Mentor", "Love interest"];

export const DEFAULT_BOND_KINDS: BondKind[] = [
  { id: "friend", name: "Friend" },
  { id: "ally", name: "Ally" },
  { id: "family", name: "Family" },
  { id: "enemy", name: "Enemy" },
  { id: "mentor", name: "Mentor" },
  { id: "student", name: "Student" },
  { id: "lover", name: "Lover" },
];

export const SCENE_STATUSES: SceneStatus[] = ["Draft", "Revised", "Final"];
