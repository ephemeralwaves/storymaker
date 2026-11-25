import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export interface BoardNode {
  id: string;
  x: number;
  y: number;
  title: string;
  subtitle: string;
  body: string;
  image?: string;
  audio?: string;
  openable?: boolean;
}

export interface BoardEdge {
  id: string;
  fromId: string;
  toId: string;
  label: string;
}

interface Drag {
  type: "pan" | "node" | "connect";
  id: string;
  px: number;
  py: number;
  ox: number;
  oy: number;
  nx: number;
  ny: number;
  x: number;
  y: number;
}

const CARD_W = 210;
const CARD_H = 112;

function cardHeight(node: BoardNode | undefined): number {
  return CARD_H + (node?.image ? 114 : 0) + (node?.audio ? 44 : 0);
}

export function Board({
  nodes,
  edges,
  selectedNodeId,
  selectedEdgeId,
  onMove,
  onConnect,
  onSelectNode,
  onSelectEdge,
  onOpenNode,
}: {
  nodes: BoardNode[];
  edges: BoardEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onMove: (id: string, x: number, y: number) => void;
  onConnect: (fromId: string, toId: string) => void;
  onSelectNode: (id: string | null) => void;
  onSelectEdge: (id: string | null) => void;
  onOpenNode?: (id: string) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const draftLine = useRef<SVGLineElement>(null);
  const drag = useRef<Drag | null>(null);
  const frameId = useRef(0);
  const pointer = useRef({ x: 0, y: 0 });
  const cards = useRef(new Map<string, HTMLElement>());
  const lines = useRef(new Map<string, SVGLineElement>());
  const labels = useRef(new Map<string, HTMLElement>());
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const camRef = useRef({ x: 16, y: 16, scale: 1 });
  const onMoveRef = useRef(onMove);
  const onConnectRef = useRef(onConnect);
  const onSelectNodeRef = useRef(onSelectNode);
  const onSelectEdgeRef = useRef(onSelectEdge);
  const [cam, setCam] = useState(camRef.current);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  onMoveRef.current = onMove;
  onConnectRef.current = onConnect;
  onSelectNodeRef.current = onSelectNode;
  onSelectEdgeRef.current = onSelectEdge;
  if (!drag.current) {
    for (const node of nodes) positions.current.set(node.id, { x: node.x, y: node.y });
  }

  const paintEdges = (movedId: string) => {
    const moved = positions.current.get(movedId);
    const movedNode = nodesRef.current.find((node) => node.id === movedId);
    const movedHeight = cardHeight(movedNode);
    for (const edge of edgesRef.current) {
      if (edge.fromId !== movedId && edge.toId !== movedId) continue;
      const from = edge.fromId === movedId ? moved : positions.current.get(edge.fromId);
      const to = edge.toId === movedId ? moved : positions.current.get(edge.toId);
      if (!from || !to) continue;
      const fromNode = edge.fromId === movedId ? movedNode : nodesRef.current.find((node) => node.id === edge.fromId);
      const toNode = edge.toId === movedId ? movedNode : nodesRef.current.find((node) => node.id === edge.toId);
      const fromHeight = edge.fromId === movedId ? movedHeight : cardHeight(fromNode);
      const toHeight = edge.toId === movedId ? movedHeight : cardHeight(toNode);
      const x1 = from.x + CARD_W / 2;
      const y1 = from.y + fromHeight / 2;
      const x2 = to.x + CARD_W / 2;
      const y2 = to.y + toHeight / 2;
      const line = lines.current.get(edge.id);
      if (line) {
        line.setAttribute("x1", String(x1));
        line.setAttribute("y1", String(y1));
        line.setAttribute("x2", String(x2));
        line.setAttribute("y2", String(y2));
      }
      const label = labels.current.get(edge.id);
      if (label) {
        label.style.left = `${(from.x + to.x) / 2 + CARD_W / 2}px`;
        label.style.top = `${(from.y + fromHeight + to.y + toHeight) / 2}px`;
      }
    }
  };

  const paint = () => {
    frameId.current = 0;
    const current = drag.current;
    const surface = frame.current;
    if (!current || !surface) return;
    const camera = camRef.current;
    const rect = surface.getBoundingClientRect();
    const worldPoint = {
      x: (pointer.current.x - rect.left - camera.x) / camera.scale,
      y: (pointer.current.y - rect.top - camera.y) / camera.scale,
    };
    if (current.type === "pan" && world.current) {
      const x = current.ox + pointer.current.x - current.px;
      const y = current.oy + pointer.current.y - current.py;
      camRef.current = { ...camera, x, y };
      world.current.style.transform = `translate(${x}px, ${y}px) scale(${camera.scale})`;
    }
    if (current.type === "node") {
      const x = worldPoint.x - current.nx;
      const y = worldPoint.y - current.ny;
      current.x = x;
      current.y = y;
      positions.current.set(current.id, { x, y });
      const card = cards.current.get(current.id);
      if (card) {
        card.style.left = `${x}px`;
        card.style.top = `${y}px`;
      }
      paintEdges(current.id);
    }
    if (current.type === "connect" && draftLine.current) {
      draftLine.current.setAttribute("x2", String(worldPoint.x));
      draftLine.current.setAttribute("y2", String(worldPoint.y));
    }
  };

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (drag.current) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      const current = camRef.current;
      const scale = Math.min(2, Math.max(0.45, current.scale * (event.deltaY > 0 ? 0.92 : 1.08)));
      const wx = (mx - current.x) / current.scale;
      const wy = (my - current.y) / current.scale;
      const next = { scale, x: mx - wx * scale, y: my - wy * scale };
      camRef.current = next;
      if (world.current) world.current.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
      setCam(next);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drag.current) return;
      pointer.current = { x: event.clientX, y: event.clientY };
      if (!frameId.current) frameId.current = requestAnimationFrame(paint);
    };
    const onUp = (event: PointerEvent) => {
      const current = drag.current;
      if (!current) return;
      pointer.current = { x: event.clientX, y: event.clientY };
      if (frameId.current) cancelAnimationFrame(frameId.current);
      frameId.current = 0;
      paint();
      drag.current = null;
      el.classList.remove("is-dragging");
      if (draftLine.current) draftLine.current.style.display = "none";
      if (current.type === "pan") setCam(camRef.current);
      if (current.type === "node") {
        onMoveRef.current(current.id, current.x, current.y);
        if (Math.hypot(event.clientX - current.px, event.clientY - current.py) < 4) onSelectNodeRef.current(current.id);
      }
      if (current.type === "connect") {
        const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-node-id]");
        const toId = hit?.getAttribute("data-node-id");
        if (toId) onConnectRef.current(current.id, toId);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (frameId.current) cancelAnimationFrame(frameId.current);
    };
  }, []);

  const begin = (event: ReactPointerEvent, next: Drag) => {
    event.stopPropagation();
    event.preventDefault();
    drag.current = next;
    pointer.current = { x: event.clientX, y: event.clientY };
    frame.current?.classList.add("is-dragging");
    try {
      frame.current?.setPointerCapture(event.pointerId);
    } catch {
      /* the pointer can already be captured while crossing cards */
    }
  };

  return (
    <div
      ref={frame}
      className="board"
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("[data-node-id], [data-edge-id], button, audio")) return;
        begin(event, { type: "pan", id: "", px: event.clientX, py: event.clientY, ox: cam.x, oy: cam.y, nx: 0, ny: 0, x: 0, y: 0 });
        onSelectNode(null);
        onSelectEdge(null);
      }}
    >
      <div ref={world} className="board-world" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})` }}>
        <svg className="board-edges" aria-hidden="true">
          {edges.map((edge) => {
            const from = positions.current.get(edge.fromId);
            const to = positions.current.get(edge.toId);
            const fromNode = nodes.find((node) => node.id === edge.fromId);
            const toNode = nodes.find((node) => node.id === edge.toId);
            if (!from || !to) return null;
            return (
              <line
                key={edge.id}
                ref={(element) => {
                  if (element) lines.current.set(edge.id, element);
                  else lines.current.delete(edge.id);
                }}
                x1={from.x + CARD_W / 2}
                y1={from.y + cardHeight(fromNode) / 2}
                x2={to.x + CARD_W / 2}
                y2={to.y + cardHeight(toNode) / 2}
              />
            );
          })}
          <line ref={draftLine} className="draft-line" style={{ display: "none" }} />
        </svg>
        {edges.map((edge) => {
          const from = positions.current.get(edge.fromId);
          const to = positions.current.get(edge.toId);
          const fromNode = nodes.find((node) => node.id === edge.fromId);
          const toNode = nodes.find((node) => node.id === edge.toId);
          if (!from || !to) return null;
          return (
            <button
              key={edge.id}
              ref={(element) => {
                if (element) labels.current.set(edge.id, element);
                else labels.current.delete(edge.id);
              }}
              data-edge-id={edge.id}
              className={edge.id === selectedEdgeId ? "edge-label on" : "edge-label"}
              style={{ left: (from.x + to.x) / 2 + CARD_W / 2, top: (from.y + cardHeight(fromNode) + to.y + cardHeight(toNode)) / 2 }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onSelectEdge(edge.id)}
            >
              {edge.label || "link"}
            </button>
          );
        })}
        {nodes.map((node) => {
          const at = positions.current.get(node.id) ?? node;
          return (
            <article
              key={node.id}
              ref={(element) => {
                if (element) cards.current.set(node.id, element);
                else cards.current.delete(node.id);
              }}
              data-node-id={node.id}
              className={node.id === selectedNodeId ? "board-card on" : "board-card"}
              style={{ left: at.x, top: at.y, width: CARD_W }}
              onPointerDown={(event) => {
                if ((event.target as HTMLElement).closest("button, audio")) return;
                const rect = frame.current?.getBoundingClientRect();
                const camera = camRef.current;
                const worldPoint = rect
                  ? { x: (event.clientX - rect.left - camera.x) / camera.scale, y: (event.clientY - rect.top - camera.y) / camera.scale }
                  : { x: at.x, y: at.y };
                begin(event, {
                  type: "node",
                  id: node.id,
                  px: event.clientX,
                  py: event.clientY,
                  ox: at.x,
                  oy: at.y,
                  nx: worldPoint.x - at.x,
                  ny: worldPoint.y - at.y,
                  x: at.x,
                  y: at.y,
                });
              }}
            >
              <header>
                <strong>{node.title}</strong>
                {onOpenNode && node.openable ? (
                  <button className="text-btn" onPointerDown={(event) => event.stopPropagation()} onClick={() => onOpenNode(node.id)}>
                    Open
                  </button>
                ) : null}
              </header>
              <em>{node.subtitle}</em>
              {node.image ? <img className="card-photo" src={node.image} alt="" draggable={false} /> : null}
              {node.body ? <p>{node.body}</p> : null}
              {node.audio ? <audio controls src={node.audio} onPointerDown={(event) => event.stopPropagation()} /> : null}
              <button
                className="port"
                aria-label={`Link from ${node.title}`}
                style={{ top: cardHeight(node) / 2 - 7 }}
                onPointerDown={(event) => {
                  begin(event, {
                    type: "connect",
                    id: node.id,
                    px: event.clientX,
                    py: event.clientY,
                    ox: at.x + CARD_W,
                    oy: at.y + cardHeight(node) / 2,
                    nx: 0,
                    ny: 0,
                    x: at.x,
                    y: at.y,
                  });
                  const line = draftLine.current;
                  if (line) {
                    line.style.display = "";
                    line.setAttribute("x1", String(at.x + CARD_W));
                    line.setAttribute("y1", String(at.y + cardHeight(node) / 2));
                    line.setAttribute("x2", String(at.x + CARD_W));
                    line.setAttribute("y2", String(at.y + cardHeight(node) / 2));
                  }
                }}
              />
            </article>
          );
        })}
      </div>
      <p className="board-hint">Drag a card to move it. Drag the dot to link. Drag the background to pan. Scroll to zoom.</p>
    </div>
  );
}
