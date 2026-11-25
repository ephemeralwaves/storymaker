import { useEffect, useRef, useState } from "react";
import { getCachedOllamaModels, listOllamaModels } from "../lib/ai";
import { useStory } from "../lib/store";
import { downloadText } from "../lib/util";
import { chooseVaultFolder, downloadVaultZip, explainVaultError, filesFromDirectoryInput, importVaultFiles, importVaultZip, keptProject, readLinkedProject, rememberFolderName, subscribeVault, vaultUsesDesktopPicker, writeRememberedVault, type VaultStatus } from "../lib/vaultFolder";
import { AMBIENCES, THEMES, type Project } from "../types";

export function SettingsView() {
  const story = useStory();
  const { project } = story;
  const { comfort } = project;
  const [name, setName] = useState(project.name);
  const [tagline, setTagline] = useState(project.tagline);
  const [vault, setVault] = useState<VaultStatus>({ folder: null, error: "", savedAt: null });
  const [vaultMessage, setVaultMessage] = useState("");
  const [pickingFolder, setPickingFolder] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);
  const folderAccepted = useRef(false);
  const [models, setModels] = useState<string[]>(() => getCachedOllamaModels(comfort.ollamaUrl));
  const [ollamaStatus, setOllamaStatus] = useState(() =>
    comfort.ollamaModel
      ? `Using ${comfort.ollamaModel}`
      : getCachedOllamaModels(comfort.ollamaUrl).length
        ? "Connected earlier. Choose a model."
        : "Not connected",
  );
  const [ollamaBusy, setOllamaBusy] = useState(false);

  useEffect(() => subscribeVault(setVault), []);
  useEffect(() => {
    const input = folderInput.current;
    if (!input) return;
    const onCancel = () => {
      window.setTimeout(() => {
        if (folderAccepted.current) return;
        setPickingFolder(false);
        setVaultMessage("Highlight the vault, then press Select Folder. Clicking the folder name only highlights it.");
      }, 300);
    };
    input.addEventListener("cancel", onCancel);
    return () => input.removeEventListener("cancel", onCancel);
  }, []);

  useEffect(() => {
    setModels(getCachedOllamaModels(comfort.ollamaUrl));
  }, [comfort.ollamaUrl]);

  const connectOllama = async () => {
    setOllamaBusy(true);
    setOllamaStatus("Looking for Ollama…");
    try {
      const found = await listOllamaModels(comfort.ollamaUrl);
      const names = found.map((model) => model.name);
      setModels(names);
      const onDevice = names.filter((name) => !name.endsWith(":cloud") && !name.includes("embed"));
      let selected = comfort.ollamaModel;
      if (!selected || !names.includes(selected)) {
        selected = onDevice.find((name) => name.startsWith("llama")) ?? onDevice[0] ?? names[0] ?? "";
        if (selected) story.setComfort({ ollamaModel: selected });
      }
      const cloudNote = selected.endsWith(":cloud")
        ? " The selected model is marked cloud, so a prompt may leave this machine."
        : "";
      setOllamaStatus(
        (names.length
          ? `Found ${names.length} model${names.length === 1 ? "" : "s"} (${onDevice.length} on this machine)`
          : "Ollama is up, with no models yet") + cloudNote,
      );
    } catch (error) {
      setOllamaStatus(error instanceof Error ? error.message : "Could not reach Ollama");
    } finally {
      setOllamaBusy(false);
    }
  };

  const takeImport = async (imported: { project: Project }) => {
    story.replaceProject(imported.project);
    setVaultMessage("Imported the vault. People, lore, scenes, and threads are notes again.");
  };

  const modelOptions =
    comfort.ollamaModel && !models.includes(comfort.ollamaModel)
      ? [comfort.ollamaModel, ...models]
      : models;

  return (
    <div className="stack">
      <section className="card stack">
        <h2>This story</h2>
        <label className="field">
          <span>Title</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Tagline</span>
          <input value={tagline} onChange={(e) => setTagline(e.target.value)} />
        </label>
        <button className="btn" onClick={() => story.renameProject(name, tagline)}>
          Save title
        </button>
      </section>

      <section className="card stack">
        <h3>Themes</h3>
        <div className="theme-grid">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              className={project.comfort.theme === theme.id ? "theme-swatch on" : "theme-swatch"}
              data-preview={theme.id}
              onClick={() => story.setComfort({ theme: theme.id })}
            >
              <strong>{theme.name}</strong>
              <span>{theme.blurb}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card stack">
        <h3>Comfort</h3>
        <label className="field">
          <span>Text size ({project.comfort.fontScale.toFixed(2)})</span>
          <input
            type="range"
            min={0.9}
            max={1.35}
            step={0.05}
            value={project.comfort.fontScale}
            onChange={(e) => story.setComfort({ fontScale: Number(e.target.value) })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={project.comfort.warmLight}
            onChange={(e) => story.setComfort({ warmLight: e.target.checked })}
          />
          Warm lamp over the screen
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={project.comfort.clearType}
            onChange={(e) => story.setComfort({ clearType: e.target.checked })}
          />
          Clear type (Atkinson Hyperlegible)
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={project.comfort.reducedMotion}
            onChange={(e) => story.setComfort({ reducedMotion: e.target.checked })}
          />
          Reduced motion
        </label>
        <label className="field">
          <span>Room tone volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={project.comfort.ambienceVolume}
            onChange={(e) => story.setComfort({ ambienceVolume: Number(e.target.value) })}
          />
        </label>
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

      <section className="card stack">
        <div className="row spread wrap">
          <div>
            <h3>Local model</h3>
            <p className="muted">Connect to Ollama on this machine. Lumen on the Hearth uses the model you pick here.</p>
          </div>
          <span className="pill">{ollamaStatus}</span>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Ollama address</span>
            <input
              value={comfort.ollamaUrl}
              onChange={(e) => story.setComfort({ ollamaUrl: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Model</span>
            <select
              value={comfort.ollamaModel}
              onChange={(e) => story.setComfort({ ollamaModel: e.target.value })}
            >
              <option value="">Choose a model</option>
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row wrap">
          <button className="btn primary" disabled={ollamaBusy} onClick={() => void connectOllama()}>
            {ollamaBusy ? "Connecting…" : "Connect to Ollama"}
          </button>
        </div>
      </section>

      <section className="card stack">
        <h3>Obsidian vault</h3>
        <p className="muted">
          Each person, lore note, scene, and thread is a Markdown file with wikilinks. The vision board is a canvas file. Choose a folder and Obsidian can open that same folder. While it stays linked, StoryMaker writes the notes when the story changes.
        </p>
        <p>
          {vault.folder
            ? `Linked folder: ${vault.folder}`
            : pickingFolder
              ? "Highlight the vault folder, then press Select Folder. Clicking the folder name only highlights it."
              : "No folder linked yet. The story still saves inside this app until you choose one."}
        </p>
        {vault.savedAt ? <p className="muted">Last written to the folder at {vault.savedAt}.</p> : null}
        {vault.error ? <p className="muted">{vault.error}</p> : null}
        {vaultMessage ? <p className="muted">{vaultMessage}</p> : null}
        <div className="row wrap">
          <button
            className="btn primary"
            disabled={pickingFolder}
            onClick={() => {
              setPickingFolder(true);
              setVaultMessage("");
              if (vaultUsesDesktopPicker()) {
                void chooseVaultFolder()
                  .then(async (chosen) => {
                    const existing = await readLinkedProject(project);
                    if (existing && existing.project.characters.length + existing.project.lore.length + existing.project.scenes.length > 0) {
                      story.replaceProject(await keptProject(existing));
                      setVaultMessage(`Opened ${chosen.name}. Notes already in that folder were loaded.`);
                      return;
                    }
                    await writeRememberedVault(project);
                    setVaultMessage(`Saving notes into ${chosen.name}.`);
                  })
                  .catch((error: unknown) => {
                    setVaultMessage(explainVaultError(error) ?? "Highlight the vault, then press Select Folder.");
                  })
                  .finally(() => setPickingFolder(false));
                return;
              }
              folderAccepted.current = false;
              folderInput.current?.click();
            }}
          >
            {pickingFolder ? "Waiting for a folder…" : "Choose vault folder"}
          </button>
          <button
            className="btn"
            onClick={() => {
              void readLinkedProject(project)
                .then(async (loaded) => {
                  if (!loaded) {
                    setVaultMessage("Link a folder first, and allow StoryMaker to read it.");
                    return;
                  }
                  story.replaceProject(await keptProject(loaded));
                  setVaultMessage("Loaded the notes from the linked folder.");
                })
                .catch((error: unknown) => {
                  const message = explainVaultError(error);
                  if (message) setVaultMessage(message);
                });
            }}
          >
            Load from linked folder
          </button>
          <button className="btn" onClick={() => void downloadVaultZip(project)}>
            Download vault (.zip)
          </button>
          <label className="btn">
            Import vault folder
            <input
              ref={folderInput}
              hidden
              type="file"
              multiple
              {...{ webkitdirectory: "" }}
              onChange={(event) => {
                const chosen = Array.from(event.target.files ?? []);
                event.target.value = "";
                if (!chosen.length) return;
                folderAccepted.current = true;
                setPickingFolder(false);
                const folder = (chosen[0].webkitRelativePath || chosen[0].name).split(/[/\\]/)[0] || "Vault";
                void rememberFolderName(folder)
                  .then(() => filesFromDirectoryInput(chosen))
                  .then((files) => importVaultFiles(files, project))
                  .then(async (imported) => takeImport({ project: await keptProject(imported) }))
                  .catch((error: unknown) => {
                    const message = explainVaultError(error);
                    if (message) setVaultMessage(message);
                  });
              }}
            />
          </label>
          <label className="btn">
            Import vault zip
            <input
              hidden
              type="file"
              accept=".zip,application/zip"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                void file
                  .arrayBuffer()
                  .then((buffer) => importVaultZip(buffer, project))
                  .then(async (imported) => takeImport({ project: await keptProject(imported) }))
                  .catch((error: unknown) => {
                    const message = explainVaultError(error);
                    if (message) setVaultMessage(message);
                  });
              }}
            />
          </label>
        </div>
      </section>

      <section className="card stack">
        <h3>App backup</h3>
        <div className="row wrap">
          <button className="btn" onClick={() => downloadText(`${project.name}.storymaker.json`, JSON.stringify(project, null, 2))}>
            Export project
          </button>
          <label className="btn">
            Import project
            <input
              hidden
              type="file"
              accept="application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void file.text().then((text) => {
                  const next = JSON.parse(text) as Project;
                  if (!next.characters || !next.comfort) return;
                  story.replaceProject(next);
                });
              }}
            />
          </label>
          <button
            className="btn danger"
            onClick={() => {
              if (confirm("Replace the open project with the sample story Lantern and Tide?")) story.resetSeed();
            }}
          >
            Restore sample story
          </button>
        </div>
        <p className="muted">
          The JSON backup is the whole app file, including theme and writing stats. The vault folder is the Obsidian copy. Nothing is uploaded.
        </p>
      </section>
    </div>
  );
}
