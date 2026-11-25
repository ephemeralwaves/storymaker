# Plugin API

0.1.0 ships prompt plugins inside the project. The sandbox, permissions, and package loader below are the contract for the next milestone. Built-in plugins already follow the template fields.

## Prompt plugin (available now)

Saved on `project.comfort.customPlugins`:

```json
{
  "id": "plugin-…",
  "name": "My prompt",
  "template": "Suggest one scene.\n\n{{world}}"
}
```

Placeholders:

- `{{scene}}` — body of the open scene
- `{{world}}` — story title, pinned people, pinned lore, recent events, and the scene, truncated to 12,000 characters
- `{{question}}` — the question field in Studio

Built-ins live in `apps/desktop/src/lib/ai.ts` (`continue`, `warm`, `turn`, `interview`, `consistency`, `ask`, `names`).

A plugin returns text. The app does not apply it until **Insert into the open scene**.

## Ollama provider

- `GET {ollamaUrl}/api/tags`
- `POST {ollamaUrl}/api/chat` with `stream: true` and NDJSON chunks
- Default URL `http://127.0.0.1:11434`

Any OpenAI-compatible local server can be added later behind the same screen by implementing `listModels` and `streamChat`.

## HTTP MCP client (available now)

`listMcpTools` sends JSON-RPC:

1. `initialize` with protocol `2024-11-05` and client name `StoryMaker`
2. `tools/list`
3. `tools/call` with empty arguments when a tool row is activated

The server must already be listening on HTTP and must allow the webview origin. Stdio MCP servers are not launched yet.

## Package manifest (planned)

```json
{
  "id": "example.names",
  "name": "Name sparks",
  "version": "0.1.0",
  "entry": "index.html",
  "permissions": ["read:characters", "read:scene"],
  "contributes": {
    "commands": [{ "id": "spark", "title": "Name sparks" }]
  }
}
```

Permissions the host will recognize:

- `read:characters`, `read:lore`, `read:events`, `read:scene`
- `write:scene-draft` (append a suggestion, still user-confirmed)
- `network:localhost`
- `mcp:connect`

Plugins will run in a sandboxed iframe and talk JSON-RPC only. The host rejects any method the granted permissions do not cover. Network access other than localhost is denied unless a future permission is added and shown at install.

The SDK package will be MIT or Apache-2.0 so other people can publish plugins. The host checks the manifest before enabling a plugin.
