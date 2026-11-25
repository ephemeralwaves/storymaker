import { countWords } from "../lib/util";
import { useStory } from "../lib/store";
import { SCENE_STATUSES, type ManuscriptFont, type Scene } from "../types";
import { Field } from "../components/ui";

export function HearthView() {
  const story = useStory();
  const scene = story.project.scenes.find((item) => item.id === story.selectedSceneId) ?? story.project.scenes[0];
  const words = scene ? countWords(scene.body) : 0;
  const { manuscriptFont, manuscriptScale } = story.project.comfort;
  const fontFamily = manuscriptFont === "sans" ? "var(--sans)" : manuscriptFont === "clear" ? "var(--clear)" : "var(--serif)";

  const update = (patch: Partial<Scene>) => {
    if (!scene) return;
    story.saveScene({ ...scene, ...patch });
  };

  return (
    <div className={story.focusMode ? "hearth focus" : "hearth"}>
      <aside className="list-pane binder">
        <button className="btn full" onClick={story.addChapter}>
          Add chapter
        </button>
        {story.project.chapters
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((chapter) => (
            <div key={chapter.id} className="group">
              <div className="row spread">
                <p className="eyebrow">{chapter.title}</p>
                <button className="text-btn" onClick={() => story.addScene(chapter.id)}>
                  + scene
                </button>
              </div>
              {story.project.scenes
                .filter((item) => item.chapterId === chapter.id)
                .sort((a, b) => a.order - b.order)
                .map((item) => (
                  <button
                    key={item.id}
                    className={item.id === scene?.id ? "list-item on" : "list-item"}
                    onClick={() => story.selectScene(item.id)}
                  >
                    <strong>{item.title}</strong>
                    <span>
                      {item.status} · {countWords(item.body)} words
                    </span>
                  </button>
                ))}
            </div>
          ))}
      </aside>
      {scene ? (
        <section className="page">
          <div className="editor-head">
            <input className="title-input" value={scene.title} onChange={(e) => update({ title: e.target.value })} />
            <div className="row">
              <select value={scene.status} onChange={(e) => update({ status: e.target.value as Scene["status"] })}>
                {SCENE_STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
              <label className="hearth-font">
                <span>Font</span>
                <select
                  aria-label="Manuscript font"
                  value={manuscriptFont}
                  onChange={(e) => story.setComfort({ manuscriptFont: e.target.value as ManuscriptFont })}
                >
                  <option value="serif">Fraunces</option>
                  <option value="sans">Nunito</option>
                  <option value="clear">Atkinson</option>
                </select>
              </label>
              <label className="hearth-size">
                <span>Size</span>
                <input
                  type="range"
                  min={0.7}
                  max={1.6}
                  step={0.05}
                  aria-label="Manuscript size"
                  value={manuscriptScale}
                  onChange={(e) => story.setComfort({ manuscriptScale: Number(e.target.value) })}
                />
              </label>
              <button className="btn" onClick={() => story.setFocusMode(!story.focusMode)}>
                {story.focusMode ? "Show the room" : "Focus"}
              </button>
            </div>
          </div>
          <textarea
            className="manuscript"
            style={{ fontFamily, fontSize: `${manuscriptScale}rem` }}
            value={scene.body}
            onChange={(e) => update({ body: e.target.value })}
            placeholder="Write the piece that is alive. Structure can come later."
          />
          <footer className="page-meta">
            <span>
              {words.toLocaleString()} / {scene.goal.toLocaleString()} words
            </span>
            <span>{story.project.lampLit ? `Session ${story.sessionWords} words` : "Lamp resting"}</span>
            <label>
              Goal
              <input
                type="number"
                min={50}
                value={scene.goal}
                onChange={(e) => update({ goal: Number(e.target.value) })}
              />
            </label>
          </footer>
          <aside className="context">
          <h3>On the desk</h3>
          <Field label="People in the scene">
            <div className="chip-row">
              {story.project.characters.map((character) => {
                const on = scene.characterIds.includes(character.id);
                return (
                  <button
                    key={character.id}
                    className={on ? "chip on" : "chip"}
                    onClick={() =>
                      update({
                        characterIds: on
                          ? scene.characterIds.filter((id) => id !== character.id)
                          : [...scene.characterIds, character.id],
                      })
                    }
                  >
                    {character.name}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Lore within reach">
            <div className="chip-row">
              {story.project.lore.map((entry) => {
                const on = scene.loreIds.includes(entry.id);
                return (
                  <button
                    key={entry.id}
                    className={on ? "chip on" : "chip"}
                    onClick={() =>
                      update({
                        loreIds: on ? scene.loreIds.filter((id) => id !== entry.id) : [...scene.loreIds, entry.id],
                      })
                    }
                  >
                    {entry.title}
                  </button>
                );
              })}
            </div>
          </Field>
          <button className="btn danger" onClick={() => story.deleteScene(scene.id)}>
            Set this scene aside
          </button>
          </aside>
        </section>
      ) : (
        <section className="card">Add a scene when you are ready.</section>
      )}
    </div>
  );
}
