import { useState } from "react";
import { Board } from "../components/Board";
import { useStory } from "../lib/store";
import type { Relationship } from "../types";

export function BondsView() {
  const story = useStory();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const people = story.project.characters;
  const edge = story.project.relationships.find((item) => item.id === selectedEdgeId) ?? null;

  const update = (relationship: Relationship, patch: Partial<Relationship>) => {
    story.saveRelationship({ ...relationship, ...patch });
  };

  return (
    <div className="stack">
      <Board
        nodes={people.map((person) => ({
          id: person.id,
          x: person.x,
          y: person.y,
          title: person.name,
          subtitle: person.role,
          body: person.summary,
          image: person.image || undefined,
          openable: true,
        }))}
        edges={story.project.relationships.map((bond) => ({
          id: bond.id,
          fromId: bond.fromId,
          toId: bond.toId,
          label: story.project.bondKinds.find((kind) => kind.id === bond.kind)?.name ?? bond.kind,
        }))}
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
        onMove={(id, x, y) => {
          const person = people.find((item) => item.id === id);
          if (person) story.saveCharacter({ ...person, x, y });
        }}
        onConnect={(fromId, toId) => {
          if (fromId === toId) return;
          if (story.project.relationships.some((bond) => bond.fromId === fromId && bond.toId === toId)) return;
          const relationship: Relationship = {
            id: `bond-${fromId}-${toId}-${Date.now()}`,
            fromId,
            toId,
            kind: story.project.bondKinds[0]?.id ?? "friend",
            note: "",
          };
          story.saveRelationship(relationship);
          setSelectedEdgeId(relationship.id);
        }}
        onOpenNode={(id) => {
          story.selectCharacter(id);
          story.setView("people");
        }}
      />
      {edge ? (
        <section className="card bond-row">
          <select value={edge.fromId} onChange={(event) => update(edge, { fromId: event.target.value })}>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <select value={edge.kind} onChange={(event) => update(edge, { kind: event.target.value })}>
            {story.project.bondKinds.map((kind) => (
              <option key={kind.id} value={kind.id}>
                {kind.name}
              </option>
            ))}
          </select>
          <select value={edge.toId} onChange={(event) => update(edge, { toId: event.target.value })}>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <input value={edge.note} onChange={(event) => update(edge, { note: event.target.value })} placeholder="A note about this bond" />
          <button className="text-btn" onClick={() => story.deleteRelationship(edge.id)}>
            Remove
          </button>
        </section>
      ) : (
        <p className="muted">Select a link to edit the bond. Drag between the dots on two people to make a new one.</p>
      )}
      <details className="cal-more">
        <summary>
          <div>
            <strong>Bond types</strong>
            <span className="muted">{story.project.bondKinds.length} types you can rename or add</span>
          </div>
          <span className="cal-chev" aria-hidden="true">
            ▾
          </span>
        </summary>
        <div className="cal-more-body">
          <div className="row">
            <button className="btn" onClick={story.addBondKind}>
              Add a type
            </button>
          </div>
          <div className="form-grid">
            {story.project.bondKinds.map((kind) => (
              <div key={kind.id} className="field">
                <span>Type name</span>
                <input
                  value={kind.name}
                  aria-label={`Bond type ${kind.name}`}
                  onChange={(event) => story.renameBondKind(kind.id, event.target.value)}
                />
                <button className="text-btn" disabled={story.project.bondKinds.length <= 1} onClick={() => story.removeBondKind(kind.id)}>
                  Remove type
                </button>
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
