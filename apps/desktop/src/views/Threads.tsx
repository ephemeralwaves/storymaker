import { Field } from "../components/ui";
import { eventDate, reckonProject } from "../lib/calendar";
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

  const reckoner = reckonProject(story.project);
  const sorted = [...story.project.events].sort((a, b) => {
    if (a.undated !== b.undated) return a.undated ? 1 : -1;
    return reckoner.compare(eventDate(a), eventDate(b));
  });
  const shownYear = event ? reckoner.eraFor(event.year) : null;

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
        {sorted.map((item) => (
          <button key={item.id} className={item.id === event?.id ? "list-item on" : "list-item"} onClick={() => story.selectEvent(item.id)}>
            <strong>{item.title}</strong>
            <span>{item.undated ? "No date yet" : reckoner.formatDate(eventDate(item), "short-era")}</span>
          </button>
        ))}
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
          <div className="row wrap thread-date-line">
            <span className="muted">{event.undated ? "Waiting in the Calendar's list of undated threads." : reckoner.formatDate(eventDate(event))}</span>
            <label className="row thread-undated">
              <input type="checkbox" checked={Boolean(event.undated)} onChange={(e) => update({ undated: e.target.checked || undefined })} />
              No date yet
            </label>
          </div>
          <div className="form-grid" hidden={Boolean(event.undated)}>
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
              <input
                type="number"
                min={1}
                max={reckoner.monthDays(event.year, event.monthIndex)}
                value={event.day}
                onChange={(e) => update({ day: Math.min(Math.max(1, Number(e.target.value) || 1), reckoner.monthDays(event.year, event.monthIndex)) })}
              />
            </Field>
            <Field label="Year">
              <div className="row">
                <input
                  type="number"
                  min={1}
                  value={shownYear?.shown ?? event.year}
                  onChange={(e) => update({ year: reckoner.toTimelineYear(Math.max(1, Number(e.target.value) || 1), shownYear?.era?.id) })}
                />
                {story.project.calendar.eras.length > 1 ? (
                  <select
                    aria-label="Era"
                    value={shownYear?.era?.id ?? ""}
                    onChange={(e) => update({ year: reckoner.toTimelineYear(shownYear?.shown ?? 1, e.target.value) })}
                  >
                    {story.project.calendar.eras.map((era) => (
                      <option key={era.id} value={era.id}>
                        {era.short || era.name}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
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
