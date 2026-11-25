import { useEffect, useMemo, useState } from "react";
import {
  BUILTIN_PLUGINS,
  buildWorldContext,
  pluginFromCustom,
  renderTemplate,
  streamOllamaChat,
} from "../lib/ai";
import { useStory } from "../lib/store";
import type { Scene } from "../types";
import { Lumen } from "./ui";

const DESK_PLUGIN_IDS = new Set(["continue", "warm", "turn", "interview", "ask"]);

type LumenMood = "standby" | "thinking" | "ready";

export function DeskCompanion({ scene }: { scene: Scene }) {
  const story = useStory();
  const { comfort } = story.project;
  const [open, setOpen] = useState(true);
  const [output, setOutput] = useState("");
  const [promptPreview, setPromptPreview] = useState("");
  const [question, setQuestion] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mood, setMood] = useState<LumenMood>("standby");

  useEffect(() => {
    if (mood !== "ready") return;
    const timer = window.setTimeout(() => setMood("standby"), 3000);
    return () => window.clearTimeout(timer);
  }, [mood]);

  const plugins = useMemo(
    () => [
      ...BUILTIN_PLUGINS.filter((plugin) => DESK_PLUGIN_IDS.has(plugin.id)),
      ...comfort.customPlugins.map(pluginFromCustom),
    ],
    [comfort.customPlugins],
  );

  const askModel = async (id: string, prompt: string) => {
    if (!comfort.ollamaModel) {
      setStatus("Choose a local model in Settings first.");
      return;
    }
    setActiveId(id);
    setPromptPreview(prompt);
    setOutput("");
    setBusy(true);
    setMood("thinking");
    setStatus("Thinking…");
    try {
      await streamOllamaChat(comfort.ollamaUrl, comfort.ollamaModel, prompt, (chunk) => {
        setOutput((current) => current + chunk);
      });
      setMood("ready");
      setStatus("Suggestion ready. Nothing was written into your scene.");
    } catch (error) {
      setMood("standby");
      setStatus(error instanceof Error ? error.message : "The model stopped");
    } finally {
      setBusy(false);
    }
  };

  const run = async (id: string) => {
    const plugin = plugins.find((item) => item.id === id);
    if (!plugin) return;
    const context = buildWorldContext(story.project, scene.id);
    const prompt = renderTemplate(plugin.template, context, question);
    await askModel(id, prompt);
  };

  const runCustom = async () => {
    const request = customPrompt.trim();
    if (!request) {
      setStatus("Write a custom prompt first.");
      return;
    }
    const context = buildWorldContext(story.project, scene.id);
    const prompt = `${request}\n\nUse the open scene and world notes below when helpful. Return only the suggestion.\n\n{{scene}}\n\n{{world}}`
      .replaceAll("{{scene}}", context.sceneBody || "(empty scene)")
      .replaceAll("{{world}}", context.packet);
    await askModel("custom", prompt);
  };

  const append = () => {
    if (!output.trim()) return;
    story.saveScene({ ...scene, body: `${scene.body.trim()}\n\n${output.trim()}\n` }, { checkpoint: true });
    setStatus("Appended to the scene. Undo if you need to revert.");
  };

  const replace = () => {
    if (!output.trim()) return;
    story.saveScene({ ...scene, body: `${output.trim()}\n` }, { checkpoint: true });
    setStatus("Replaced the scene body. Undo if you need to revert.");
  };

  const undo = () => {
    if (!story.sceneUndoDepth) return;
    story.undoSceneBody();
    setStatus("Restored the previous scene revision.");
  };

  const modelLabel = comfort.ollamaModel
    ? comfort.ollamaModel
    : "No model selected";

  return (
    <section className={open ? "desk-companion open" : "desk-companion"}>
      <button type="button" className="desk-companion-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <Lumen size={28} lit={story.project.lampLit} />
        <span>Lumen{comfort.ollamaModel ? ` - ${comfort.ollamaModel}` : ""}</span>
        <em>{open ? "Hide" : "Show"}</em>
      </button>
      {open ? (
        <div className="desk-companion-body stack">
          <div className="row spread wrap">
            <div className="desk-companion-status-line">
              <span
                className={`desk-lumen is-${mood}`}
                aria-label={mood === "thinking" ? "Lumen is thinking" : mood === "ready" ? "Lumen finished" : "Lumen on standby"}
              >
                <Lumen size={22} lit={mood !== "standby"} />
              </span>
              <p className="muted desk-companion-status">
                {status || (comfort.ollamaModel ? `Ready · ${modelLabel}` : "Choose a model in Settings")}
              </p>
            </div>
            {!comfort.ollamaModel ? (
              <button type="button" className="btn" onClick={() => story.setView("settings")}>
                Open Settings
              </button>
            ) : null}
          </div>
          <div className="chip-row desk-companion-tools">
            {plugins.map((plugin) => (
              <button
                key={plugin.id}
                type="button"
                className={activeId === plugin.id ? "chip on" : "chip"}
                disabled={busy}
                title={plugin.blurb}
                onClick={() => void run(plugin.id)}
              >
                {busy && activeId === plugin.id ? (
                  <span className="desk-thinking-label">
                    <span className="desk-lumen is-thinking" aria-hidden="true">
                      <Lumen size={16} lit />
                    </span>
                    Thinking…
                  </span>
                ) : (
                  plugin.name
                )}
              </button>
            ))}
            <button
              type="button"
              className={customOpen || activeId === "custom" ? "chip on" : "chip"}
              disabled={busy}
              title="Write your own prompt for this scene"
              onClick={() => setCustomOpen((value) => !value)}
            >
              Custom prompt
            </button>
          </div>
          <label className="field">
            <span>Question (for Ask your world)</span>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask anything — Lumen gets the full novel and world notes"
              disabled={busy}
            />
          </label>
          {customOpen ? (
            <label className="field">
              <span>Custom prompt</span>
              <textarea
                className="desk-companion-custom"
                rows={4}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Tell Lumen what to do with this scene…"
                disabled={busy}
              />
              <button
                type="button"
                className="btn primary"
                disabled={busy || !customPrompt.trim()}
                onClick={() => void runCustom()}
              >
                {busy && activeId === "custom" ? (
                  <span className="desk-thinking-label">
                    <span className="desk-lumen is-thinking" aria-hidden="true">
                      <Lumen size={16} lit />
                    </span>
                    Thinking…
                  </span>
                ) : (
                  "Send custom prompt"
                )}
              </button>
            </label>
          ) : null}
          {output ? (
            <>
              <pre className="suggestion desk-companion-suggestion">{output}</pre>
              <div className="row wrap">
                <button type="button" className="btn primary" disabled={busy || !output.trim()} onClick={append}>
                  Append to scene
                </button>
                <button type="button" className="btn" disabled={busy || !output.trim()} onClick={replace}>
                  Replace scene
                </button>
              </div>
            </>
          ) : (
            <p className="muted">Pick a tool to expand or revise this scene. Suggestions stay here until you append or replace.</p>
          )}
          <div className="row wrap">
            <button
              type="button"
              className="btn"
              disabled={!story.sceneUndoDepth}
              onClick={undo}
              title="Restore the previous scene text (up to 10 revisions)"
            >
              Undo
            </button>
          </div>
          {promptPreview ? (
            <details>
              <summary>What was sent</summary>
              <pre className="suggestion">{promptPreview}</pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
