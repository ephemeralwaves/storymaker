import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { StorybookMotes, type MotesHandle } from "../components/StorybookMotes";
import { leatherFor } from "../lib/leather";
import { buildStoryBlocks, paginateBlocks, type StoryBlock } from "../lib/storybookPages";
import { useStory } from "../lib/store";
import type { ReaderSkin } from "../types";

/* The book is drawn at a fixed design size and scaled to fit the room. */
const PAGE_WIDTH = 340;
const CONTENT_HEIGHT = 408; // the 500px page minus its top padding (40) and folio band (52)
const DESIGN_WIDTH = 720;
const DESIGN_HEIGHT = 560;
const COVER_MS = 1750;
const TURN_MS = 980;
const INK_STEP = 170;

type Phase = "closed" | "opening" | "open" | "closing";
type Turn = { dir: "next" | "prev"; from: number; to: number };

const SKINS: { id: ReaderSkin; label: string }[] = [
  { id: "gilded", label: "Gilded" },
  { id: "illuminated", label: "Illuminated" },
  { id: "glow", label: "Glow" },
];

function Emblem({ size = 40 }: { size?: number }) {
  return (
    <svg className="sb-emblem" width={size} height={size * 1.3} viewBox="0 0 40 52" aria-hidden="true">
      <path d="M20 3v5M10 10l3 3M30 10l-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M20 14c4 5 8 8 8 14a8 8 0 0 1-16 0c0-6 4-9 8-14z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M20 24c2 2.5 3.5 4 3.5 6.5a3.5 3.5 0 0 1-7 0c0-2.5 1.5-4 3.5-6.5z" fill="currentColor" />
      <path d="M8 46c4-3 8-3 12 0s8 3 12 0" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function Rule() {
  return (
    <svg className="sb-rule" width="120" height="10" viewBox="0 0 120 10" aria-hidden="true">
      <path d="M2 5H48M72 5H118" stroke="currentColor" strokeWidth="1.2" />
      <path d="M60 1l4 4-4 4-4-4z" fill="currentColor" />
      <circle cx="52" cy="5" r="1.6" fill="currentColor" />
      <circle cx="68" cy="5" r="1.6" fill="currentColor" />
    </svg>
  );
}

function Flourish({ className }: { className: string }) {
  return (
    <svg className={`sb-corner ${className}`} viewBox="0 0 80 80" aria-hidden="true">
      <path d="M4 4C4 30 14 44 30 46 20 38 20 26 30 22s16 6 10 12c-4 4-10 0-7-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M4 4c26 0 40 10 42 26-8-10-20-10-24 0s6 16 12 10c4-4 0-10-4-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="8" cy="8" r="4" fill="currentColor" />
      <path d="M14 58q6-4 4-12M58 14q-4 6-12 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Para({ block, skin, style }: { block: Extract<StoryBlock, { kind: "para" }>; skin: ReaderSkin; style?: CSSProperties }) {
  if (block.dropCap && skin === "gilded" && block.text) {
    return (
      <p className="sb-para sb-ink" style={style}>
        <span className="sb-initial" aria-hidden="true"><b>{block.text[0]}</b></span>
        <span className="sb-sr">{block.text[0]}</span>
        {block.html ? <span dangerouslySetInnerHTML={{ __html: inlineAfterDropCap(block.html, block.text[0]) }} /> : block.text.slice(1)}
      </p>
    );
  }
  if (block.html) {
    return (
      <p
        className={block.dropCap ? "sb-para sb-ink drop-cap" : "sb-para sb-ink"}
        style={style}
        dangerouslySetInnerHTML={{ __html: block.html }}
      />
    );
  }
  return <p className={block.dropCap ? "sb-para sb-ink drop-cap" : "sb-para sb-ink"} style={style}>{block.text}</p>;
}

/** Drop the first visible character from inline HTML when a gilded initial already shows it. */
function inlineAfterDropCap(html: string, first: string): string {
  const escaped = first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.replace(new RegExp(`^(?:\\s|<[^>]+>)*${escaped}`), (match) => match.slice(0, match.length - first.length));
}

function BlockView({ block, skin, index, onKeepWriting }: { block: StoryBlock; skin: ReaderSkin; index: number; onKeepWriting: () => void }) {
  const style = { "--d": `${index * INK_STEP}ms` } as CSSProperties;
  if (block.kind === "title") {
    return (
      <div className="sb-center">
        <div className="sb-ink" style={{ "--d": "0ms" } as CSSProperties}><Emblem size={42} /></div>
        <h2 className="sb-display sb-ink" style={{ "--d": `${INK_STEP}ms` } as CSSProperties}>{block.text}</h2>
        <div className="sb-ink" style={{ "--d": `${INK_STEP * 2}ms` } as CSSProperties}><Rule /></div>
        {block.tagline ? <p className="sb-sub sb-ink" style={{ "--d": `${INK_STEP * 3}ms` } as CSSProperties}>{block.tagline}</p> : null}
        {block.era ? <p className="sb-num sb-ink" style={{ "--d": `${INK_STEP * 4}ms` } as CSSProperties}>{block.era}</p> : null}
      </div>
    );
  }
  if (block.kind === "opener") {
    return (
      <div className="sb-center">
        <p className="sb-num sb-ink" style={{ "--d": "0ms" } as CSSProperties}>{block.number}</p>
        <div className="sb-ink" style={{ "--d": `${INK_STEP}ms` } as CSSProperties}><Rule /></div>
        <h2 className="sb-display sb-ink" style={{ "--d": `${INK_STEP * 2}ms` } as CSSProperties}>{block.text}</h2>
        <div className="sb-ink sb-opener-mark" style={{ "--d": `${INK_STEP * 3}ms` } as CSSProperties}><Emblem size={34} /></div>
      </div>
    );
  }
  if (block.kind === "ornament") {
    return (
      <div className="sb-scene sb-ink" style={style}>
        {block.flourish ? <span className="sb-fleuron">❦</span> : null}
        {block.text ? <span className="sb-scene-title">{block.text}</span> : null}
      </div>
    );
  }
  if (block.kind === "heading") {
    const Tag = block.level === 1 ? "h2" : block.level === 2 ? "h3" : "h4";
    return <Tag className={`sb-md-heading sb-md-h${block.level} sb-ink`} style={style}>{block.text}</Tag>;
  }
  if (block.kind === "quote") {
    return <blockquote className="sb-md-quote sb-ink" style={style}>{block.text}</blockquote>;
  }
  if (block.kind === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <ListTag className="sb-md-list sb-ink" style={style}>
        {block.items.map((item, itemIndex) => (
          <li key={`${itemIndex}-${item.slice(0, 24)}`}>{item}</li>
        ))}
      </ListTag>
    );
  }
  if (block.kind === "rule") {
    return (
      <div className="sb-scene sb-ink" style={style}>
        <span className="sb-fleuron">❧</span>
      </div>
    );
  }
  if (block.kind === "end") {
    return (
      <div className="sb-end sb-ink" style={style}>
        <span className="sb-fleuron">❧</span>
        <span className="sb-end-note">{block.text}</span>
        <button type="button" className="sb-end-btn" onClick={onKeepWriting}>Keep writing in the Hearth</button>
      </div>
    );
  }
  if (block.kind === "empty") return <p className="sb-para sb-empty sb-ink" style={style}>{block.text}</p>;
  return <Para block={block} skin={skin} style={style} />;
}

function fillMeasureHost(host: HTMLElement, slice: StoryBlock[], skin: ReaderSkin) {
  host.replaceChildren();
  for (const block of slice) {
    if (block.kind === "ornament" || block.kind === "rule") {
      const node = document.createElement("div");
      node.className = "sb-scene";
      if (block.kind === "rule" || block.flourish) {
        const fleuron = document.createElement("span");
        fleuron.className = "sb-fleuron";
        fleuron.textContent = block.kind === "rule" ? "❧" : "❦";
        node.appendChild(fleuron);
      }
      if (block.kind === "ornament" && block.text) {
        const title = document.createElement("span");
        title.className = "sb-scene-title";
        title.textContent = block.text;
        node.appendChild(title);
      }
      host.appendChild(node);
    } else if (block.kind === "heading") {
      const node = document.createElement(block.level === 1 ? "h2" : block.level === 2 ? "h3" : "h4");
      node.className = `sb-md-heading sb-md-h${block.level}`;
      node.textContent = block.text;
      host.appendChild(node);
    } else if (block.kind === "quote") {
      const node = document.createElement("blockquote");
      node.className = "sb-md-quote";
      node.textContent = block.text;
      host.appendChild(node);
    } else if (block.kind === "list") {
      const node = document.createElement(block.ordered ? "ol" : "ul");
      node.className = "sb-md-list";
      for (const item of block.items) {
        const li = document.createElement("li");
        li.textContent = item;
        node.appendChild(li);
      }
      host.appendChild(node);
    } else if (block.kind === "end") {
      const node = document.createElement("div");
      node.className = "sb-end";
      host.appendChild(node);
    } else if (block.kind === "para" || block.kind === "empty") {
      const node = document.createElement("p");
      node.className = block.kind === "empty" ? "sb-para sb-empty" : block.dropCap ? "sb-para drop-cap" : "sb-para";
      if (block.kind === "para" && block.dropCap && skin === "gilded" && block.text) {
        const initial = document.createElement("span");
        initial.className = "sb-initial";
        initial.textContent = block.text[0];
        node.appendChild(initial);
        if (block.html) {
          const rest = document.createElement("span");
          rest.innerHTML = inlineAfterDropCap(block.html, block.text[0]);
          node.appendChild(rest);
        } else {
          node.appendChild(document.createTextNode(block.text.slice(1)));
        }
      } else if (block.kind === "para" && block.html) {
        node.innerHTML = block.html;
      } else {
        node.textContent = block.text;
      }
      host.appendChild(node);
    }
  }
}

function readSession(key: string): { spread: number } | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as { spread?: unknown };
    return typeof value.spread === "number" ? { spread: value.spread } : null;
  } catch {
    return null;
  }
}

function writeSession(key: string, value: { spread: number } | null) {
  try {
    if (value) sessionStorage.setItem(key, JSON.stringify(value));
    else sessionStorage.removeItem(key);
  } catch {
    /* private window: the book simply starts closed next time */
  }
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function pageLabel(page: StoryBlock[] | undefined): string {
  return page?.find((block) => block.chapterTitle)?.chapterTitle ?? "";
}

export function StorybookView() {
  const story = useStory();
  const { project } = story;
  const { manuscriptScale, readerSkin, clearType, reducedMotion } = project.comfort;
  const calm = reducedMotion || prefersReducedMotion();
  const book = story.books.find((item) => item.id === story.bookId);
  const leather = leatherFor(book?.spine ?? 7);
  const sessionKey = `storymaker.storybook.${story.bookId}`;

  const [remembered] = useState(() => readSession(sessionKey));
  const [phase, setPhase] = useState<Phase>(remembered ? "open" : "closed");
  const [spread, setSpread] = useState(remembered?.spread ?? 0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [inked, setInked] = useState<number[]>([]);
  const [pages, setPages] = useState<StoryBlock[][]>([[], []]);
  const [scale, setScale] = useState(1);
  const [idle, setIdle] = useState(false);
  const [aaOpen, setAaOpen] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const motes = useRef<MotesHandle | null>(null);
  const swipeX = useRef<number | null>(null);
  const turnRef = useRef<Turn | null>(null);

  const blocks = useMemo(() => buildStoryBlocks(project, readerSkin), [project, readerSkin]);
  const [fontsTick, setFontsTick] = useState(0);

  /* re-measure once the book faces have loaded, or pages break too early */
  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts) return;
    let alive = true;
    const bump = () => { if (alive) setFontsTick((n) => n + 1); };
    void fonts.ready.then(bump);
    void Promise.all([fonts.load('16px "IM Fell English"'), fonts.load('700 16px "Cinzel Decorative"')]).then(bump, bump);
    fonts.addEventListener?.("loadingdone", bump);
    return () => {
      alive = false;
      fonts.removeEventListener?.("loadingdone", bump);
    };
  }, []);
  const bodyFont = clearType ? "var(--clear)" : readerSkin === "gilded" ? "var(--fell)" : "var(--serif)";

  useLayoutEffect(() => {
    const host = measureRef.current;
    if (!host) return;
    const measure = (slice: StoryBlock[]) => {
      fillMeasureHost(host, slice, readerSkin);
      return host.scrollHeight;
    };
    // Page 0 is the inside of the front cover; the title page faces it.
    const next = [[], ...paginateBlocks(blocks, measure, CONTENT_HEIGHT)];
    setPages(next);
    setSpread((current) => Math.min(current, Math.max(0, Math.ceil(next.length / 2) - 1)));
  }, [blocks, manuscriptScale, readerSkin, clearType, bodyFont, fontsTick]);

  const spreadCount = Math.max(1, Math.ceil(pages.length / 2));

  useEffect(() => {
    if (phase === "open") writeSession(sessionKey, { spread });
    if (phase === "closed") writeSession(sessionKey, null);
  }, [phase, spread, sessionKey]);

  /* fit the book to the room */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => {
      const byWidth = (stage.clientWidth - 32) / DESIGN_WIDTH;
      const byHeight = (window.innerHeight - 250) / DESIGN_HEIGHT;
      setScale(Math.max(0.42, Math.min(1, byWidth, byHeight)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    window.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  const isOpen = phase === "open";

  const openBook = useCallback(() => {
    if (phase !== "closed") return;
    const stage = stageRef.current?.getBoundingClientRect();
    const cover = bookRef.current?.getBoundingClientRect();
    if (stage && cover) motes.current?.burst(cover.left - stage.left + cover.width * 0.75, cover.top - stage.top + cover.height / 2);
    setSpread(0);
    setInked([1]);
    setPhase(calm ? "open" : "opening");
  }, [phase, calm]);

  const closeBook = useCallback(() => {
    if (phase !== "open" || turn) return;
    setAaOpen(false);
    setSpread(0);
    setPhase(calm ? "closed" : "closing");
  }, [phase, turn, calm]);

  const go = useCallback(
    (dir: "next" | "prev") => {
      if (phase !== "open" || turn) return;
      const to = spread + (dir === "next" ? 1 : -1);
      if (to < 0 || to >= spreadCount) return;
      setInked(dir === "next" ? [to * 2 + 1] : [to * 2]);
      if (calm) {
        setSpread(to);
      } else {
        turnRef.current = { dir, from: spread, to };
        setTurn(turnRef.current);
      }
    },
    [phase, turn, spread, spreadCount, calm],
  );

  const jump = (to: number) => {
    if (phase !== "open" || turn || to === spread) return;
    setInked([to * 2, to * 2 + 1]);
    setSpread(to);
  };

  const finishTurn = useCallback(() => {
    const current = turnRef.current;
    if (!current) return;
    turnRef.current = null;
    setSpread(current.to);
    setTurn(null);
  }, []);

  /* animation-end is the normal finish; these timers cover a hidden window that never paints */
  useEffect(() => {
    if (!turn) return;
    const timer = window.setTimeout(finishTurn, TURN_MS + 250);
    return () => window.clearTimeout(timer);
  }, [turn, finishTurn]);

  useEffect(() => {
    if (phase !== "opening" && phase !== "closing") return;
    const timer = window.setTimeout(() => setPhase((p) => (p === "opening" ? "open" : p === "closing" ? "closed" : p)), COVER_MS + 250);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (story.searchOpen) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        go("prev");
      }
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        go("next");
      }
      if (event.key === "Enter" && phase === "closed" && (!target || target === document.body)) {
        event.preventDefault();
        openBook();
      }
      if (event.key === "Escape" && aaOpen) setAaOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, openBook, phase, aaOpen, story.searchOpen]);

  /* the controls fade while you read */
  useEffect(() => {
    if (!isOpen || aaOpen) {
      setIdle(false);
      return;
    }
    let timer = window.setTimeout(() => setIdle(true), 2600);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), 2600);
    };
    const stage = stageRef.current;
    stage?.addEventListener("pointermove", wake);
    stage?.addEventListener("focusin", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.clearTimeout(timer);
      stage?.removeEventListener("pointermove", wake);
      stage?.removeEventListener("focusin", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [isOpen, aaOpen]);

  if (!project.chapters.length) {
    return (
      <section className="card">
        <h2>The storybook is empty</h2>
        <p className="muted">Write a chapter in the Hearth, then come back to read it here.</p>
      </section>
    );
  }

  const leftIdx = turn ? (turn.dir === "next" ? turn.from * 2 : turn.to * 2) : spread * 2;
  const rightIdx = turn ? (turn.dir === "next" ? turn.to * 2 + 1 : turn.from * 2 + 1) : spread * 2 + 1;
  const keepWriting = () => story.setView("hearth");

  const face = (index: number, side: "l" | "r", extra = "") => {
    const page = pages[index];
    const alone = page?.length === 1 && (page[0].kind === "title" || page[0].kind === "opener");
    const folio = index >= 2 && page?.length && !alone ? String(index - 1) : "";
    return (
      <div key={`${side}-${index}`} className={`sb-page ${side} ${extra} ${inked.includes(index) ? "sb-inked" : ""}`}>
        <div className={alone ? "sb-page-inner sb-page-alone" : "sb-page-inner"}>
          {alone ? <div className="sb-frame" aria-hidden="true" /> : null}
          {(page ?? []).map((block, i) => (
            <BlockView key={block.key} block={block} skin={readerSkin} index={i} onKeepWriting={keepWriting} />
          ))}
        </div>
        <span className="sb-folio">{folio}</span>
      </div>
    );
  };

  const currentLabel = pageLabel(pages[spread * 2 + 1]) || pageLabel(pages[spread * 2]);
  const beads = Array.from({ length: spreadCount }, (_, i) => {
    const left = pages[i * 2];
    const right = pages[i * 2 + 1];
    const chapterStart = [left, right].some((page) => page?.some((block) => block.kind === "opener"));
    return { i, label: pageLabel(right) || pageLabel(left) || "Inside the cover", chapterStart };
  });

  return (
    <div
      ref={stageRef}
      className={["sb-stage", isOpen || phase === "opening" ? "is-open" : "", idle ? "is-idle" : ""].filter(Boolean).join(" ")}
      data-skin={readerSkin}
      style={{ "--leather": leather } as CSSProperties}
    >
      <StorybookMotes calm={calm} handle={motes} />

      <div className="sb-head">
        <p className="sb-eyebrow">Storybook</p>
        <h2>Once upon a time…</h2>
      </div>

      <div className="sb-sizer" style={{ width: DESIGN_WIDTH * scale, height: DESIGN_HEIGHT * scale }}>
        <div className="sb-scaler" style={{ transform: `scale(${scale})`, width: DESIGN_WIDTH, height: DESIGN_HEIGHT }}>
          <div
            ref={bookRef}
            className="sb-book"
            data-phase={phase}
            role="group"
            aria-label={isOpen ? `Open book, spread ${spread + 1} of ${spreadCount}` : `${project.name}, closed`}
            style={{ fontFamily: bodyFont, fontSize: `${manuscriptScale}rem` }}
            onPointerDown={(event) => { swipeX.current = event.clientX; }}
            onPointerUp={(event) => {
              if (swipeX.current === null) return;
              const dx = event.clientX - swipeX.current;
              swipeX.current = null;
              if (Math.abs(dx) > 50) go(dx < 0 ? "next" : "prev");
            }}
          >
            <div className="sb-board" aria-hidden="true" />
            <div className="sb-block" aria-hidden="true" />
            {isOpen && leftIdx > 0 ? face(leftIdx, "l", "sb-under") : null}
            {face(rightIdx, "r", "sb-under")}

            {turn ? (
              <div className={`sb-leaf ${turn.dir}`} onAnimationEnd={(event) => { if (event.target === event.currentTarget) finishTurn(); }}>
                {face(turn.dir === "next" ? turn.from * 2 + 1 : turn.from * 2, turn.dir === "next" ? "r" : "l", "front")}
                {face(turn.dir === "next" ? turn.to * 2 : turn.to * 2 + 1, turn.dir === "next" ? "l" : "r", "back")}
              </div>
            ) : null}

            <div
              className="sb-cover"
              onClick={openBook}
              onAnimationEnd={(event) => {
                if (event.target !== event.currentTarget) return;
                setPhase((p) => (p === "opening" ? "open" : p === "closing" ? "closed" : p));
              }}
            >
              <div className="sb-cover-face sb-cover-front">
                <div className="sb-gild">
                  <div className="sb-gild-in">
                    <Flourish className="tl" />
                    <Flourish className="tr" />
                    <Flourish className="bl" />
                    <Flourish className="br" />
                    <span className="sb-jewel rose t" />
                    <span className="sb-jewel rose b" />
                    <span className="sb-jewel sapph l" />
                    <span className="sb-jewel sapph r" />
                    <div className="sb-cover-title">
                      <span className="sb-cover-emblem"><Emblem size={46} /></span>
                      <h2 className="sb-gold-text">{project.name || "Untitled story"}</h2>
                      <span className="sb-cover-rule"><Rule /></span>
                      {project.tagline ? <p className="sb-cover-by">{project.tagline}</p> : null}
                    </div>
                  </div>
                </div>
              </div>
              <div className="sb-cover-face sb-cover-back">
                <div className="sb-endpaper">
                  <div className="sb-exlibris">
                    <span className="sb-exlibris-label">Ex Libris</span>
                    <Emblem size={26} />
                    <span className="sb-exlibris-who">From the shelf of<br />the keeper of the lamp</span>
                  </div>
                </div>
              </div>
            </div>

            {isOpen && !turn ? (
              <>
                {spread > 0 ? <button type="button" className="sb-hit l" aria-label="Previous page" onClick={() => go("prev")} /> : null}
                {spread < spreadCount - 1 ? <button type="button" className="sb-hit r" aria-label="Next page" onClick={() => go("next")} /> : null}
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="sb-controls">
        {phase === "closed" || phase === "closing" ? (
          <>
            <button type="button" className="sb-open-btn" onClick={openBook} disabled={phase !== "closed"}>
              Open the book
            </button>
            <p className="sb-hint">Press Enter, or click the cover.</p>
          </>
        ) : (
          <>
            <p className="sb-reading" aria-live="polite">{currentLabel}</p>
            <div className="sb-bar">
              <RoundButton label="Previous spread" disabled={!isOpen || spread === 0} onClick={() => go("prev")}>
                <path d="M15 5l-7 7 7 7" />
              </RoundButton>
              {spreadCount <= 30 ? (
                <div className="sb-beads" role="group" aria-label="Pages">
                  {beads.map((bead) => (
                    <button
                      key={bead.i}
                      type="button"
                      className={bead.chapterStart ? "sb-bead chap" : "sb-bead"}
                      aria-label={`Go to ${bead.label}`}
                      aria-current={bead.i === spread ? "true" : undefined}
                      onClick={() => jump(bead.i)}
                    >
                      <span />
                      <em className="sb-bead-tip">{bead.label}</em>
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  className="sb-scrub"
                  type="range"
                  min={0}
                  max={spreadCount - 1}
                  value={spread}
                  aria-label="Spread"
                  onChange={(event) => jump(Number(event.target.value))}
                />
              )}
              <RoundButton label="Next spread" disabled={!isOpen || spread >= spreadCount - 1} onClick={() => go("next")}>
                <path d="M9 5l7 7-7 7" />
              </RoundButton>
              <div className="sb-aa">
                <button type="button" className="sb-pill" aria-expanded={aaOpen} aria-controls="sb-aa-pop" onClick={() => setAaOpen((v) => !v)}>
                  Aa
                </button>
                {aaOpen ? (
                  <div className="sb-pop" id="sb-aa-pop">
                    <span className="sb-pop-label">Skin</span>
                    <div className="sb-seg">
                      {SKINS.map((skin) => (
                        <button
                          key={skin.id}
                          type="button"
                          aria-pressed={readerSkin === skin.id}
                          onClick={() => story.setComfort({ readerSkin: skin.id })}
                        >
                          {skin.label}
                        </button>
                      ))}
                    </div>
                    <label className="sb-pop-label" htmlFor="sb-size">Size</label>
                    <input
                      id="sb-size"
                      type="range"
                      min={0.7}
                      max={1.6}
                      step={0.05}
                      value={manuscriptScale}
                      onChange={(event) => story.setComfort({ manuscriptScale: Number(event.target.value) })}
                    />
                  </div>
                ) : null}
              </div>
              <button type="button" className="sb-pill" onClick={closeBook} disabled={!isOpen || Boolean(turn)}>
                Close book
              </button>
            </div>
          </>
        )}
      </div>

      <div
        ref={measureRef}
        className="sb-measure"
        data-skin={readerSkin}
        style={{ fontFamily: bodyFont, fontSize: `${manuscriptScale}rem`, width: PAGE_WIDTH }}
        aria-hidden="true"
      />
    </div>
  );
}

function RoundButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="sb-round" aria-label={label} disabled={disabled} onClick={onClick}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

