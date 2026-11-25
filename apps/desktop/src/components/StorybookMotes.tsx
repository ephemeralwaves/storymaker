import { useEffect, useRef, type MutableRefObject } from "react";

type Mote = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  phase: number;
  speed: number;
  life: number;
  burst: boolean;
};

export type MotesHandle = { burst: (x: number, y: number) => void };

function makeMote(x: number, y: number, burst: boolean): Mote {
  const angle = Math.random() * Math.PI * 2;
  const speed = burst ? 1 + Math.random() * 3.2 : 0;
  return {
    x,
    y,
    r: burst ? 0.8 + Math.random() * 2 : 0.5 + Math.random() * 1.6,
    vx: burst ? Math.cos(angle) * speed : (Math.random() - 0.5) * 0.15,
    vy: burst ? Math.sin(angle) * speed - 1 : -0.08 - Math.random() * 0.25,
    phase: Math.random() * Math.PI * 2,
    speed: 0.6 + Math.random() * 1.8,
    life: 1,
    burst,
  };
}

/** Gold dust drifting up through the Storybook stage. `handle.burst` throws a shower of it. */
export function StorybookMotes({ calm, handle }: { calm: boolean; handle: MutableRefObject<MotesHandle | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const host = canvas?.parentElement;
    if (!canvas || !ctx || !host) return;

    const motes: Mote[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let tick = 0;
    let rgb = "230, 189, 106";
    let glowMode: GlobalCompositeOperation = "lighter";

    /* dust takes the theme's accent; it glows additively on dark rooms and sits on top in light ones */
    const readTheme = () => {
      const styles = getComputedStyle(host);
      const accent = styles.getPropertyValue("--accent").trim();
      const bg = styles.getPropertyValue("--bg").trim();
      const probe = document.createElement("canvas").getContext("2d");
      if (!probe) return;
      const toRgb = (value: string) => {
        probe.fillStyle = "#000";
        probe.fillStyle = value;
        const hex = String(probe.fillStyle);
        if (!hex.startsWith("#") || hex.length !== 7) return null;
        return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      };
      const a = accent ? toRgb(accent) : null;
      if (a) rgb = a.join(", ");
      const b = bg ? toRgb(bg) : null;
      if (b) glowMode = (0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2]) / 255 < 0.45 ? "lighter" : "source-over";
    };
    readTheme();

    const resize = () => {
      const oldW = width || 1;
      const oldH = height || 1;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = host.clientWidth;
      height = host.clientHeight;
      if (!width || !height) return;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!motes.length) {
        for (let i = 0; i < 80; i++) motes.push(makeMote(Math.random() * width, Math.random() * height, false));
      } else if (oldW < 50 || oldH < 50) {
        motes.forEach((m) => { m.x = Math.random() * width; m.y = Math.random() * height; });
      } else {
        motes.forEach((m) => { m.x *= width / oldW; m.y *= height / oldH; });
      }
      if (calm) draw(0);
    };

    const draw = (time: number) => {
      if (++tick % 90 === 0) readTheme();
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = glowMode;
      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i];
        if (!calm) {
          m.x += m.vx;
          m.y += m.vy;
          if (m.burst) {
            m.vx *= 0.975;
            m.vy = m.vy * 0.975 - 0.01;
            m.life -= 0.006;
            if (m.life <= 0) {
              motes.splice(i, 1);
              continue;
            }
          } else if (m.y < -10) {
            m.y = height + 10;
            m.x = Math.random() * width;
          }
        }
        const twinkle = 0.45 + 0.55 * Math.sin((time / 1000) * m.speed + m.phase);
        const alpha = (m.burst ? m.life : 0.7) * twinkle;
        ctx.fillStyle = `rgba(${rgb}, ${alpha * (glowMode === "lighter" ? 0.18 : 0.12)})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = glowMode === "lighter" ? `rgba(255, 236, 180, ${alpha})` : `rgba(${rgb}, ${alpha * 0.85})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      if (!calm) frame = requestAnimationFrame(draw);
    };

    handle.current = {
      burst: (x, y) => {
        if (calm) return;
        for (let i = 0; i < 160; i++) motes.push(makeMote(x + (Math.random() - 0.5) * 200, y + (Math.random() - 0.5) * 300, true));
      },
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    if (!calm) frame = requestAnimationFrame(draw);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      handle.current = null;
    };
  }, [calm, handle]);

  return <canvas ref={canvasRef} className="sb-motes" aria-hidden="true" />;
}
