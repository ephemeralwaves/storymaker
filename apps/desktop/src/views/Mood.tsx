import { useState } from "react";
import { Empty } from "../components/ui";
import { useStory } from "../lib/store";
import { shrinkImage } from "../lib/util";

export function MoodView() {
  const story = useStory();
  const [note, setNote] = useState("");
  const [color, setColor] = useState("#e2a15a");
  const [colorName, setColorName] = useState("New swatch");

  return (
    <div className="stack">
      <section className="card row spread wrap">
        <div className="row">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Swatch color" />
          <input value={colorName} onChange={(e) => setColorName(e.target.value)} aria-label="Swatch name" />
          <button className="btn" onClick={() => story.addMood({ kind: "color", title: colorName, value: color })}>
            Pin color
          </button>
        </div>
        <div className="row">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="A note about the mood" />
          <button
            className="btn"
            onClick={() => {
              if (!note.trim()) return;
              story.addMood({ kind: "note", title: "Note", value: note.trim() });
              setNote("");
            }}
          >
            Pin note
          </button>
          <label className="btn">
            Pin image
            <input
              hidden
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void shrinkImage(file).then((value) => story.addMood({ kind: "image", title: file.name, value }));
              }}
            />
          </label>
        </div>
      </section>
      {story.project.mood.length === 0 ? (
        <Empty title="A blank board" text="Pin a color, a sentence, or a picture. This board stays on your machine." />
      ) : (
        <section className="mood-grid">
          {story.project.mood.map((card) => (
            <article key={card.id} className="mood-card card">
              {card.kind === "color" ? <div className="swatch" style={{ background: card.value }} /> : null}
              {card.kind === "image" ? <img src={card.value} alt={card.title} /> : null}
              <div className="row spread">
                <strong>{card.kind === "note" ? card.value : card.title}</strong>
                <button className="text-btn" onClick={() => story.deleteMood(card.id)}>
                  Remove
                </button>
              </div>
              {card.kind === "color" ? <span className="muted">{card.value}</span> : null}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
