import { Field, PictureField } from "../components/ui";
import { useStory } from "../lib/store";
import { ROLES, type Character } from "../types";

export function PeopleView() {
  const story = useStory();
  const selected = story.project.characters.find((item) => item.id === story.selectedCharacterId) ?? story.project.characters[0];

  const update = (patch: Partial<Character>) => {
    if (!selected) return;
    story.saveCharacter({ ...selected, ...patch });
  };

  return (
    <div className="workspace">
      <aside className="list-pane">
        <button className="btn primary full" onClick={story.addCharacter}>
          Add a person
        </button>
        {story.project.characters.map((character) => (
          <button
            key={character.id}
            className={character.id === selected?.id ? "list-item on" : "list-item"}
            onClick={() => story.selectCharacter(character.id)}
          >
            <strong>{character.name}</strong>
            <span>{character.role}</span>
          </button>
        ))}
      </aside>
      {selected ? (
        <section className="editor card">
          <div className="editor-head">
            <h2>{selected.name}</h2>
            <button
              className="btn danger"
              onClick={() => {
                if (
                  confirm(
                    `Let ${selected.name} rest? This permanently deletes this character and removes their bonds from the board.`,
                  )
                ) {
                  story.deleteCharacter(selected.id);
                }
              }}
            >
              Let them rest
            </button>
          </div>
          <div className="form-grid">
            <Field label="Name">
              <input value={selected.name} onChange={(e) => update({ name: e.target.value })} />
            </Field>
            <Field label="Role">
              <select value={selected.role} onChange={(e) => update({ role: e.target.value as Character["role"] })}>
                {ROLES.map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            </Field>
            <Field label="Age">
              <input value={selected.age} onChange={(e) => update({ age: e.target.value })} />
            </Field>
            <Field label="Origin">
              <input value={selected.origin} onChange={(e) => update({ origin: e.target.value })} />
            </Field>
            <Field label="Gift">
              <input value={selected.gift} onChange={(e) => update({ gift: e.target.value })} />
            </Field>
            <Field label="Status">
              <input value={selected.status} onChange={(e) => update({ status: e.target.value })} />
            </Field>
          </div>
          <PictureField image={selected.image} onChange={(image) => update({ image })} />
          <Field label="Personality">
            <input value={selected.personality} onChange={(e) => update({ personality: e.target.value })} />
          </Field>
          <Field label="In a sentence">
            <textarea rows={2} value={selected.summary} onChange={(e) => update({ summary: e.target.value })} />
          </Field>
          <Field label="Backstory">
            <textarea rows={4} value={selected.backstory} onChange={(e) => update({ backstory: e.target.value })} />
          </Field>
          <Field label="Habits">
            <textarea rows={2} value={selected.habits} onChange={(e) => update({ habits: e.target.value })} />
          </Field>
          <Field label="What they are afraid of losing">
            <textarea rows={2} value={selected.fears} onChange={(e) => update({ fears: e.target.value })} />
          </Field>
        </section>
      ) : (
        <section className="card">Add someone to keep at the desk.</section>
      )}
    </div>
  );
}
