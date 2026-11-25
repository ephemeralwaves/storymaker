import { useMemo, useState } from "react";
import {
  BUILTIN_PLUGINS,
  buildWorldContext,
  listMcpTools,
  listOllamaModels,
  mcpRpc,
  pluginFromCustom,
  renderTemplate,
  streamOllamaChat,
  type McpTool,
} from "../lib/ai";
import { useStory } from "../lib/store";
import { uid } from "../lib/util";

export function StudioView() {
  const story = useStory();
  const { comfort } = story.project;
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState("Not connected");
  const [output, setOutput] = useState("");
  const [promptPreview, setPromptPreview] = useState("");
  const [question, setQuestion] = useState("What is Mira protecting?");
  const [busy, setBusy] = useState(false);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [mcpStatus, setMcpStatus] = useState("No MCP server connected");
  const [pluginName, setPluginName] = useState("My prompt");
  const [pluginTemplate, setPluginTemplate] = useState("Using this world, suggest one cozy scene idea.\n\n{{world}}");

  const plugins = useMemo(
    () => [...BUILTIN_PLUGINS, ...comfort.customPlugins.map(pluginFromCustom)],
    [comfort.customPlugins],
  );
  const context = buildWorldContext(story.project, story.selectedSceneId);

  const connect = async () => {
    setStatus("Looking for Ollama…");
    try {
      const found = await listOllamaModels(comfort.ollamaUrl);
      const names = found.map((model) => model.name);
      setModels(names);
      const onDevice = names.filter((name) => !name.endsWith(":cloud") && !name.includes("embed"));
      if (!comfort.ollamaModel) {
        const preferred = onDevice.find((name) => name.startsWith("llama")) ?? onDevice[0] ?? "";
        if (preferred) story.setComfort({ ollamaModel: preferred });
      }
      const cloudNote = comfort.ollamaModel.endsWith(":cloud") ? " The selected model is marked cloud, so a prompt may leave this machine." : "";
      setStatus(
        (names.length ? `Found ${names.length} model${names.length === 1 ? "" : "s"} (${onDevice.length} on this machine)` : "Ollama is up, with no models yet") +
          cloudNote,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not reach Ollama");
    }
  };

  const run = async (id: string) => {
    const plugin = plugins.find((item) => item.id === id);
    if (!plugin) return;
    if (!comfort.ollamaModel) {
      setStatus("Choose a local model first.");
      return;
    }
    const prompt = renderTemplate(plugin.template, context, question);
    setPromptPreview(prompt);
    setOutput("");
    setBusy(true);
    try {
      await streamOllamaChat(comfort.ollamaUrl, comfort.ollamaModel, prompt, (chunk) => {
        setOutput((current) => current + chunk);
      });
      setStatus("Suggestion ready. Nothing was written into your scene.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The model stopped");
    } finally {
      setBusy(false);
    }
  };

  const insert = () => {
    const scene = story.project.scenes.find((item) => item.id === story.selectedSceneId) ?? story.project.scenes[0];
    if (!scene || !output.trim()) return;
    story.saveScene({ ...scene, body: `${scene.body.trim()}\n\n${output.trim()}\n` });
    story.setView("hearth");
  };

  const connectMcp = async () => {
    setMcpStatus("Connecting…");
    try {
      const found = await listMcpTools(comfort.mcpUrl);
      setTools(found);
      setMcpStatus(found.length ? `${found.length} tools available` : "Connected, no tools reported");
    } catch (error) {
      setMcpStatus(error instanceof Error ? error.message : "Could not reach that MCP server");
    }
  };

  return (
    <div className="stack">
      <section className="card stack">
        <div className="row spread wrap">
          <div>
            <h2>AI Studio</h2>
            <p className="muted">Local models only. Suggestions stay suggestions until you insert them.</p>
          </div>
          <span className="pill">{status}</span>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Ollama address</span>
            <input value={comfort.ollamaUrl} onChange={(e) => story.setComfort({ ollamaUrl: e.target.value })} />
          </label>
          <label className="field">
            <span>Model</span>
            <select value={comfort.ollamaModel} onChange={(e) => story.setComfort({ ollamaModel: e.target.value })}>
              <option value="">Choose a model</option>
              {models.map((model) => (
                <option key={model}>{model}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="row">
          <button className="btn primary" onClick={() => void connect()}>
            Connect to Ollama
          </button>
          <span className="muted">Scene in context: {context.sceneTitle}</span>
        </div>
      </section>

      <section className="plugin-grid">
        {plugins.map((plugin) => (
          <article key={plugin.id} className="card plugin-card">
            <h3>{plugin.name}</h3>
            <p>{plugin.blurb}</p>
            <button className="btn" disabled={busy} onClick={() => void run(plugin.id)}>
              {busy ? "Thinking…" : "Ask"}
            </button>
          </article>
        ))}
      </section>

      <section className="card stack">
        <label className="field">
          <span>Question for “Ask your world”</span>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} />
        </label>
        {output ? (
          <>
            <h3>Suggestion</h3>
            <pre className="suggestion">{output}</pre>
            <button className="btn primary" onClick={insert}>
              Insert into the open scene
            </button>
          </>
        ) : (
          <p className="muted">A suggestion will appear here. You can read exactly what was sent below.</p>
        )}
        {promptPreview ? (
          <details>
            <summary>What was sent</summary>
            <pre className="suggestion">{promptPreview}</pre>
          </details>
        ) : null}
      </section>

      <section className="card stack">
        <h3>Your own prompt plugin</h3>
        <p className="muted">Use {"{{scene}}"}, {"{{world}}"}, and {"{{question}}"}.</p>
        <div className="form-grid">
          <input value={pluginName} onChange={(e) => setPluginName(e.target.value)} aria-label="Plugin name" />
          <button
            className="btn"
            onClick={() =>
              story.setComfort({
                customPlugins: [...comfort.customPlugins, { id: uid("plugin"), name: pluginName, template: pluginTemplate }],
              })
            }
          >
            Save plugin
          </button>
        </div>
        <textarea rows={4} value={pluginTemplate} onChange={(e) => setPluginTemplate(e.target.value)} />
      </section>

      <section className="card stack">
        <h3>MCP server</h3>
        <p className="muted">
          Connect a local server that speaks MCP over HTTP. Stdio servers are started from the desktop shell in a later step; this screen talks to an address you already trust.
        </p>
        <div className="row wrap">
          <input value={comfort.mcpUrl} onChange={(e) => story.setComfort({ mcpUrl: e.target.value })} aria-label="MCP URL" />
          <button className="btn" onClick={() => void connectMcp()}>
            List tools
          </button>
          <span className="pill">{mcpStatus}</span>
        </div>
        <ul className="mention-list">
          {tools.map((tool) => (
            <li key={tool.name}>
              <span>
                <strong>{tool.name}</strong>
                <br />
                {tool.description}
              </span>
              <button
                className="text-btn"
                onClick={() => {
                  void mcpRpc(comfort.mcpUrl, "tools/call", { name: tool.name, arguments: {} }, 3)
                    .then((result) => setOutput(JSON.stringify(result, null, 2)))
                    .catch((error: unknown) => setMcpStatus(error instanceof Error ? error.message : "Tool call failed"));
                }}
              >
                Call
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
