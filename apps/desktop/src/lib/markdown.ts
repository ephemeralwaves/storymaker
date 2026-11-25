export type Yaml = string | number | boolean | null | Yaml[] | { [key: string]: Yaml };

export function splitFrontmatter(markdown: string): { data: Record<string, Yaml>; body: string } {
  const text = markdown.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n") && text !== "---") return { data: {}, body: text };
  const end = text.indexOf("\n---", 3);
  if (end < 0) return { data: {}, body: text };
  const raw = text.slice(4, end);
  let body = text.slice(end + 4);
  if (body.startsWith("\n")) body = body.slice(1);
  const data = parseYaml(raw);
  return { data: isMap(data) ? data : {}, body };
}

export function renderNote(data: Record<string, Yaml>, body: string): string {
  const yaml = stringifyYaml(data).trimEnd();
  const prose = body.replace(/^\n+/, "").replace(/\s+$/, "");
  return `---\n${yaml}\n---\n\n${prose}\n`;
}

function parseYaml(source: string): Yaml {
  const lines = source.split("\n");
  const parsed = parseLines(lines, 0, 0);
  return parsed.value ?? {};
}

function parseLines(lines: string[], start: number, indent: number): { value: Yaml; next: number } {
  const items: Yaml[] = [];
  const map: Record<string, Yaml> = {};
  let mode: "unknown" | "list" | "map" = "unknown";
  let index = start;

  while (index < lines.length) {
    const raw = lines[index];
    if (!raw.trim() || raw.trim().startsWith("#")) {
      index += 1;
      continue;
    }
    const current = lineIndent(raw);
    if (current < indent) break;
    if (current > indent) {
      index += 1;
      continue;
    }
    const text = raw.slice(current);
    if (text.startsWith("- ")) {
      mode = "list";
      const rest = text.slice(2);
      if (!rest.trim()) {
        const child = parseLines(lines, index + 1, indent + 2);
        items.push(child.value);
        index = child.next;
        continue;
      }
      items.push(parseScalar(rest.trim()));
      index += 1;
      continue;
    }
    const splitAt = text.indexOf(":");
    if (splitAt < 0) {
      index += 1;
      continue;
    }
    mode = "map";
    const key = text.slice(0, splitAt).trim();
    const rest = text.slice(splitAt + 1).trim();
    if (!rest) {
      const child = parseLines(lines, index + 1, indent + 2);
      map[key] = child.value ?? "";
      index = child.next;
      continue;
    }
    map[key] = parseScalar(rest);
    index += 1;
  }

  if (mode === "list") return { value: items, next: index };
  if (mode === "unknown") return { value: {}, next: index };
  return { value: map, next: index };
}

function lineIndent(line: string): number {
  let count = 0;
  while (line[count] === " ") count += 1;
  return count;
}

function parseScalar(token: string): Yaml {
  if (token === "null" || token === "~") return null;
  if (token === "true") return true;
  if (token === "false") return false;
  if (/^-?\d+$/.test(token)) return Number(token);
  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
    const body = token.slice(1, -1);
    if (token.startsWith('"')) return body.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    return body;
  }
  return token;
}

function stringifyYaml(data: Record<string, Yaml>, indent = 0): string {
  const pad = " ".repeat(indent);
  return Object.entries(data)
    .map(([key, value]) => `${pad}${key}:${formatValue(value, indent)}`)
    .join("\n");
}

function formatValue(value: Yaml, indent: number): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return " []";
    const pad = " ".repeat(indent + 2);
    return `\n${value.map((item) => `${pad}- ${inline(item)}`).join("\n")}`;
  }
  if (value && typeof value === "object") {
    const body = stringifyYaml(value, indent + 2);
    return body ? `\n${body}` : " {}";
  }
  return ` ${inline(value)}`;
}

function inline(value: Yaml): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null) return "null";
  if (typeof value === "object") return '""';
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

function isMap(value: Yaml): value is Record<string, Yaml> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function yamlString(value: Yaml | undefined, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

export function yamlNumber(value: Yaml | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

export function yamlList(value: Yaml | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => yamlString(item)).filter(Boolean);
}

export function wikiTarget(token: string): string {
  const match = /\[\[([^\]|#]+)/.exec(token);
  const inner = (match?.[1] ?? token).trim();
  const leaf = inner.split("/").pop() ?? inner;
  return leaf.replace(/\.md$/i, "").trim();
}
