import { renderNote, splitFrontmatter, wikiTarget, yamlList, yamlNumber, yamlString, type Yaml } from "./markdown";
import { legacyCalendar, reckonProject } from "./calendar";
import { normalizeProject } from "./normalize";
import {
  DEFAULT_BOND_KINDS,
  ROLES,
  SCENE_STATUSES,
  type BondKind,
  type CalendarMonth,
  type Character,
  type Comfort,
  type LoreEntry,
  type Project,
  type Relationship,
  type Role,
  type Scene,
  type SceneStatus,
  type ThreadEvent,
  type VisionBoard,
  type VisionCard,
  type VisionKind,
} from "../types";
import { uid } from "./util";

export interface VaultFile {
  path: string;
  text?: string;
  bytes?: Uint8Array;
}

export interface AudioBits {
  bytes: Uint8Array;
  mime: string;
}

export interface ImportedTrack {
  id: string;
  bytes: Uint8Array;
  mime: string;
}

const TEXT_EXT = new Set(["md", "markdown", "txt", "canvas", "json"]);
const AUDIO_EXT: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  flac: "audio/flac",
};
const IMAGE_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export function projectToVault(project: Project, audio: Map<string, AudioBits> = new Map()): VaultFile[] {
  const files: VaultFile[] = [];
  const used = new Set<string>();
  const pagePath = new Map<string, string>();

  const addText = (path: string, text: string) => {
    files.push({ path, text });
    used.add(path);
  };

  for (const person of project.characters) {
    const path = uniquePath(used, `People/${fileName(person.name)}.md`);
    pagePath.set(`person:${person.id}`, path);
    const image = embedImage(files, used, person.name, person.image);
    addText(
      path,
      renderNote(
        {
          storymaker: "person",
          id: person.id,
          role: person.role,
          age: person.age,
          origin: person.origin,
          gift: person.gift,
          status: person.status,
          personality: person.personality,
          x: person.x,
          y: person.y,
          tags: ["person", slug(person.role)],
        },
        [image, person.summary, section("Backstory", person.backstory), section("Habits", person.habits), section("Afraid of losing", person.fears)]
          .filter(Boolean)
          .join("\n\n"),
      ),
    );
  }

  for (const entry of project.lore) {
    const path = uniquePath(used, `Lore/${fileName(entry.category)}/${fileName(entry.title)}.md`);
    pagePath.set(`lore:${entry.id}`, path);
    const image = embedImage(files, used, entry.title, entry.image);
    addText(
      path,
      renderNote(
        {
          storymaker: "lore",
          id: entry.id,
          category: entry.category,
          tags: ["lore", slug(entry.category)],
        },
        [image, entry.summary, section("Note", entry.body)].filter(Boolean).join("\n\n"),
      ),
    );
  }

  for (const chapter of [...project.chapters].sort((a, b) => a.order - b.order)) {
    const scenes = project.scenes.filter((scene) => scene.chapterId === chapter.id).sort((a, b) => a.order - b.order);
    for (const scene of scenes) {
      const path = uniquePath(used, `Scenes/${fileName(chapter.title)}/${fileName(scene.title)}.md`);
      pagePath.set(`scene:${scene.id}`, path);
      addText(
        path,
        renderNote(
          {
            storymaker: "scene",
            id: scene.id,
            chapterId: chapter.id,
            chapterOrder: chapter.order,
            status: scene.status,
            goal: scene.goal,
            order: scene.order,
            characters: scene.characterIds.map((id) => wiki(nameOf(project, "person", id))),
            lore: scene.loreIds.map((id) => wiki(nameOf(project, "lore", id))),
            tags: ["scene"],
          },
          scene.body,
        ),
      );
    }
  }

  for (const event of project.events) {
    const path = uniquePath(used, `Threads/${fileName(event.title)}.md`);
    pagePath.set(`thread:${event.id}`, path);
    const month = project.months[event.monthIndex]?.name ?? "";
    addText(
      path,
      renderNote(
        {
          storymaker: "thread",
          id: event.id,
          year: event.year,
          month,
          day: event.day,
          date: event.undated ? "" : reckonProject(project).formatDate({ year: event.year, monthIndex: event.monthIndex, day: event.day }),
          ...(event.undated ? { undated: true } : {}),
          characters: event.characterIds.map((id) => wiki(nameOf(project, "person", id))),
          tags: ["thread"],
        },
        event.summary,
      ),
    );
  }

  const kindName = new Map(project.bondKinds.map((kind) => [kind.id, kind.name]));
  const bonds = [
    "## Kinds",
    ...project.bondKinds.map((kind) => `- ${kind.id} | ${kind.name}`),
    "",
    "## Bonds",
    ...project.relationships.map((bond) => {
      const from = nameOf(project, "person", bond.fromId);
      const to = nameOf(project, "person", bond.toId);
      return `- ${wiki(from)} | ${kindName.get(bond.kind) ?? bond.kind} | ${wiki(to)} | ${bond.note}`;
    }),
  ].join("\n");
  addText("Bonds.md", renderNote({ storymaker: "bonds", tags: ["bonds"] }, bonds));

  const reckoner = reckonProject(project);
  const months = project.months.map((month) => `- ${month.name} (${month.days})`).join("\n");
  const firstEra = project.calendar.eras.find((era) => era.counts === "up") ?? project.calendar.eras[0];
  const setup = JSON.stringify({ months: project.months, calendar: project.calendar }, null, 2);
  addText(
    "Calendar.md",
    renderNote(
      {
        storymaker: "calendar",
        era: firstEra?.name ?? "",
        year: reckoner.eraFor(project.calendar.now.year).shown,
        now: reckoner.formatDate(project.calendar.now),
        tags: ["calendar"],
      },
      `${months}\n\n## Setup\n\nStoryMaker reads this block to restore eras, weekdays, leap years, holidays and moons.\n\n\`\`\`json\n${setup}\n\`\`\``,
    ),
  );

  const peopleLinks = project.characters.map((person) => `- ${wiki(person.name)}`).join("\n");
  const loreLinks = project.lore.map((entry) => `- ${wiki(entry.title)}`).join("\n");
  addText(
    "Story.md",
    renderNote(
      { storymaker: "story", id: project.id, tags: ["story"] },
      [`# ${project.name}`, "", project.tagline, "", "## People", peopleLinks, "", "## Lore", loreLinks].join("\n"),
    ),
  );

  addText("Vision.canvas", JSON.stringify(canvasFrom(project, pagePath, files, used, audio), null, 2));
  addText(
    ".storymaker/comfort.json",
    JSON.stringify(
      {
        comfort: project.comfort,
        wordsByDay: project.wordsByDay,
        streak: project.streak,
        lastWriteDay: project.lastWriteDay,
        lampLit: project.lampLit,
        trash: project.trash ?? [],
      },
      null,
      2,
    ),
  );
  return files;
}

export function vaultToProject(files: VaultFile[], base: Project): { project: Project; tracks: ImportedTrack[] } {
  const byPath = new Map(files.map((file) => [normalizePath(file.path), file]));
  const notes = files.filter((file) => normalizePath(file.path).toLowerCase().endsWith(".md"));
  const full = notes.some((file) => {
    const path = normalizePath(file.path);
    return path === "Story.md" && yamlString(splitFrontmatter(file.text ?? "").data.storymaker) === "story";
  });
  const next: Project = structuredClone(base);
  if (full) {
    next.characters = [];
    next.lore = [];
    next.scenes = [];
    next.chapters = [];
    next.events = [];
    next.relationships = [];
    next.bondKinds = [];
  }

  const seen = {
    person: false,
    lore: false,
    scene: false,
    thread: false,
  };
  const chapters = new Map<string, { id: string; title: string; order: number }>();
  const monthNames = new Map<string, string>();
  const tracks: ImportedTrack[] = [];
  let bondsBody = "";
  let sawBonds = false;

  for (const file of notes) {
    const path = normalizePath(file.path);
    if (path.startsWith(".obsidian/") || path.startsWith(".storymaker/")) continue;
    const { data, body } = splitFrontmatter(file.text ?? "");
    const kind = yamlString(data.storymaker) || kindFromPath(path);
    if (kind === "story" && path === "Story.md") {
      next.id = yamlString(data.id, next.id);
      const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
      if (title) next.name = title;
      const tagline = body
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith("#") && !line.startsWith("- "));
      if (tagline) next.tagline = tagline;
      continue;
    }
    if (kind === "calendar" && path === "Calendar.md") {
      const setup = calendarSetupFrom(body);
      if (setup) {
        next.months = setup.months;
        next.calendar = setup.calendar;
      } else {
        const months = monthsFrom(body);
        if (months.length) next.months = months;
        next.calendar = legacyCalendar(yamlString(data.era, "Year"), yamlNumber(data.year, 1));
      }
      continue;
    }
    if (kind === "bonds" && path === "Bonds.md") {
      bondsBody = body;
      sawBonds = true;
      continue;
    }
    if (kind === "person" && path.startsWith("People/")) {
      const person = personFrom(path, data, body, byPath);
      if (full) {
        if (!seen.person) next.characters = [];
        seen.person = true;
        next.characters.push(person);
      } else upsert(next.characters, person, (item) => item.id === person.id || item.name.toLowerCase() === person.name.toLowerCase());
      continue;
    }
    if (kind === "lore" && path.startsWith("Lore/")) {
      const entry = loreFrom(path, data, body, byPath);
      if (full) {
        if (!seen.lore) next.lore = [];
        seen.lore = true;
        next.lore.push(entry);
      } else upsert(next.lore, entry, (item) => item.id === entry.id || item.title.toLowerCase() === entry.title.toLowerCase());
      continue;
    }
    if (kind === "scene" && path.startsWith("Scenes/")) {
      if (!seen.scene && !full) {
        next.scenes = [];
        next.chapters = [];
      }
      seen.scene = true;
      const scene = sceneFrom(path, data, body);
      next.scenes.push(scene.scene);
      const chapter = chapters.get(scene.chapter.id) ?? scene.chapter;
      chapter.order = Math.min(chapter.order, scene.chapter.order);
      chapters.set(chapter.id, chapter);
      continue;
    }
    if (kind === "thread" && path.startsWith("Threads/")) {
      if (!seen.thread && !full) next.events = [];
      seen.thread = true;
      const event = threadFrom(path, data, body);
      monthNames.set(event.event.id, event.monthName);
      next.events.push(event.event);
      continue;
    }
    if (kind === "mood" || path.startsWith("Mood/")) continue;
    const loose = loreFrom(path, data, body, byPath);
    loose.category = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "Notes";
    upsert(next.lore, loose, (item) => item.id === loose.id || item.title.toLowerCase() === loose.title.toLowerCase());
  }

  if (sawBonds) {
    const parsed = bondsFrom(bondsBody, next.characters);
    if (parsed.kinds.length) next.bondKinds = parsed.kinds;
    next.relationships = parsed.relationships;
  }

  if (seen.scene || full) next.chapters = [...chapters.values()].sort((a, b) => a.order - b.order);
  for (const event of next.events) {
    const monthName = monthNames.get(event.id);
    if (!monthName) continue;
    const index = next.months.findIndex((month) => month.name.toLowerCase() === monthName.toLowerCase());
    event.monthIndex = index >= 0 ? index : 0;
  }
  linkNames(next);

  const canvas = byPath.get("Vision.canvas");
  if (canvas?.text) {
    const built = visionFrom(canvas.text, next, byPath, tracks);
    if (built) next.vision = built;
  }

  const comfortFile = byPath.get(".storymaker/comfort.json");
  if (comfortFile?.text) {
    applyComfort(next, comfortFile.text);
  }
  if (!next.bondKinds.length) next.bondKinds = DEFAULT_BOND_KINDS.map((kind) => ({ ...kind }));
  if (!next.months.length) next.months = [{ id: "month-0", name: "Firstmonth", days: 28 }];
  return { project: normalizeProject(next), tracks };
}

export function vaultFilesFromBytes(entries: { path: string; bytes: Uint8Array }[]): VaultFile[] {
  const decoder = new TextDecoder();
  const files = entries.map((entry) => {
    const path = normalizePath(entry.path);
    const ext = extension(path);
    if (TEXT_EXT.has(ext)) return { path, text: decoder.decode(entry.bytes) };
    return { path, bytes: entry.bytes };
  });
  return hoistVaultRoot(files);
}

export function hoistVaultRoot(files: VaultFile[]): VaultFile[] {
  const paths = files.map((file) => normalizePath(file.path));
  const tops = new Set(paths.filter(Boolean).map((path) => path.split("/")[0]));
  const known = new Set(["People", "Lore", "Scenes", "Threads", "Mood", "attachments", ".storymaker", "Story.md", "Bonds.md", "Calendar.md", "Vision.canvas"]);
  if (tops.size === 1) {
    const top = [...tops][0];
    if (!known.has(top)) {
      return files.map((file) => ({ ...file, path: normalizePath(file.path).split("/").slice(1).join("/") })).filter((file) => file.path);
    }
  }
  return files.map((file) => ({ ...file, path: normalizePath(file.path) }));
}

function personFrom(path: string, data: Record<string, Yaml>, body: string, files: Map<string, VaultFile>): Character {
  const image = readEmbed(body, files);
  const prose = stripEmbed(body);
  const marked = /^## (Backstory|Habits|Afraid of losing)\s*$/m.test(prose);
  const parts = marked ? splitSections(prose, ["Backstory", "Habits", "Afraid of losing"]) : { intro: "", sections: { Backstory: prose.trim(), Habits: "", "Afraid of losing": "" } };
  const role = yamlString(data.role, "Supporting");
  return {
    id: yamlString(data.id, slug(leaf(path)) || uid("person")),
    name: leaf(path),
    role: (ROLES.includes(role as Role) ? role : "Supporting") as Role,
    age: yamlString(data.age),
    origin: yamlString(data.origin),
    gift: yamlString(data.gift),
    status: yamlString(data.status),
    personality: yamlString(data.personality),
    summary: parts.intro,
    backstory: parts.sections.Backstory,
    habits: parts.sections.Habits,
    fears: parts.sections["Afraid of losing"],
    image: image ?? "",
    x: yamlNumber(data.x, 80),
    y: yamlNumber(data.y, 80),
  };
}

function loreFrom(path: string, data: Record<string, Yaml>, body: string, files: Map<string, VaultFile>): LoreEntry {
  const parts = path.split("/");
  const category = parts.length > 2 ? parts[1] : yamlString(data.category, "Notes");
  const prose = stripEmbed(body);
  const marked = /(^|\n)## Note\s*$/m.test(prose);
  const sections = marked ? splitSections(prose, ["Note"]) : { intro: "", sections: { Note: prose.trim() } };
  return {
    id: yamlString(data.id, slug(leaf(path)) || uid("lore")),
    title: leaf(path),
    category: yamlString(data.category, category),
    summary: sections.intro,
    body: sections.sections.Note,
    image: readEmbed(body, files) ?? "",
  };
}

function sceneFrom(path: string, data: Record<string, Yaml>, body: string): { scene: Scene; chapter: { id: string; title: string; order: number } } {
  const parts = path.split("/");
  const nested = parts.length > 2;
  const chapterTitle = nested ? parts[1] : "Notebook";
  const chapterId = yamlString(data.chapterId, slug(chapterTitle) || uid("chapter"));
  const status = yamlString(data.status, "Draft");
  return {
    chapter: { id: chapterId, title: chapterTitle, order: yamlNumber(data.chapterOrder, 0) },
    scene: {
      id: yamlString(data.id, slug(leaf(path)) || uid("scene")),
      chapterId,
      title: leaf(path),
      status: (SCENE_STATUSES.includes(status as SceneStatus) ? status : "Draft") as SceneStatus,
      body: body.trim(),
      goal: yamlNumber(data.goal, 500),
      characterIds: yamlList(data.characters),
      loreIds: yamlList(data.lore),
      order: yamlNumber(data.order, 0),
    },
  };
}

function threadFrom(path: string, data: Record<string, Yaml>, body: string): { event: ThreadEvent; monthName: string } {
  return {
    monthName: yamlString(data.month),
    event: {
      id: yamlString(data.id, slug(leaf(path)) || uid("event")),
      title: leaf(path),
      summary: body.trim(),
      monthIndex: 0,
      day: yamlNumber(data.day, 1),
      year: yamlNumber(data.year, 1),
      undated: data.undated === true || data.undated === "true" ? true : undefined,
      characterIds: yamlList(data.characters),
    },
  };
}

function linkNames(project: Project): void {
  const people = new Map(project.characters.map((person) => [person.name.toLowerCase(), person.id]));
  const lore = new Map(project.lore.map((entry) => [entry.title.toLowerCase(), entry.id]));
  const resolve = (token: string, table: Map<string, string>) => table.get(wikiTarget(token).toLowerCase()) ?? token;
  for (const scene of project.scenes) {
    scene.characterIds = scene.characterIds.map((token) => resolve(token, people)).filter((id) => peopleHas(project, id));
    scene.loreIds = scene.loreIds.map((token) => resolve(token, lore)).filter((id) => project.lore.some((entry) => entry.id === id));
  }
  for (const event of project.events) {
    event.characterIds = event.characterIds.map((token) => resolve(token, people)).filter((id) => peopleHas(project, id));
  }
  for (const bond of project.relationships) {
    bond.fromId = resolve(bond.fromId, people);
    bond.toId = resolve(bond.toId, people);
  }
}

function upsert<T>(list: T[], item: T, same: (item: T) => boolean): void {
  const index = list.findIndex(same);
  if (index >= 0) list[index] = { ...list[index], ...item, id: (list[index] as { id: string }).id };
  else list.push(item);
}

function peopleHas(project: Project, id: string): boolean {
  return project.characters.some((person) => person.id === id);
}

function calendarSetupFrom(body: string): { months: CalendarMonth[]; calendar: Project["calendar"] } | null {
  const block = /```json\s*([\s\S]*?)```/.exec(body)?.[1];
  if (!block) return null;
  try {
    const parsed = JSON.parse(block) as { months?: CalendarMonth[]; calendar?: Project["calendar"] };
    if (!Array.isArray(parsed.months) || !parsed.months.length || !parsed.calendar) return null;
    return { months: parsed.months, calendar: parsed.calendar };
  } catch {
    return null;
  }
}

function monthsFrom(body: string): CalendarMonth[] {
  return body
    .split("\n")
    .map((line) => /^-\s+(.+?)\s+\((\d+)\)\s*$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match, index) => ({ id: `month-${index}`, name: match[1], days: Math.max(1, Number(match[2]) || 28) }));
}

function bondsFrom(body: string, people: Character[]): { kinds: BondKind[]; relationships: Relationship[] } {
  const byName = new Map(people.map((person) => [person.name.toLowerCase(), person.id]));
  const kinds: BondKind[] = [];
  const relationships: Relationship[] = [];
  let mode: "kinds" | "bonds" | "" = "";
  for (const line of body.split("\n")) {
    const heading = /^##\s+(.+)$/.exec(line.trim());
    if (heading) {
      mode = /kind/i.test(heading[1]) ? "kinds" : /bond/i.test(heading[1]) ? "bonds" : "";
      continue;
    }
    const item = /^-\s+(.+)$/.exec(line.trim());
    if (!item) continue;
    const bits = item[1].split("|").map((part) => part.trim());
    if (mode === "kinds" && bits[0]) {
      kinds.push({ id: bits.length > 1 ? slug(bits[0]) || bits[0] : slug(bits[0]), name: bits[1] || bits[0] });
      continue;
    }
    if (mode === "bonds" && bits.length >= 3) {
      const kindName = bits[1];
      let kind = kinds.find((entry) => entry.name.toLowerCase() === kindName.toLowerCase() || entry.id === slug(kindName));
      if (!kind) {
        kind = { id: slug(kindName) || uid("kind"), name: kindName };
        kinds.push(kind);
      }
      const fromId = byName.get(wikiTarget(bits[0]).toLowerCase()) ?? "";
      const toId = byName.get(wikiTarget(bits[2]).toLowerCase()) ?? "";
      if (!fromId || !toId) continue;
      relationships.push({ id: uid("bond"), fromId, toId, kind: kind.id, note: bits.slice(3).join(" | ") });
    }
  }
  return { kinds, relationships };
}

function visionFrom(text: string, project: Project, files: Map<string, VaultFile>, tracks: ImportedTrack[]): VisionBoard | null {
  let canvas: { nodes?: CanvasNode[]; edges?: CanvasEdge[] };
  try {
    canvas = JSON.parse(text) as { nodes?: CanvasNode[]; edges?: CanvasEdge[] };
  } catch {
    return null;
  }
  const pages = pageIndex(project);
  const cards: VisionCard[] = [];
  for (const node of canvas.nodes ?? []) {
    if (node.type === "text") {
      cards.push({ id: node.id, kind: "note", refId: "", x: node.x ?? 0, y: node.y ?? 0, note: node.text ?? "", media: "" });
      continue;
    }
    if (node.type !== "file" || !node.file) continue;
    const path = normalizePath(node.file);
    const page = pages.get(path);
    if (page) {
      cards.push({ id: node.id, kind: page.kind, refId: page.id, x: node.x ?? 0, y: node.y ?? 0, note: "", media: "" });
      continue;
    }
    const ext = extension(path);
    const file = findFile(files, path);
    if (IMAGE_EXT[ext] && file?.bytes) {
      cards.push({
        id: node.id,
        kind: "photo",
        refId: "",
        x: node.x ?? 0,
        y: node.y ?? 0,
        note: leaf(path),
        media: bytesToDataUrl(file.bytes, IMAGE_EXT[ext]),
      });
      continue;
    }
    if (AUDIO_EXT[ext] && file?.bytes) {
      const id = slug(leaf(path)) || uid("track");
      tracks.push({ id, bytes: file.bytes, mime: AUDIO_EXT[ext] });
      cards.push({ id: node.id, kind: "music", refId: "", x: node.x ?? 0, y: node.y ?? 0, note: leaf(path), media: `track:${id}` });
    }
  }
  const ids = new Set(cards.map((card) => card.id));
  const edges = (canvas.edges ?? [])
    .filter((edge) => ids.has(edge.fromNode) && ids.has(edge.toNode))
    .map((edge) => ({ id: edge.id || uid("link"), fromId: edge.fromNode, toId: edge.toNode, label: edge.label ?? "" }));
  return { cards, edges };
}

function canvasFrom(
  project: Project,
  pagePath: Map<string, string>,
  files: VaultFile[],
  used: Set<string>,
  audio: Map<string, AudioBits>,
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const nodes: CanvasNode[] = project.vision.cards.map((card) => {
    const linked = pagePath.get(`${card.kind}:${card.refId}`);
    if (linked && card.kind !== "note" && card.kind !== "photo" && card.kind !== "music") {
      return fileNode(card, linked);
    }
    if (card.kind === "photo" && card.media.startsWith("data:")) {
      const path = storeBinary(files, used, `attachments/${fileName(card.note || card.id)}`, card.media);
      if (path) return fileNode(card, path);
    }
    if (card.kind === "music") {
      const id = card.media.startsWith("track:") ? card.media.slice("track:".length) : "";
      const bits = id ? audio.get(id) : undefined;
      if (bits) {
        const ext = extensionFromMime(bits.mime);
        const path = uniquePath(used, `attachments/${fileName(card.note || id)}.${ext}`);
        files.push({ path, bytes: bits.bytes });
        return fileNode(card, path);
      }
    }
    return {
      id: card.id,
      type: "text",
      text: card.note,
      x: card.x,
      y: card.y,
      width: 250,
      height: 120,
    };
  });
  const edges: CanvasEdge[] = project.vision.edges.map((edge) => ({
    id: edge.id,
    fromNode: edge.fromId,
    fromSide: "right",
    toNode: edge.toId,
    toSide: "left",
    label: edge.label,
  }));
  return { nodes, edges };
}

function fileNode(card: VisionCard, file: string): CanvasNode {
  return { id: card.id, type: "file", file, x: card.x, y: card.y, width: 280, height: card.kind === "photo" || card.kind === "music" ? 180 : 220 };
}

function pageIndex(project: Project): Map<string, { kind: VisionKind; id: string }> {
  const index = new Map<string, { kind: VisionKind; id: string }>();
  const files = projectToVault(project);
  for (const file of files) {
    if (!file.text) continue;
    const kind = yamlString(splitFrontmatter(file.text).data.storymaker);
    const id = yamlString(splitFrontmatter(file.text).data.id);
    if ((kind === "person" || kind === "lore" || kind === "scene" || kind === "thread") && id) {
      index.set(file.path, { kind, id });
    }
  }
  return index;
}

function applyComfort(project: Project, text: string): void {
  try {
    const parsed = JSON.parse(text) as {
      comfort?: Comfort;
      wordsByDay?: Record<string, number>;
      streak?: number;
      lastWriteDay?: string | null;
      lampLit?: boolean;
      trash?: Project["trash"];
    };
    if (parsed.comfort) project.comfort = { ...project.comfort, ...parsed.comfort };
    if (parsed.wordsByDay) project.wordsByDay = parsed.wordsByDay;
    if (typeof parsed.streak === "number") project.streak = parsed.streak;
    if ("lastWriteDay" in parsed) project.lastWriteDay = parsed.lastWriteDay ?? null;
    if (typeof parsed.lampLit === "boolean") project.lampLit = parsed.lampLit;
    if (Array.isArray(parsed.trash)) project.trash = parsed.trash;
  } catch {
    /* keep the comfort settings already open */
  }
}

function embedImage(files: VaultFile[], used: Set<string>, title: string, dataUrl: string): string {
  const path = storeBinary(files, used, `attachments/${fileName(title)}`, dataUrl);
  return path ? `![[${path}]]` : "";
}

function storeBinary(files: VaultFile[], used: Set<string>, pathWithoutExt: string, dataUrl: string): string {
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) return "";
  const path = uniquePath(used, `${pathWithoutExt}.${decoded.ext}`);
  files.push({ path, bytes: decoded.bytes });
  return path;
}

function readEmbed(body: string, files: Map<string, VaultFile>): string | null {
  const match = /!\[\[([^\]]+)\]\]/.exec(body);
  if (!match) return null;
  const file = findFile(files, match[1].trim());
  if (!file?.bytes) return null;
  const mime = IMAGE_EXT[extension(file.path)];
  return mime ? bytesToDataUrl(file.bytes, mime) : null;
}

function findFile(files: Map<string, VaultFile>, link: string): VaultFile | undefined {
  const wanted = normalizePath(link);
  const direct = files.get(wanted);
  if (direct) return direct;
  const name = wanted.split("/").pop()?.toLowerCase();
  for (const [path, file] of files) {
    if (path.toLowerCase() === wanted.toLowerCase()) return file;
    if (name && path.split("/").pop()?.toLowerCase() === name) return file;
  }
  return undefined;
}

function stripEmbed(body: string): string {
  return body.replace(/^\s*!\[\[[^\]]+\]\]\s*/, "");
}

function splitSections(body: string, headings: string[]): { intro: string; sections: Record<string, string> } {
  const buckets = new Map<string, string[]>([["intro", []]]);
  for (const heading of headings) buckets.set(heading, []);
  let current = "intro";
  for (const line of body.split("\n")) {
    const heading = headings.find((item) => line.trim() === `## ${item}`);
    if (heading) {
      current = heading;
      continue;
    }
    buckets.get(current)?.push(line);
  }
  const sections: Record<string, string> = {};
  for (const heading of headings) sections[heading] = (buckets.get(heading) ?? []).join("\n").trim();
  return { intro: (buckets.get("intro") ?? []).join("\n").trim(), sections };
}

function kindFromPath(path: string): string {
  if (path.startsWith("People/")) return "person";
  if (path.startsWith("Lore/")) return "lore";
  if (path.startsWith("Scenes/")) return "scene";
  if (path.startsWith("Threads/")) return "thread";
  if (path.startsWith("Mood/")) return "mood";
  if (path === "Bonds.md") return "bonds";
  if (path === "Calendar.md") return "calendar";
  if (path === "Story.md") return "story";
  return "";
}

function nameOf(project: Project, kind: "person" | "lore", id: string): string {
  if (kind === "person") return project.characters.find((person) => person.id === id)?.name ?? id;
  return project.lore.find((entry) => entry.id === id)?.title ?? id;
}

function wiki(name: string): string {
  return `[[${name.replace(/[\[\]]/g, "")}]]`;
}

function section(heading: string, body: string): string {
  return body.trim() ? `## ${heading}\n\n${body.trim()}` : "";
}

function fileName(name: string): string {
  const clean = name.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  return clean.slice(0, 80) || "Untitled";
}

function uniquePath(used: Set<string>, path: string): string {
  if (!used.has(path)) {
    used.add(path);
    return path;
  }
  const dot = path.lastIndexOf(".");
  const stem = dot >= 0 ? path.slice(0, dot) : path;
  const ext = dot >= 0 ? path.slice(dot) : "";
  let index = 2;
  let next = `${stem} ${index}${ext}`;
  while (used.has(next)) {
    index += 1;
    next = `${stem} ${index}${ext}`;
  }
  used.add(next);
  return next;
}

function leaf(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name.replace(/\.md$/i, "");
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function extension(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

function extensionFromMime(mime: string): string {
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("flac")) return "flac";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "mp3";
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function decodeDataUrl(value: string): { bytes: Uint8Array; ext: string } | null {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(value);
  if (!match) return null;
  const mime = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { bytes, ext: extensionFromMime(mime) };
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

interface CanvasNode {
  id: string;
  type: "file" | "text" | "link" | "group";
  file?: string;
  text?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: string;
  toSide?: string;
  label?: string;
}
