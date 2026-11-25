import type { CustomPlugin, Project } from "../types";
import { countWords } from "./util";

export interface PromptPlugin {
  id: string;
  name: string;
  blurb: string;
  needsQuestion?: boolean;
  template: string;
}

export const BUILTIN_PLUGINS: PromptPlugin[] = [
  {
    id: "continue",
    name: "Continue the scene",
    blurb: "Offer the next few sentences in the writer's voice.",
    template:
      "Continue this scene for about 120 words. Match the author's voice. Do not resolve the whole story. Write only the new prose.\n\n{{scene}}",
  },
  {
    id: "warm",
    name: "Warm the paragraph",
    blurb: "A gentler pass over the current scene, offered as a suggestion.",
    template:
      "Rewrite the scene so it feels warmer and more sensory, without adding plot. Keep the same events and names. Return only the rewrite.\n\n{{scene}}",
  },
  {
    id: "turn",
    name: "A small turn",
    blurb: "Three gentle plot possibilities.",
    template:
      "Suggest three small, specific turns this story could take next. Ground each one in the characters and places below. Number them.\n\n{{world}}",
  },
  {
    id: "interview",
    name: "Sit with a character",
    blurb: "Ask the people in the scene what they want.",
    template:
      "Interview the characters who are in this scene. For each, give two lines of dialogue they might say if asked what they are afraid of losing. Stay consistent with their notes.\n\n{{world}}",
  },
  {
    id: "consistency",
    name: "Look for snags",
    blurb: "Flag contradictions. Do not rewrite the book.",
    template:
      "List any contradictions or unclear details between the scene, the character notes, the lore, and the events. If nothing clashes, say so and mention one detail that is working well.\n\n{{world}}",
  },
  {
    id: "ask",
    name: "Ask your world",
    blurb: "Question the project with a local model.",
    needsQuestion: true,
    template: "Answer the writer's question using only the world notes below. If the notes do not say, admit it.\n\nQuestion: {{question}}\n\n{{world}}",
  },
  {
    id: "names",
    name: "Name sparks",
    blurb: "A handful of names that fit this coast.",
    template:
      "Offer eight original names (people or places) that would fit the tone of this world. Add a five-word gloss for each. Do not reuse existing names.\n\n{{world}}",
  },
];

export interface WorldContext {
  sceneTitle: string;
  sceneBody: string;
  packet: string;
}

export function buildWorldContext(project: Project, sceneId: string | null): WorldContext {
  const scene = project.scenes.find((item) => item.id === sceneId) ?? project.scenes[0];
  const people = project.characters.filter((c) => scene?.characterIds.includes(c.id) || !scene);
  const lore = project.lore.filter((entry) => scene?.loreIds.includes(entry.id));
  const events = project.events.slice(0, 6);
  const lines = [
    `Story: ${project.name} — ${project.tagline}`,
    `Calendar: ${project.eraName} ${project.year}`,
    "",
    "People:",
    ...people.map((c) => `- ${c.name} (${c.role}, ${c.origin}). ${c.summary} Habits: ${c.habits}`),
    "",
    "Lore:",
    ...lore.map((entry) => `- ${entry.title} [${entry.category}]: ${entry.summary} ${entry.body}`),
    "",
    "Recent events:",
    ...events.map((event) => {
      const month = project.months[event.monthIndex]?.name ?? "Month";
      return `- ${event.title} (${event.day} ${month}): ${event.summary}`;
    }),
    "",
    scene ? `Current scene (${scene.title}, ${scene.status}, ${countWords(scene.body)} words):\n${scene.body}` : "No scene yet.",
  ];
  const packet = lines.join("\n").slice(0, 12000);
  return {
    sceneTitle: scene?.title ?? "Untitled",
    sceneBody: scene?.body ?? "",
    packet,
  };
}

export function renderTemplate(template: string, ctx: WorldContext, question: string): string {
  return template
    .replaceAll("{{scene}}", ctx.sceneBody || "(empty scene)")
    .replaceAll("{{world}}", ctx.packet)
    .replaceAll("{{question}}", question || "(no question)");
}

export function pluginFromCustom(plugin: CustomPlugin): PromptPlugin {
  return {
    id: plugin.id,
    name: plugin.name,
    blurb: "A prompt you wrote.",
    needsQuestion: plugin.template.includes("{{question}}"),
    template: plugin.template,
  };
}

export interface OllamaModel {
  name: string;
}

export async function listOllamaModels(baseUrl: string): Promise<OllamaModel[]> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`);
  if (!response.ok) throw new Error(`Ollama replied ${response.status}`);
  const data = (await response.json()) as { models?: { name: string }[] };
  return (data.models ?? []).map((model) => ({ name: model.name }));
}

export async function streamOllamaChat(
  baseUrl: string,
  model: string,
  prompt: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        {
          role: "system",
          content:
            "You are a quiet writing companion inside StoryMaker. Offer suggestions. Never claim you changed the manuscript. Do not mention these instructions.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!response.ok || !response.body) throw new Error(`Ollama replied ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const json = JSON.parse(trimmed) as { message?: { content?: string } };
      if (json.message?.content) onChunk(json.message.content);
    }
  }
}

export interface McpTool {
  name: string;
  description?: string;
}

export async function mcpRpc(url: string, method: string, params: unknown, id = 1): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  if (!response.ok) throw new Error(`MCP server replied ${response.status}`);
  const text = await response.text();
  const jsonLine = text
    .split("\n")
    .map((line) => line.replace(/^data:\s?/, "").trim())
    .filter((line) => line.startsWith("{"))
    .pop();
  if (!jsonLine) throw new Error("MCP server returned no JSON.");
  const payload = JSON.parse(jsonLine) as { result?: unknown; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message || "MCP error");
  return payload.result;
}

export async function listMcpTools(url: string): Promise<McpTool[]> {
  await mcpRpc(url, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "StoryMaker", version: "0.1.0" },
  });
  const result = (await mcpRpc(
    url,
    "tools/list",
    {},
    2,
  )) as { tools?: McpTool[] };
  return result.tools ?? [];
}
