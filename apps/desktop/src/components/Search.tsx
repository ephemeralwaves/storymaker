import { useEffect, useMemo, useState } from "react";
import { useStory } from "../lib/store";
import type { ViewId } from "../types";

interface Hit {
  id: string;
  view: ViewId;
  title: string;
  kind: string;
}

export function SearchDialog() {
  const story = useStory();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        story.setSearchOpen(!story.searchOpen);
      }
      if (event.key === "Escape") {
        story.setSearchOpen(false);
        story.setFocusMode(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [story]);

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const found: Hit[] = [];
    story.project.characters.forEach((item) => {
      if (`${item.name} ${item.summary}`.toLowerCase().includes(q)) found.push({ id: item.id, view: "people", title: item.name, kind: "Person" });
    });
    story.project.lore.forEach((item) => {
      if (`${item.title} ${item.body}`.toLowerCase().includes(q)) found.push({ id: item.id, view: "lore", title: item.title, kind: "Lore" });
    });
    story.project.scenes.forEach((item) => {
      if (`${item.title} ${item.body}`.toLowerCase().includes(q)) found.push({ id: item.id, view: "hearth", title: item.title, kind: "Scene" });
    });
    story.project.events.forEach((item) => {
      if (`${item.title} ${item.summary}`.toLowerCase().includes(q)) found.push({ id: item.id, view: "threads", title: item.title, kind: "Event" });
    });
    return found.slice(0, 12);
  }, [query, story.project]);

  if (!story.searchOpen) return null;

  return (
    <div className="modal-backdrop" onClick={() => story.setSearchOpen(false)}>
      <div className="modal card" onClick={(event) => event.stopPropagation()}>
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people, lore, scenes, events" />
        <ul className="search-list">
          {hits.map((hit) => (
            <li key={`${hit.kind}-${hit.id}`}>
              <button
                onClick={() => {
                  if (hit.view === "people") story.selectCharacter(hit.id);
                  if (hit.view === "lore") story.selectLore(hit.id);
                  if (hit.view === "hearth") story.selectScene(hit.id);
                  story.setView(hit.view);
                  story.setSearchOpen(false);
                }}
              >
                <em>{hit.kind}</em>
                {hit.title}
              </button>
            </li>
          ))}
        </ul>
        {query && hits.length === 0 ? <p className="muted">Nothing under that name yet.</p> : null}
      </div>
    </div>
  );
}
