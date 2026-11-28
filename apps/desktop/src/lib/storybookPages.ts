import { Lexer, type Token, type Tokens } from "marked";
import { storyNowLabel } from "./calendar";
import type { Project, ReaderSkin } from "../types";

export type StoryBlock =
  | { key: string; kind: "title"; text: string; tagline: string; era: string; chapterTitle: string }
  | { key: string; kind: "opener"; number: string; text: string; chapterStart: true; chapterTitle: string }
  | { key: string; kind: "ornament"; text: string; flourish?: boolean; chapterTitle: string }
  | { key: string; kind: "heading"; level: 1 | 2 | 3; text: string; chapterTitle: string }
  | { key: string; kind: "quote"; text: string; chapterTitle: string }
  | { key: string; kind: "list"; ordered: boolean; items: string[]; chapterTitle: string }
  | { key: string; kind: "rule"; chapterTitle: string }
  | { key: string; kind: "para"; text: string; html?: string; dropCap?: boolean; chapterTitle: string }
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

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function plainFromTokens(tokens: Token[] | undefined): string {
  if (!tokens?.length) return "";
  return tokens
    .map((token) => {
      if (token.type === "text" || token.type === "escape" || token.type === "codespan") {
        return "text" in token ? token.text : "";
      }
      if (token.type === "br") return "\n";
      if ("tokens" in token && Array.isArray(token.tokens)) return plainFromTokens(token.tokens);
      if ("text" in token && typeof token.text === "string") return token.text;
      return "";
    })
    .join("");
}

function htmlFromTokens(tokens: Token[] | undefined): string {
  if (!tokens?.length) return "";
  return tokens
    .map((token) => {
      if (token.type === "text" || token.type === "escape") {
        return escapeHtml("text" in token ? token.text : "");
      }
      if (token.type === "codespan") return `<code>${escapeHtml("text" in token ? token.text : "")}</code>`;
      if (token.type === "br") return "<br />";
      if (token.type === "strong") return `<strong>${htmlFromTokens(token.tokens)}</strong>`;
      if (token.type === "em") return `<em>${htmlFromTokens(token.tokens)}</em>`;
      if (token.type === "del") return `<del>${htmlFromTokens(token.tokens)}</del>`;
      if (token.type === "link") return htmlFromTokens(token.tokens) || escapeHtml(token.text);
      if ("tokens" in token && Array.isArray(token.tokens)) return htmlFromTokens(token.tokens);
      if ("text" in token && typeof token.text === "string") return escapeHtml(token.text);
      return "";
    })
    .join("");
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function blocksFromMarkdown(
  body: string,
  keyPrefix: string,
  chapterTitle: string,
  dropCaps: boolean,
  firstPara: { current: boolean },
): StoryBlock[] {
  const blocks: StoryBlock[] = [];
  const tokens = Lexer.lex(body.replace(/\r\n/g, "\n").trim());
  let index = 0;

  const pushPara = (tokens: Token[] | undefined, fallback = "") => {
    const plain = smartQuotes(decodeEntities(plainFromTokens(tokens) || fallback).trim());
    if (!plain) return;
    const html = smartQuotes(decodeEntities(htmlFromTokens(tokens)));
    blocks.push({
      key: `${keyPrefix}-b${index}`,
      kind: "para",
      text: plain,
      html: html && html !== escapeHtml(plain) ? html : undefined,
      dropCap: dropCaps && firstPara.current,
      chapterTitle,
    });
    firstPara.current = false;
    index += 1;
  };

  for (const token of tokens) {
    if (token.type === "space") continue;
    if (token.type === "heading") {
      const heading = token as Tokens.Heading;
      const level = Math.min(3, Math.max(1, heading.depth)) as 1 | 2 | 3;
      const text = smartQuotes(decodeEntities(plainFromTokens(heading.tokens) || heading.text).trim());
      if (!text) continue;
      blocks.push({ key: `${keyPrefix}-b${index}`, kind: "heading", level, text, chapterTitle });
      index += 1;
      continue;
    }
    if (token.type === "blockquote") {
      const quote = token as Tokens.Blockquote;
      const text = smartQuotes(
        decodeEntities(plainFromTokens(quote.tokens) || quote.text || "")
          .replace(/\n+/g, " ")
          .trim(),
      );
      if (!text) continue;
      blocks.push({ key: `${keyPrefix}-b${index}`, kind: "quote", text, chapterTitle });
      index += 1;
      continue;
    }
    if (token.type === "list") {
      const list = token as Tokens.List;
      const items = list.items
        .map((item: Tokens.ListItem) =>
          smartQuotes(decodeEntities(plainFromTokens(item.tokens) || item.text).replace(/\n+/g, " ").trim()),
        )
        .filter(Boolean);
      if (!items.length) continue;
      blocks.push({
        key: `${keyPrefix}-b${index}`,
        kind: "list",
        ordered: Boolean(list.ordered),
        items,
        chapterTitle,
      });
      index += 1;
      continue;
    }
    if (token.type === "hr") {
      blocks.push({ key: `${keyPrefix}-b${index}`, kind: "rule", chapterTitle });
      index += 1;
      continue;
    }
    if (token.type === "paragraph") {
      const paragraph = token as Tokens.Paragraph;
      pushPara(paragraph.tokens, paragraph.text);
      continue;
    }
    if (token.type === "text") {
      const textToken = token as Tokens.Text;
      pushPara(textToken.tokens, textToken.text);
      continue;
    }
    if (token.type === "code") {
      const code = token as Tokens.Code;
      const text = code.text.trim();
      if (!text) continue;
      blocks.push({
        key: `${keyPrefix}-b${index}`,
        kind: "para",
        text,
        dropCap: false,
        chapterTitle,
      });
      firstPara.current = false;
      index += 1;
    }
  }

  return blocks;
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

    const firstPara = { current: true };
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
      const body = scene.body.trim();
      if (!body) {
        blocks.push({
          key: `${scene.id}-blank`,
          kind: "empty",
          text: "…",
          chapterTitle: chapter.title,
        });
        return;
      }
      blocks.push(...blocksFromMarkdown(body, scene.id, chapter.title, dropCaps, firstPara));
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
        key: `${block.key}::${piece}`,
        kind: "para",
        text,
        // Split pieces lose inline HTML; keep it only for the unsplit first fit.
        html: piece === 0 && text === block.text ? block.html : undefined,
        dropCap,
        chapterTitle: block.chapterTitle,
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
