import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { buildStoryBlocks, paginateBlocks, type StoryBlock } from "../lib/storybookPages";
import { useStory } from "../lib/store";
import type { ReaderSkin } from "../types";

const PAGE_WIDTH = 340;
const PAGE_HEIGHT = 500;
const CONTENT_HEIGHT = 440;

function BlockView({ block }: { block: StoryBlock }) {
  if (block.kind === "kicker") return <p className="storybook-kicker">{block.text}</p>;
  if (block.kind === "chapter") return <h3 className="storybook-chapter">{block.text}</h3>;
  if (block.kind === "ornament") {
    return (
      <p className="storybook-ornament">
        {block.flourish ? <span className="storybook-flourish">❖</span> : null}
        {block.text ? <span className="storybook-scene-title">{block.text}</span> : null}
      </p>
    );
  }
  if (block.kind === "empty") return <p className="muted storybook-para">{block.text}</p>;
  return <p className={block.dropCap ? "storybook-para drop-cap" : "storybook-para"}>{block.text}</p>;
}

function PageFace({
  blocks,
  label,
  blank,
}: {
  blocks: StoryBlock[];
  label: string;
  blank?: boolean;
}) {
  return (
    <div className={blank ? "storybook-leaf is-blank" : "storybook-leaf"} aria-label={label}>
      <div className="storybook-leaf-inner">
        {blank ? <p className="muted storybook-blank-note"> </p> : blocks.map((block) => <BlockView key={block.key} block={block} />)}
      </div>
      <span className="storybook-folio">{label}</span>
    </div>
  );
}

function fillMeasureHost(host: HTMLElement, slice: StoryBlock[]) {
  host.replaceChildren();
  for (const block of slice) {
    const node = document.createElement(block.kind === "chapter" ? "h3" : "p");
    if (block.kind === "kicker") {
      node.className = "storybook-kicker";
      node.textContent = block.text;
    } else if (block.kind === "chapter") {
      node.className = "storybook-chapter";
      node.textContent = block.text;
    } else if (block.kind === "ornament") {
      node.className = "storybook-ornament";
      if (block.flourish) {
        const flourish = document.createElement("span");
        flourish.className = "storybook-flourish";
        flourish.textContent = "❖";
        node.appendChild(flourish);
      }
      if (block.text) {
        const title = document.createElement("span");
        title.className = "storybook-scene-title";
        title.textContent = block.text;
        node.appendChild(title);
      }
    } else if (block.kind === "empty") {
      node.className = "muted storybook-para";
      node.textContent = block.text;
    } else {
      node.className = block.dropCap ? "storybook-para drop-cap" : "storybook-para";
      node.textContent = block.text;
    }
    host.appendChild(node);
  }
}

export function StorybookView() {
  const story = useStory();
  const { manuscriptScale, readerSkin, clearType } = story.project.comfort;
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [pages, setPages] = useState<StoryBlock[][]>([[]]);
  const measureRef = useRef<HTMLDivElement>(null);

  const illuminated = readerSkin === "illuminated";
  const blocks = useMemo(
    () => buildStoryBlocks(story.project, illuminated),
    [story.project, illuminated],
  );

  const bodyFont = clearType ? "var(--clear)" : "var(--serif)";

  useLayoutEffect(() => {
    const host = measureRef.current;
    if (!host) return;

    const measure = (slice: StoryBlock[]) => {
      fillMeasureHost(host, slice);
      return host.scrollHeight;
    };

    const nextPages = paginateBlocks(blocks, measure, CONTENT_HEIGHT);
    setPages(nextPages);
    setSpreadIndex((current) => Math.min(current, Math.max(0, Math.ceil(nextPages.length / 2) - 1)));
  }, [blocks, manuscriptScale, readerSkin, clearType, bodyFont]);

  const spreadCount = Math.max(1, Math.ceil(pages.length / 2));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (story.searchOpen) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) {
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        setSpreadIndex((current) => Math.max(0, current - 1));
      }
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        setSpreadIndex((current) => Math.min(spreadCount - 1, current + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spreadCount, story.searchOpen]);

  if (!story.project.chapters.length) {
    return (
      <section className="card">
        <h2>The storybook is empty</h2>
        <p className="muted">Write a chapter in the Hearth, then come back to read it here.</p>
      </section>
    );
  }

  const left = pages[spreadIndex * 2] ?? [];
  const right = pages[spreadIndex * 2 + 1];
  const leftTitle = left.find((block) => block.chapterTitle)?.chapterTitle ?? "Storybook";
  const rightTitle = right?.find((block) => block.chapterTitle)?.chapterTitle;
  const chromeTitle = rightTitle && rightTitle !== leftTitle ? `${leftTitle} / ${rightTitle}` : leftTitle;

  return (
    <div className="storybook" data-skin={readerSkin}>
      <div className="storybook-chrome">
        <label className="hearth-font">
          <span>Skin</span>
          <select
            aria-label="Storybook skin"
            value={readerSkin}
            onChange={(e) => story.setComfort({ readerSkin: e.target.value as ReaderSkin })}
          >
            <option value="glow">Glow</option>
            <option value="illuminated">Illuminated</option>
          </select>
        </label>
        <label className="hearth-size">
          <span>Size</span>
          <input
            type="range"
            min={0.7}
            max={1.6}
            step={0.05}
            aria-label="Storybook type size"
            value={manuscriptScale}
            onChange={(e) => story.setComfort({ manuscriptScale: Number(e.target.value) })}
          />
        </label>
        <h2 className="storybook-chrome-title">{chromeTitle}</h2>
        <div className="row storybook-nav">
          <button className="btn" type="button" disabled={spreadIndex <= 0} onClick={() => setSpreadIndex((i) => i - 1)}>
            Previous
          </button>
          <span className="muted storybook-spread-label">
            Spread {spreadIndex + 1} / {spreadCount}
          </span>
          <button
            className="btn"
            type="button"
            disabled={spreadIndex >= spreadCount - 1}
            onClick={() => setSpreadIndex((i) => i + 1)}
          >
            Next
          </button>
        </div>
      </div>

      <article
        className="storybook-book"
        style={
          {
            fontFamily: bodyFont,
            fontSize: `${manuscriptScale}rem`,
            "--story-page-width": `${PAGE_WIDTH}px`,
            "--story-page-height": `${PAGE_HEIGHT}px`,
          } as CSSProperties
        }
      >
        <div className="storybook-spread" role="group" aria-label={`Open book, spread ${spreadIndex + 1}`}>
          <PageFace blocks={left} label={`${spreadIndex * 2 + 1}`} />
          <div className="storybook-gutter" aria-hidden="true" />
          <PageFace
            blocks={right ?? []}
            label={right ? `${spreadIndex * 2 + 2}` : ""}
            blank={!right}
          />
        </div>
      </article>

      <div
        ref={measureRef}
        className="storybook-measure"
        data-skin={readerSkin}
        style={{ fontFamily: bodyFont, fontSize: `${manuscriptScale}rem`, width: PAGE_WIDTH }}
        aria-hidden="true"
      />
    </div>
  );
}
