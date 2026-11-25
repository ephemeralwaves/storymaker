import { Field, PictureField } from "../components/ui";
import { useStory } from "../lib/store";
import type { LoreEntry } from "../types";

export function LoreView() {
  const story = useStory();
  const selected = story.project.lore.find((item) => item.id === story.selectedLoreId) ?? story.project.lore[0];
  const backlinks = selected
    ? story.project.lore.filter((entry) => entry.id !== selected.id && entry.body.includes(selected.title))
    : [];

  const update = (patch: Partial<LoreEntry>) => {
    if (!selected) return;
    story.saveLore({ ...selected, ...patch });
  };

  return (
    <div className="workspace">
      <aside className="list-pane">
        <button className="btn primary full" onClick={story.addLore}>
          Add a note
        </button>
        {story.project.categories.map((category) => (
          <div key={category} className="group">
            <p className="eyebrow">{category}</p>
            {story.project.lore
              .filter((entry) => entry.category === category)
              .map((entry) => (
                <button
                  key={entry.id}
                  className={entry.id === selected?.id ? "list-item on" : "list-item"}
                  onClick={() => story.selectLore(entry.id)}
                >
                  <strong>{entry.title}</strong>
                  <span>{entry.summary || "No summary yet"}</span>
                </button>
              ))}
          </div>
        ))}
      </aside>
      {selected ? (
        <section className="editor card">
          <div className="editor-head">
            <h2>{selected.title}</h2>
            <button className="btn danger" onClick={() => story.deleteLore(selected.id)}>
              Archive note
            </button>
          </div>
          <div className="form-grid">
            <Field label="Title">
              <input value={selected.title} onChange={(e) => update({ title: e.target.value })} />
            </Field>
            <Field label="Shelf">
              <select value={selected.category} onChange={(e) => update({ category: e.target.value })}>
                {story.project.categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </Field>
          </div>
          <PictureField image={selected.image} onChange={(image) => update({ image })} />
          <Field label="Summary">
            <input value={selected.summary} onChange={(e) => update({ summary: e.target.value })} />
          </Field>
          <Field label="Note">
            <textarea rows={10} value={selected.body} onChange={(e) => update({ body: e.target.value })} />
          </Field>
          <div>
            <p className="eyebrow">Mentioned by</p>
            {backlinks.length === 0 ? <p className="muted">No other notes name this one yet.</p> : null}
            <div className="chip-row">
              {backlinks.map((entry) => (
                <button key={entry.id} className="chip" onClick={() => story.selectLore(entry.id)}>
                  {entry.title}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
