import { Field } from "../components/ui";
import { useStory } from "../lib/store";
import type { ThreadEvent } from "../types";

export function ThreadsView() {
  const story = useStory();
  const event =
    story.project.events.find((item) => item.id === story.selectedEventId) ?? story.project.events[0];

  const update = (patch: Partial<ThreadEvent>) => {
    if (!event) return;
    story.saveEvent({ ...event, ...patch });
  };

  const sorted = [...story.project.events].sort((a, b) => a.monthIndex - b.monthIndex || a.day - b.day);

  return (
    <div className="workspace">
      <aside className="list-pane">
        <button
          className="btn primary full"
          onClick={() => {
            story.addEvent();
          }}
        >
          Add an event
        </button>
        {sorted.map((item) => {
          const month = story.project.months[item.monthIndex]?.name ?? "Month";
          return (
            <button key={item.id} className={item.id === event?.id ? "list-item on" : "list-item"} onClick={() => story.selectEvent(item.id)}>
              <strong>{item.title}</strong>
              <span>
                {item.day} {month}
              </span>
            </button>
          );
        })}
      </aside>
      {event ? (
        <section className="editor card">
          <div className="editor-head">
            <h2>{event.title}</h2>
            <button className="btn danger" onClick={() => story.deleteEvent(event.id)}>
              Remove
            </button>
          </div>
          <Field label="Title">
            <input value={event.title} onChange={(e) => update({ title: e.target.value })} />
          </Field>
          <div className="form-grid">
            <Field label="Month">
              <select value={event.monthIndex} onChange={(e) => update({ monthIndex: Number(e.target.value) })}>
                {story.project.months.map((month, index) => (
                  <option key={month.id} value={index}>
                    {month.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Day">
              <input type="number" min={1} max={40} value={event.day} onChange={(e) => update({ day: Number(e.target.value) })} />
            </Field>
            <Field label="Year">
              <input type="number" value={event.year} onChange={(e) => update({ year: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="What happened">
            <textarea rows={5} value={event.summary} onChange={(e) => update({ summary: e.target.value })} />
          </Field>
          <p className="eyebrow">Who was there</p>
          <div className="chip-row">
            {story.project.characters.map((character) => {
              const on = event.characterIds.includes(character.id);
              return (
                <button
                  key={character.id}
                  className={on ? "chip on" : "chip"}
                  onClick={() =>
                    update({
                      characterIds: on
                        ? event.characterIds.filter((id) => id !== character.id)
                        : [...event.characterIds, character.id],
                    })
                  }
                >
                  {character.name}
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="card">The thread is empty. Add the first event.</section>
      )}
    </div>
  );
}
