import { storyNowLabel } from "./calendar";
import type { Project, ReaderSkin } from "../types";

export type StoryBlock =
  | { key: string; kind: "title"; text: string; tagline: string; era: string; chapterTitle: string }
  | { key: string; kind: "opener"; number: string; text: string; chapterStart: true; chapterTitle: string }
  | { key: string; kind: "ornament"; text: string; flourish?: boolean; chapterTitle: string }
  | { key: string; kind: "para"; text: string; dropCap?: boolean; chapterTitle: string }
  | { key: string; kind: "empty"; text: string; chapterTitle: string }
  | { key: string; kind: "end"; text: string; chapterTitle: string };

/** Blocks that always fill a page of their own. */
export function standsAlone(block: StoryBlock): boolean {
  return block.kind === "title" || block.kind === "opener";
}

const ORDINALS = [
  "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth",
  "Eleventh", "Twelfth", "Thirteenth", "Fourteenth", "Fifteenth", "Sixteenth", "Seventeenth", "Eighteenth", "Nineteenth", "Twentieth",
];

export function chapterNumberLabel(index: number): string {
  return ORDINALS[index] ? `Chapter the ${ORDINALS[index]}` : `Chapter ${index + 1}`;
}

/** "Chapter 1 — Low lamps" reads as "Low lamps" under a "Chapter the First" label. */
export function chapterDisplayTitle(title: string): string {
  const trimmed = title.replace(/^\s*chapter\s+[\w-]+\s*[—–:.\-]\s*/i, "").trim();
  return trimmed || title.trim() || "Untitled chapter";
}

/** Printed-book quotes: straight quotes and apostrophes become curly ones. */
export function smartQuotes(text: string): string {
  return text
    .replace(/(^|[\s(\[{\u2014-])"/g, "$1\u201c")
    .replace(/"/g, "\u201d")
    .replace(/(^|[\s(\[{\u2014-])'/g, "$1\u2018")
    .replace(/'/g, "\u2019");
}

function paragraphs(body: string): string[] {
  return body
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function buildStoryBlocks(project: Project, skin: ReaderSkin): StoryBlock[] {
  const chapters = project.chapters.slice().sort((a, b) => a.order - b.order);
  const blocks: StoryBlock[] = [];
  const dropCaps = skin !== "glow";

  blocks.push({
    key: "title-page",
    kind: "title",
    text: project.name || "Untitled story",
    tagline: project.tagline ?? "",
    era: storyNowLabel(project),
    chapterTitle: "Title page",
  });

  chapters.forEach((chapter, chapterIndex) => {
    const scenes = project.scenes
      .filter((scene) => scene.chapterId === chapter.id)
      .sort((a, b) => a.order - b.order);

    blocks.push({
      key: `${chapter.id}-opener`,
      kind: "opener",
      number: chapterNumberLabel(chapterIndex),
      text: chapterDisplayTitle(chapter.title),
      chapterStart: true,
      chapterTitle: chapter.title,
    });

    if (!scenes.length) {
      blocks.push({
        key: `${chapter.id}-empty`,
        kind: "empty",
        text: "This chapter has no scenes yet.",
        chapterTitle: chapter.title,
      });
      return;
    }

    let firstPara = true;
    scenes.forEach((scene, sceneIndex) => {
      if (sceneIndex > 0 || scene.title) {
        blocks.push({
          key: `${scene.id}-ornament`,
          kind: "ornament",
          text: scene.title,
          flourish: sceneIndex > 0,
          chapterTitle: chapter.title,
        });
      }
      const parts = paragraphs(scene.body);
      if (!parts.length) {
        blocks.push({
          key: `${scene.id}-blank`,
          kind: "empty",
          text: "…",
          chapterTitle: chapter.title,
        });
        return;
      }
      parts.forEach((part, partIndex) => {
        blocks.push({
          key: `${scene.id}-p${partIndex}`,
          kind: "para",
          text: smartQuotes(part),
          dropCap: dropCaps && firstPara,
          chapterTitle: chapter.title,
        });
        firstPara = false;
      });
    });
  });

  const last = chapters[chapters.length - 1];
  blocks.push({ key: "the-end", kind: "end", text: "The story so far ends here.", chapterTitle: last?.title ?? "" });

  return blocks;
}

function maxFittingPrefix(text: string, fits: (value: string) => boolean): string {
  if (!text) return "";
  if (!fits(text.slice(0, 1))) return "";
  let low = 1;
  let high = text.length;
  let best = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (fits(text.slice(0, mid))) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (best <= 0) return "";
  if (best >= text.length) return text;
  const slice = text.slice(0, best);
  const breakAt = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf("\n"));
  if (breakAt > 0) return text.slice(0, breakAt);
  return slice;
}

export function paginateBlocks(
  blocks: StoryBlock[],
  measure: (slice: StoryBlock[]) => number,
  pageHeight: number,
): StoryBlock[][] {
  if (!blocks.length) return [[]];

  const pages: StoryBlock[][] = [];
  let current: StoryBlock[] = [];
  const fits = (slice: StoryBlock[]) => measure(slice) <= pageHeight + 0.5;

  const flush = () => {
    if (!current.length) return;
    pages.push(current);
    current = [];
  };

  for (const block of blocks) {
    if (standsAlone(block)) {
      flush();
      pages.push([block]);
      continue;
    }

    if (block.kind !== "para") {
      const next = [...current, block];
      if (!current.length || fits(next)) {
        current = next;
      } else {
        flush();
        current = [block];
        if (!fits(current)) flush();
      }
      continue;
    }

    let remaining = block.text;
    let piece = 0;
    let dropCap = Boolean(block.dropCap);

    while (remaining) {
      const makePiece = (text: string): StoryBlock => ({
        ...block,
        key: `${block.key}::${piece}`,
        text,
        dropCap,
      });

      if (fits([...current, makePiece(remaining)])) {
        current = [...current, makePiece(remaining)];
        break;
      }

      if (!current.length) {
        const head = maxFittingPrefix(remaining, (text) => fits([makePiece(text)]));
        if (!head) {
          const word = remaining.match(/^\S+/)?.[0] ?? remaining;
          current = [makePiece(word)];
          remaining = remaining.slice(word.length).replace(/^\s+/, "");
          dropCap = false;
          piece += 1;
          flush();
          continue;
        }
        current = [makePiece(head)];
        remaining = remaining.slice(head.length).replace(/^\s+/, "");
        dropCap = false;
        piece += 1;
        flush();
        continue;
      }

      const head = maxFittingPrefix(remaining, (text) => fits([...current, makePiece(text)]));
      if (!head) {
        flush();
        continue;
      }
      current = [...current, makePiece(head)];
      remaining = remaining.slice(head.length).replace(/^\s+/, "");
      dropCap = false;
      piece += 1;
      flush();
    }
  }

  flush();
  return pages.length ? pages : [[]];
}
