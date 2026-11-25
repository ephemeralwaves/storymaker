import { useMemo, type CSSProperties } from "react";
import { leatherFor } from "../lib/leather";
import { smartQuotes } from "../lib/storybookPages";
import { useStory } from "../lib/store";
import { countWords, todayKey } from "../lib/util";
import { AMBIENCES, type Character, type LoreEntry, type Project, type Scene } from "../types";
import { ShelfView } from "./Shelf";

const THREAD_COLORS = ["var(--accent)", "#5d7fb8", "#4f9a6b", "#a8455f", "#8a6ab8", "#c9923d"];

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** The scene to pick up: the one open in the Hearth, or else the last one in reading order. */
function sceneToContinue(project: Project, selectedId: string | null): Scene | undefined {
  const selected = project.scenes.find((scene) => scene.id === selectedId);
  if (selected) return selected;
  const chapterOrder = new Map(project.chapters.map((chapter) => [chapter.id, chapter.order]));
  return project.scenes
    .slice()
    .sort((a, b) => (chapterOrder.get(a.chapterId) ?? 0) - (chapterOrder.get(b.chapterId) ?? 0) || a.order - b.order)
    .at(-1);
}

function lastLine(body: string): string {
  const paragraphs = body.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const last = paragraphs.at(-1) ?? "";
  const sentences = last.match(/[^.!?…]+[.!?…]+["”’)]*/g) ?? [last];
  const tail = sentences.slice(-2).join(" ").trim();
  return smartQuotes(tail.length > 180 ? `…${tail.slice(-180).replace(/^\S*\s/, "")}` : tail);
}

function GoalRing({ words, goal }: { words: number; goal: number }) {
  const r = 50;
  const circumference = 2 * Math.PI * r;
  const share = goal > 0 ? Math.min(1, words / goal) : 0;
  return (
    <svg className="home-ring" viewBox="0 0 120 120" role="img" aria-label={goal > 0 ? `${words} of ${goal} words` : `${words} words`}>
      <circle cx="60" cy="60" r={r} className="home-ring-track" />
      <circle
        cx="60"
        cy="60"
        r={r}
        className="home-ring-fill"
        strokeDasharray={`${share * circumference} ${circumference}`}
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="58" textAnchor="middle" className="home-ring-num">{words.toLocaleString()}</text>
      <text x="60" y="78" textAnchor="middle" className="home-ring-cap">{goal > 0 ? `of ${goal.toLocaleString()} words` : "words"}</text>
    </svg>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 280;
  const h = 54;
  const max = Math.max(40, ...values);
  const step = w / Math.max(1, values.length - 1);
  const points = values.map((value, i) => [i * step, h - 4 - (value / max) * (h - 10)] as const);
  const line = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx, ly] = points[points.length - 1] ?? [w, h];
  return (
    <svg className="home-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${line} L${w} ${h} L0 ${h} Z`} className="home-spark-area" />
      <path d={line} className="home-spark-line" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="3.5" className="home-spark-dot" />
    </svg>
  );
}

function LoreArt({ entry, index }: { entry: LoreEntry; index: number }) {
  if (entry.image) return <img src={entry.image} alt="" />;
  const tint = leatherFor(index * 3 + entry.category.length);
  return (
    <svg viewBox="0 0 160 58" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="160" height="58" fill={tint} />
      <path d="M0 42q20-8 40 0t40 0 40 0 40 0V58H0z" fill="rgba(0,0,0,.25)" />
      <circle cx={30 + ((index * 37) % 100)} cy="22" r="10" fill="rgba(255,236,180,.22)" />
      <text x="80" y="36" textAnchor="middle" className="home-lore-glyph">{entry.title.slice(0, 1).toUpperCase()}</text>
    </svg>
  );
}

export function HomeView() {
  const story = useStory();
  const { project } = story;

  const scene = sceneToContinue(project, story.selectedSceneId);
  const chapter = scene ? project.chapters.find((item) => item.id === scene.chapterId) : undefined;
  const sceneWords = scene ? countWords(scene.body) : 0;

  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (13 - index));
    return project.wordsByDay[todayKey(date)] ?? 0;
  });
  const fortnight = days.reduce((sum, value) => sum + value, 0);

  const pageText = useMemo(
    () => [...project.scenes.map((s) => s.body), ...project.lore.map((l) => l.body), ...project.events.map((e) => e.summary)].join("\n"),
    [project.scenes, project.lore, project.events],
  );

  const people = project.characters.slice(0, 4).map((character, index) => {
    const first = character.name.split(" ")[0] || character.name;
    const mentions = first ? pageText.match(new RegExp(`\\b${escapeRegExp(first)}\\b`, "gi"))?.length ?? 0 : 0;
    const bonds = project.relationships
      .filter((rel) => rel.fromId === character.id || rel.toId === character.id)
      .map((rel) => project.characters.find((other) => other.id === (rel.fromId === character.id ? rel.toId : rel.fromId)))
      .filter((other): other is Character => Boolean(other))
      .map((other) => other.name.split(" ")[0]);
    return { character, index, mentions, bonds: [...new Set(bonds)].slice(0, 3) };
  });

  const lore = project.lore.slice(-4).reverse().map((entry) => {
    const title = entry.title.trim();
    const links = title
      ? [...project.lore.filter((other) => other.id !== entry.id).map((other) => other.body), ...project.scenes.map((s) => s.body)].filter((text) =>
          text.toLowerCase().includes(title.toLowerCase()),
        ).length
      : 0;
    return { entry, links };
  });

  const months = project.months.length ? project.months : [{ id: "m", name: "Year", days: 30 }];
  const events = project.events
    .filter((event) => event.year === project.year)
    .map((event) => {
      const month = months[Math.min(months.length - 1, Math.max(0, event.monthIndex))];
      const at = (Math.max(0, event.monthIndex) + (Math.max(1, event.day) - 1) / Math.max(1, month.days)) / months.length;
      return { event, at: Math.min(0.97, at), month };
    })
    .sort((a, b) => a.at - b.at);
  const laneEnds: number[] = [];
  const placed = events.map((item) => {
    let lane = laneEnds.findIndex((end) => item.at > end);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = item.at + 0.2;
    return { ...item, lane };
  });
  const lanes = Math.max(1, laneEnds.length);

  const openCharacter = (id: string) => {
    story.selectCharacter(id);
    story.setView("people");
  };
  const openLore = (id: string) => {
    story.selectLore(id);
    story.setView("lore");
  };

  return (
    <div className="home-grid">
      <section className="card home-shelf-card home-span-12">
        <div className="home-card-head">
          <div>
            <h3>Your shelf</h3>
            <p className="muted">Each book is its own story, kept on this computer.</p>
          </div>
          <div className="chip-row home-promise" aria-label="Privacy">
            <span className="chip">Offline</span>
            <span className="chip">Private</span>
            <span className="chip">AI only when you ask</span>
          </div>
        </div>
        <ShelfView />
      </section>

      {story.bookId ? (
        <>
          <section className="card home-continue home-span-8">
            <div className="home-continue-text">
              <p className="eyebrow home-gold">{scene ? "Pick up where you left off" : "A blank first page"}</p>
              <h2>{scene ? scene.title || "Untitled scene" : "Begin the first scene"}</h2>
              {chapter ? <p className="muted home-chapter">{chapter.title}</p> : null}
              {scene && scene.body.trim() ? <p className="home-excerpt">{lastLine(scene.body)}</p> : <p className="home-excerpt">{project.tagline}</p>}
              <div className="row wrap">
                <button
                  className="btn primary"
                  onClick={() => {
                    if (scene) story.selectScene(scene.id);
                    story.setView("hearth");
                  }}
                >
                  ✎ Write in the Hearth
                </button>
                <button className="btn" onClick={() => story.setView("storybook")} disabled={!project.chapters.length}>
                  Read in the Storybook
                </button>
                <button className="btn home-lamp-btn" onClick={project.lampLit ? story.extinguishLamp : story.lightLamp}>
                  <i className={project.lampLit ? "flame on" : "flame"} /> {project.lampLit ? "Rest the lamp" : "Light the lamp"}
                </button>
              </div>
            </div>
            {scene ? <GoalRing words={sceneWords} goal={scene.goal} /> : null}
          </section>

          <section className="card home-span-4 home-fortnight">
            <div className="home-card-head">
              <h3>This fortnight</h3>
            </div>
            <div className="home-stats">
              <div className="home-stat">
                <b>{fortnight.toLocaleString()}</b>
                <span>words written</span>
              </div>
              <div className="home-stat">
                <b>{project.streak} {project.streak === 1 ? "day" : "days"}</b>
                <span>lamp lit in a row</span>
              </div>
            </div>
            <Sparkline values={days} />
            <p className="muted home-small">A streak is just a hearth that stayed warm. Missing a day only means you can light it again.</p>
            <div className="home-tone">
              <span className="muted home-small">Room tone</span>
              <div className="chip-row">
                {AMBIENCES.map((item) => (
                  <button
                    key={item.id}
                    className={project.comfort.ambience === item.id ? "chip on" : "chip"}
                    onClick={() => story.setComfort({ ambience: item.id })}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="card home-span-7">
            <div className="home-card-head">
              <h3>People</h3>
              <button className="text-btn" onClick={() => story.setView("people")}>
                {project.characters.length ? `All ${project.characters.length} →` : "Add someone →"}
              </button>
            </div>
            {people.length ? (
              <div className="home-people">
                {people.map(({ character, index, mentions, bonds }) => (
                  <button key={character.id} className="home-person" onClick={() => openCharacter(character.id)}>
                    {character.image ? (
                      <img className="home-crest" src={character.image} alt="" />
                    ) : (
                      <span className="home-crest" style={{ "--leather": leatherFor(index * 2 + 1) } as CSSProperties} aria-hidden="true">
                        {initials(character.name)}
                      </span>
                    )}
                    <strong>{character.name || "Unnamed"}</strong>
                    <span className="home-chip home-chip-role">{character.role}</span>
                    <span className="home-person-summary">{character.summary}</span>
                    <span className="home-person-foot">
                      {bonds.map((name) => (
                        <span key={name} className="home-chip home-chip-bond">{name}</span>
                      ))}
                      <span className="home-mentions">{mentions === 1 ? "1 mention" : `${mentions} mentions`}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">No one has walked onto the page yet.</p>
            )}
          </section>

          <section className="card home-span-5">
            <div className="home-card-head">
              <h3>Lore</h3>
              <button className="text-btn" onClick={() => story.setView("lore")}>
                {project.lore.length ? `${project.lore.length} notes →` : "Start a note →"}
              </button>
            </div>
            {lore.length ? (
              <div className="home-lore">
                {lore.map(({ entry, links }, index) => (
                  <button key={entry.id} className="home-tile" onClick={() => openLore(entry.id)}>
                    <span className="home-tile-art">
                      <LoreArt entry={entry} index={index} />
                    </span>
                    <span className="home-tile-text">
                      <strong>{entry.title || "Untitled"}</strong>
                      <small>
                        {entry.category}
                        {links ? ` · ${links} ${links === 1 ? "link" : "links"}` : ""}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">Places, objects and customs will gather here.</p>
            )}
          </section>

          <section className="card home-span-12">
            <div className="home-card-head">
              <h3>
                {project.eraName} {project.year}
              </h3>
              <button className="text-btn" onClick={() => story.setView("threads")}>
                Open Threads →
              </button>
            </div>
            <div className="home-timeline">
              <div className="home-tl" style={{ "--lanes": lanes, "--months": months.length } as CSSProperties}>
                {placed.map(({ event, at, lane, month }, i) => {
                  const lead = project.characters.findIndex((c) => c.id === event.characterIds[0]);
                  const names = event.characterIds
                    .map((id) => project.characters.find((c) => c.id === id)?.name.split(" ")[0])
                    .filter(Boolean)
                    .join(", ");
                  return (
                    <button
                      key={event.id}
                      className="home-event"
                      style={{ left: `${at * 100}%`, "--lane": lane, "--dot": THREAD_COLORS[(lead >= 0 ? lead : i) % THREAD_COLORS.length] } as CSSProperties}
                      onClick={() => story.openEvent(event.id)}
                    >
                      <strong>{event.title || "Untitled thread"}</strong>
                      <span>
                        {month.name} {event.day}
                        {names ? ` · ${names}` : ""}
                      </span>
                    </button>
                  );
                })}
                {months.map((month) => (
                  <span key={month.id} className="home-month">{month.name}</span>
                ))}
              </div>
              {!placed.length ? <p className="muted home-small">No threads dated in {project.year} yet. Add one in Threads or on the Calendar.</p> : null}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
