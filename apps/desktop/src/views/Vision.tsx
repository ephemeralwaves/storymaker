import { useEffect, useRef, useState } from "react";
import { Board } from "../components/Board";
import { useStory } from "../lib/store";
import { loadTrack, saveTrack, trackId } from "../lib/tracks";
import { readAudioFile, shrinkImage, uid } from "../lib/util";
import type { VisionCard, VisionKind } from "../types";

function useTrackSources(cards: VisionCard[]): { sources: Record<string, string>; ready: boolean } {
  const [sources, setSources] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const signature = cards
    .filter((card) => card.kind === "music")
    .map((card) => `${card.id}:${card.media}`)
    .join("|");

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    setReady(false);
    const music = cardsRef.current.filter((card) => card.kind === "music" && card.media);
    void (async () => {
      const next: Record<string, string> = {};
      for (const card of music) {
        if (card.media.startsWith("data:")) {
          next[card.id] = card.media;
          continue;
        }
        const id = trackId(card.media);
        if (!id) continue;
        const blob = await loadTrack(id);
        if (cancelled) return;
        if (!blob) continue;
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        created.push(url);
        next[card.id] = url;
      }
      if (cancelled) {
        created.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      setSources(next);
      setReady(true);
    })();
    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
      setSources({});
    };
  }, [signature]);

  return { sources, ready };
}

function excerpt(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 90 ? `${clean.slice(0, 90)}…` : clean;
}

export function VisionView() {
  const story = useStory();
  const { project } = story;
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [kind, setKind] = useState<VisionKind>("note");
  const [refId, setRefId] = useState("");
  const [importError, setImportError] = useState("");
  const tracks = useTrackSources(project.vision.cards);
  const trackSources = tracks.sources;
  const card = project.vision.cards.find((item) => item.id === selectedNodeId) ?? null;
  const edge = project.vision.edges.find((item) => item.id === selectedEdgeId) ?? null;

  const describe = (item: VisionCard) => {
    if (item.kind === "photo") {
      return { title: item.note || "Photo", subtitle: "Photo", body: "", image: item.media, audio: "", openable: false };
    }
    if (item.kind === "music") {
      return { title: item.note || "Music", subtitle: "Music", body: "", image: "", audio: trackSources[item.id] ?? "", openable: false };
    }
    if (item.kind === "person") {
      const person = project.characters.find((entry) => entry.id === item.refId);
      return { title: person?.name ?? "Missing person", subtitle: "Person", body: item.note || person?.summary || "", image: person?.image ?? "", audio: "", openable: true };
    }
    if (item.kind === "lore") {
      const lore = project.lore.find((entry) => entry.id === item.refId);
      return { title: lore?.title ?? "Missing lore", subtitle: lore?.category ?? "Lore", body: item.note || excerpt(lore?.body ?? ""), image: lore?.image ?? "", audio: "", openable: true };
    }
    if (item.kind === "thread") {
      const event = project.events.find((entry) => entry.id === item.refId);
      return { title: event?.title ?? "Missing thread", subtitle: "Thread", body: item.note || event?.summary || "", image: "", audio: "", openable: true };
    }
    if (item.kind === "scene") {
      const scene = project.scenes.find((entry) => entry.id === item.refId);
      return { title: scene?.title ?? "Missing scene", subtitle: "Scene", body: item.note || excerpt(scene?.body ?? ""), image: "", audio: "", openable: true };
    }
    return { title: item.note.split("\n")[0] || "Note", subtitle: "Note", body: item.note, image: "", audio: "", openable: false };
  };

  const options =
    kind === "person"
      ? project.characters.map((item) => ({ id: item.id, label: item.name }))
      : kind === "lore"
        ? project.lore.map((item) => ({ id: item.id, label: item.title }))
        : kind === "thread"
          ? project.events.map((item) => ({ id: item.id, label: item.title }))
          : kind === "scene"
            ? project.scenes.map((item) => ({ id: item.id, label: item.title }))
            : [];

  const addCard = () => {
    const linked = kind === "note" ? "" : refId || options[0]?.id || "";
    if (kind !== "note" && !linked) return;
    story.addVisionCard({
      kind,
      refId: linked,
      x: 80 + (project.vision.cards.length % 4) * 240,
      y: 80 + Math.floor(project.vision.cards.length / 4) * 160,
      note: kind === "note" ? "A loose thought." : "",
      media: "",
    });
  };

  const pinMedia = (kindName: "photo" | "music", name: string, media: string) => {
    story.addVisionCard({
      kind: kindName,
      refId: "",
      x: 80 + (project.vision.cards.length % 4) * 240,
      y: 80 + Math.floor(project.vision.cards.length / 4) * 160,
      note: name.replace(/\.[^.]+$/, ""),
      media,
    });
    setImportError("");
  };

  const openCard = (id: string) => {
    const item = project.vision.cards.find((cardItem) => cardItem.id === id);
    if (!item) return;
    if (item.kind === "person") {
      story.selectCharacter(item.refId);
      story.setView("people");
    } else if (item.kind === "lore") {
      story.selectLore(item.refId);
      story.setView("lore");
    } else if (item.kind === "thread") story.openEvent(item.refId);
    else if (item.kind === "scene") {
      story.selectScene(item.refId);
      story.setView("hearth");
    }
  };

  return (
    <div className="stack">
      <section className="card row wrap">
        <select
          value={kind}
          aria-label="Card type"
          onChange={(event) => {
            setKind(event.target.value as VisionKind);
            setRefId("");
          }}
        >
          <option value="note">Note</option>
          <option value="person">Person</option>
          <option value="lore">Lore</option>
          <option value="thread">Thread</option>
          <option value="scene">Scene</option>
        </select>
        {kind !== "note" ? (
          <select value={refId} aria-label="Linked page" onChange={(event) => setRefId(event.target.value)}>
            <option value="">Choose a page</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}
        <button className="btn primary" onClick={addCard}>
          Pin to the board
        </button>
        <label className="btn">
          Import photo
          <input
            hidden
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void shrinkImage(file)
                .then((media) => pinMedia("photo", file.name, media))
                .catch((error: unknown) => setImportError(error instanceof Error ? error.message : "Could not read that photo."));
            }}
          />
        </label>
        <label className="btn">
          Import music
          <input
            hidden
            type="file"
            accept="audio/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              try {
                const blob = readAudioFile(file);
                const id = uid("track");
                void saveTrack(id, blob)
                  .then(() => pinMedia("music", file.name, `track:${id}`))
                  .catch((error: unknown) => setImportError(error instanceof Error ? error.message : "Could not keep that track."));
              } catch (error) {
                setImportError(error instanceof Error ? error.message : "Could not read that track.");
              }
            }}
          />
        </label>
        {importError ? <p className="muted">{importError}</p> : null}
      </section>
      <Board
        nodes={project.vision.cards.map((item) => ({ id: item.id, x: item.x, y: item.y, ...describe(item) }))}
        edges={project.vision.edges}
        selectedNodeId={selectedNodeId}
        selectedEdgeId={selectedEdgeId}
        onSelectNode={(id) => {
          setSelectedNodeId(id);
          if (id) setSelectedEdgeId(null);
        }}
        onSelectEdge={(id) => {
          setSelectedEdgeId(id);
          if (id) setSelectedNodeId(null);
        }}
        onMove={story.moveVisionCard}
        onConnect={story.addVisionEdge}
        onOpenNode={openCard}
      />
      {card ? (
        <section className="card stack">
          <div className="row spread">
            <h3>{describe(card).title}</h3>
            <button className="text-btn" onClick={() => story.deleteVisionCard(card.id)}>
              Remove card
            </button>
          </div>
          {card.kind === "photo" && card.media ? <img className="portrait" src={card.media} alt="" /> : null}
          {card.kind === "music" && trackSources[card.id] ? <audio controls src={trackSources[card.id]} /> : null}
          {card.kind === "music" && tracks.ready && card.media && !trackSources[card.id] ? (
            <p className="muted">This track is not on this machine.</p>
          ) : null}
          <label className="field">
            <span>{card.kind === "photo" || card.kind === "music" ? "Title" : "Note on this card"}</span>
            <textarea rows={3} value={card.note} onChange={(event) => story.updateVisionCard(card.id, { note: event.target.value })} />
          </label>
          {card.kind === "person" || card.kind === "lore" || card.kind === "thread" || card.kind === "scene" ? (
            <button className="btn" onClick={() => openCard(card.id)}>
              Open the linked page
            </button>
          ) : null}
        </section>
      ) : null}
      {edge ? (
        <section className="card row">
          <input
            value={edge.label}
            aria-label="Link label"
            placeholder="Label this link"
            onChange={(event) => story.updateVisionEdge({ ...edge, label: event.target.value })}
          />
          <button className="text-btn" onClick={() => story.deleteVisionEdge(edge.id)}>
            Remove link
          </button>
        </section>
      ) : null}
    </div>
  );
}
