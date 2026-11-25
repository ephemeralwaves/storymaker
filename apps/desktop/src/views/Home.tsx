import { countWords, todayKey } from "../lib/util";
import { useStory } from "../lib/store";
import { AMBIENCES } from "../types";
import { Lumen } from "../components/ui";
import { ShelfView } from "./Shelf";

export function HomeView() {
  const story = useStory();
  const { project } = story;
  const words = project.scenes.reduce((sum, scene) => sum + countWords(scene.body), 0);
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (13 - index));
    const key = todayKey(date);
    return { key, label: key.slice(8), words: project.wordsByDay[key] ?? 0 };
  });
  const max = Math.max(40, ...days.map((day) => day.words));
  const mentions = project.characters
    .map((character) => {
      const blob = [...project.scenes.map((s) => s.body), ...project.lore.map((l) => l.body), ...project.events.map((e) => e.summary)].join("\n");
      const first = character.name.split(" ")[0] ?? character.name;
      const pattern = new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
      const hits = blob.match(pattern)?.length ?? 0;
      return { name: character.name, hits };
    })
    .sort((a, b) => b.hits - a.hits);

  return (
    <div className="stack">
      <ShelfView />
      {story.bookId ? (
      <>
      <section className="hero card">
        <Lumen size={88} lit={project.lampLit} />
        <div>
          <p className="eyebrow">Welcome back</p>
          <h2>{project.lampLit ? "The lamp is lit." : "The desk is ready whenever you are."}</h2>
          <p className="muted">{project.tagline}</p>
          <div className="row">
            {project.lampLit ? (
              <button className="btn primary" onClick={story.extinguishLamp}>
                Rest the lamp
              </button>
            ) : (
              <button className="btn primary" onClick={story.lightLamp}>
                Light the lamp
              </button>
            )}
            <button className="btn" onClick={() => story.setView("hearth")}>
              Open the hearth
            </button>
          </div>
        </div>
      </section>

      <section className="stat-grid">
        <article className="card stat">
          <span>People</span>
          <strong>{project.characters.length}</strong>
        </article>
        <article className="card stat">
          <span>Lore notes</span>
          <strong>{project.lore.length}</strong>
        </article>
        <article className="card stat">
          <span>Words on the page</span>
          <strong>{words.toLocaleString()}</strong>
        </article>
        <article className="card stat">
          <span>Hearth streak</span>
          <strong>{project.streak} {project.streak === 1 ? "day" : "days"}</strong>
        </article>
      </section>

      <section className="split">
        <article className="card">
          <h3>Recent days</h3>
          <div className="bars" aria-hidden="true">
            {days.map((day) => (
              <div key={day.key} className="bar-col" title={`${day.words} words`}>
                <div className="bar" style={{ height: `${Math.max(6, (day.words / max) * 100)}%` }} />
                <span>{day.label}</span>
              </div>
            ))}
          </div>
          <p className="muted">A streak is just a hearth that stayed warm. Missing a day only means you can light it again.</p>
        </article>
        <article className="card">
          <h3>Who the pages mention</h3>
          <ul className="mention-list">
            {mentions.map((item) => (
              <li key={item.name}>
                <span>{item.name}</span>
                <em>{item.hits}</em>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="card">
        <h3>Room tone</h3>
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
      </section>
      </>
      ) : null}
    </div>
  );
}
