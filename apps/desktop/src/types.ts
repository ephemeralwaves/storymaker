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
  | "mood"
  | "bonds"
  | "vision"
  | "studio"
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
  year: number;
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

export interface MoodCard {
  id: string;
  kind: "color" | "note" | "image";
  title: string;
  value: string;
}

export interface CustomPlugin {
  id: string;
  name: string;
  template: string;
}

export type ManuscriptFont = "serif" | "sans" | "clear";

export interface Comfort {
  theme: ThemeId;
  fontScale: number;
  manuscriptScale: number;
  manuscriptFont: ManuscriptFont;
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
  eraName: string;
  year: number;
  months: CalendarMonth[];
  categories: string[];
  characters: Character[];
  relationships: Relationship[];
  bondKinds: BondKind[];
  lore: LoreEntry[];
  events: ThreadEvent[];
  chapters: Chapter[];
  scenes: Scene[];
  mood: MoodCard[];
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
