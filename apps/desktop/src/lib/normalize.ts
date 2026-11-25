import { createSeed } from "../seed";
import { DEFAULT_BOND_KINDS, type BondKind, type CalendarMonth, type Character, type Comfort, type LoreEntry, type ManuscriptFont, type Project, type VisionBoard, type VisionKind } from "../types";

const VISION_KINDS: VisionKind[] = ["note", "person", "lore", "thread", "scene", "photo", "music"];

const emptyVision = (): VisionBoard => ({ cards: [], edges: [] });

function normalizeVision(vision: VisionBoard | undefined): VisionBoard {
  const cards = (vision?.cards ?? []).map((card) => ({
    ...card,
    kind: VISION_KINDS.includes(card.kind) ? card.kind : "note",
    refId: card.refId ?? "",
    note: card.note ?? "",
    media: card.media ?? "",
    x: Number.isFinite(card.x) ? card.x : 80,
    y: Number.isFinite(card.y) ? card.y : 80,
  }));
  return { cards, edges: vision?.edges ?? [] };
}

const MANUSCRIPT_FONTS: ManuscriptFont[] = ["serif", "sans", "clear"];

function normalizeComfort(comfort: Comfort | undefined): Comfort {
  const base = createSeed().comfort;
  const scale = Number(comfort?.manuscriptScale);
  const font = comfort?.manuscriptFont;
  return {
    ...base,
    ...comfort,
    customPlugins: comfort?.customPlugins ?? base.customPlugins,
    manuscriptScale: Number.isFinite(scale) ? Math.min(1.6, Math.max(0.7, scale)) : base.manuscriptScale,
    manuscriptFont: MANUSCRIPT_FONTS.includes(font as ManuscriptFont) ? (font as ManuscriptFont) : "serif",
  };
}

export function normalizeProject(project: Project): Project {
  const months: CalendarMonth[] = (project.months ?? []).map((month, index) => ({
    id: month.id || `month-${index}`,
    name: month.name || `Month ${index + 1}`,
    days: Math.max(1, Number(month.days) || 28),
  }));
  const characters: Character[] = (project.characters ?? []).map((character, index) => ({
    ...character,
    image: character.image ?? "",
    x: Number.isFinite(character.x) ? character.x : 80 + (index % 3) * 240,
    y: Number.isFinite(character.y) ? character.y : 80 + Math.floor(index / 3) * 180,
  }));
  const bondKinds: BondKind[] = (project.bondKinds?.length ? project.bondKinds : DEFAULT_BOND_KINDS).map((kind, index) => ({
    id: kind.id || `kind-${index}`,
    name: kind.name?.trim() || "Bond",
  }));
  for (const bond of project.relationships ?? []) {
    const known = bondKinds.some((kind) => kind.id === bond.kind || kind.name === bond.kind);
    if (bond.kind && !known) bondKinds.push({ id: `kind-${bondKinds.length}`, name: bond.kind });
  }
  const relationships = (project.relationships ?? []).map((bond) => {
    const match = bondKinds.find((kind) => kind.id === bond.kind || kind.name === bond.kind);
    return { ...bond, kind: match?.id ?? bondKinds[0].id };
  });
  const lore: LoreEntry[] = (project.lore ?? []).map((entry) => ({ ...entry, image: entry.image ?? "" }));
  const storedVision = normalizeVision(project.vision);
  return {
    ...project,
    comfort: normalizeComfort(project.comfort),
    months: months.length ? months : [{ id: "month-0", name: "Firstmonth", days: 28 }],
    characters,
    lore,
    bondKinds,
    relationships,
    vision:
      storedVision.cards.length
        ? storedVision
        : project.id === "lantern-tide"
          ? normalizeVision(createSeed().vision)
          : storedVision.edges.length
            ? storedVision
            : emptyVision(),
  };
}
