# StoryMaker

StoryMaker is a local-first desktop app for people who build worlds and write inside them. It keeps characters, lore, timelines, a custom calendar, a mood board, and a long-form writing desk on your machine. A studio can ask a local model (Ollama) or an HTTP MCP server for suggestions. Those suggestions never change a scene until you insert them.

Privacy is by design. There is no account, no cloud sync, and no telemetry. Your stories stay on this computer: in the browser profile that is running the app, and optionally in an Obsidian vault folder you choose. This repository is only the app code and docs; it does not hold your writing.

The feeling is a warm writing room: paper, lamp light, and a small lantern-fox named Lumen. The visual identity, sample story, and audio are original. Fonts are the SIL Open Font License families Fraunces, Nunito, and Atkinson Hyperlegible.

## Run it

```bash
cd apps/desktop
npm install
npm run dev
```

Open http://localhost:1420.

Desktop shell (Windows, macOS, Linux), after Rust is installed:

```bash
cd apps/desktop
npm run tauri dev
```

## What is in this version

- Six original themes, text size, warm-light filter, clear type, and reduced motion
- Procedural room tones (rain, hearth, library, forest, cafe) generated in the browser, so no recorded audio is shipped
- People, lore shelves, story threads, a custom calendar, the Hearth writing desk, mood board, and a relationship map
- Lamp ritual, writing streak, and a 14-day word chart
- Search across the open project
- JSON project export/import and Markdown export of people and lore
- Studio: Ollama streaming, built-in prompt plugins, your own prompt plugins, and an HTTP MCP tool list
- A Tauri 2 shell that mirrors the project into the app data folder

The shelf of books and each story’s JSON live in `localStorage` for that browser profile. The Vite preview and the Tauri window do not share a shelf. When the desktop shell is running, the open story is also mirrored to `project.json` in the OS app data folder.

## Docs

- [Product and technical spec](docs/SPEC.md)
- [Roadmap](docs/ROADMAP.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [Plugin API](docs/PLUGIN_API.md)
- [Brand and legal notes](docs/BRAND_AND_LEGAL.md)
