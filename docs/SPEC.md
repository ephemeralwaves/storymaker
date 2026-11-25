# StoryMaker spec

## Product

StoryMaker is an offline-first worldbuilding and writing application for Windows, macOS, and Linux. It is for novelists and game masters who want characters, lore, timelines, calendars, and manuscript scenes in one private project.

Local models are optional. The Studio sends a visible context packet to a model the user is already running and shows the reply as a suggestion.

## Modules

- **Home.** Lamp ritual, counts, 14-day words, mention counts, room tone.
- **People.** Role, origin, gift, personality, backstory, habits, fears.
- **Lore.** Shelves (places, ecology, objects, houses, customs), summaries, backlinks when another note names the title.
- **Threads.** Events dated on the project's calendar and tagged with people.
- **Calendar.** Named months with their own lengths. Months can be added or removed. A day opens the thread stored there, or starts one if the day is empty.
- **Bonds.** People are cards on a board. Drag a card to place it, drag the background to pan, scroll to zoom, and drag the dot on a card to link two people. Bond types are a list you can rename, add, and remove. The selected link edits who it joins, which type it is, and a note.
- **Vision.** An Obsidian-style canvas. Pin notes or cards that point at a person, lore page, thread, or scene. Drag to arrange them and draw links between cards. Open jumps to the linked page.
- **Hearth.** Chapters and scenes, status, word goal, focus mode, people and lore pinned to the scene.
- **Bonds.** Relationship kinds drawn as a circle map.
- **Studio.** Ollama chat streaming, prompt plugins, HTTP MCP `initialize`, `tools/list`, and `tools/call`.
- **Settings.** Themes, comfort, export, import.

## Data

A project is one JSON document: people, relationships, lore, events, chapters, scenes, calendar, comfort settings, and per-day word counts.

Browser builds persist it under `localStorage` key `storymaker.project.v1`. The Tauri shell also writes `project.json` in the OS app data directory through `save_project` / `load_project`.

## Architecture

```text
React UI  ->  StoryProvider (in-memory project)
                 | localStorage
                 | invoke save_project / load_project   (Tauri only)
                 | fetch Ollama /api/chat and /api/tags
                 | fetch MCP JSON-RPC
Tauri Rust shell: file mirror only in 0.1.0
```

Later milestones move the source of truth to a SQLite file inside a project folder and host stdio MCP servers from Rust. The UI already talks to providers through small TypeScript functions so that move does not rewrite the screens.

## AI rules

- The user starts every request.
- The prompt that was sent can be opened under the suggestion.
- Inserting text into a scene is a separate button.
- The default Ollama address is `http://127.0.0.1:11434`.
- No account, no telemetry, no cloud model is configured.

## Platforms

Tauri 2 uses the system webview (WebView2, WKWebView, WebKitGTK). The same Vite frontend runs in a browser for development.
