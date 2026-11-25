# Roadmap

Version 0.1.0 is the app in this repository: the writing room, the sample story, local persistence, Ollama, prompt plugins, and an HTTP MCP client.

## Done in 0.1.0

- Tauri 2 shell and Vite/React UI
- Theme tokens and six themes
- Comfort settings and procedural room tones
- People, lore, threads, calendar, hearth, bonds, and a vision canvas
- Calendar months can be added, removed, and renamed without losing the text cursor
- Calendar days open the thread stored on that date
- Bonds and Vision boards pan, zoom, and let you drag cards and links
- JSON and Markdown export, JSON import
- Ollama streaming and a "what was sent" view
- Custom prompt plugins saved in the project
- HTTP MCP tool listing

## Next

1. **Project folders.** One directory per story, with `project.sqlite` (FTS5) and an `assets/` folder, opened and saved through Tauri dialogs.
2. **Compile.** Export the hearth to `.docx`, `.epub`, and `.pdf`.
3. **Plugin sandbox.** Third-party packages declared in `plugin.json`, rendered in a sandboxed frame, with permission prompts. The manifest shape is in PLUGIN_API.md.
4. **Stdio MCP.** Rust process host so servers that are not already on HTTP can be launched locally.
5. **StoryMaker as an MCP server.** Read-only tools for people, lore, threads, and scenes.
6. **Installers.** Signed Windows MSI, notarized macOS disk image, Linux AppImage/deb/rpm, and updater.
7. **Spanish UI strings.**

## Acceptance for a public beta

- A new project can be created, closed, and reopened from disk on all three operating systems.
- A 500,000-word hearth and 5,000 notes stay responsive.
- A plugin cannot read the project unless its permission was accepted.
- Room tone and motion honor reduced-motion and stop when the window is hidden.
