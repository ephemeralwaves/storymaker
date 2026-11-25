import type { AmbienceId } from "../types";

type NoiseKind = "brown" | "white";

class AmbienceEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes: AudioNode[] = [];
  private timers: number[] = [];
  current: AmbienceId = "off";

  private ensure(): AudioContext {
    if (!this.context) {
      const Ctx = window.AudioContext;
      this.context = new Ctx();
      this.master = this.context.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.context.destination);
    }
    return this.context;
  }

  setVolume(volume: number): void {
    if (this.master) this.master.gain.value = Math.max(0, Math.min(1, volume));
  }

  async play(kind: AmbienceId, volume: number): Promise<void> {
    this.stop();
    this.current = kind;
    if (kind === "off") return;
    const ctx = this.ensure();
    if (ctx.state === "suspended") await ctx.resume();
    this.setVolume(volume);
    if (kind === "rain") this.rain(ctx);
    if (kind === "fire") this.fire(ctx);
    if (kind === "library") this.library(ctx);
    if (kind === "forest") this.forest(ctx);
    if (kind === "cafe") this.cafe(ctx);
  }

  stop(): void {
    this.timers.forEach((id) => window.clearInterval(id));
    this.timers = [];
    this.nodes.forEach((node) => {
      try {
        node.disconnect();
      } catch {
        /* already stopped */
      }
    });
    this.nodes = [];
    this.current = "off";
  }

  private track(node: AudioNode): void {
    this.nodes.push(node);
  }

  private noise(ctx: AudioContext, kind: NoiseKind, seconds = 2): AudioBufferSourceNode {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      if (kind === "white") data[i] = white * 0.4;
      else {
        brown = (brown + 0.02 * white) / 1.02;
        data[i] = brown * 3.2;
      }
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    this.track(source);
    return source;
  }

  private rain(ctx: AudioContext): void {
    const source = this.noise(ctx, "white");
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 700;
    const gain = ctx.createGain();
    gain.gain.value = 0.18;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master!);
    this.track(filter);
    this.track(gain);
    source.start();
    const drip = window.setInterval(() => {
      if (!this.context || this.current !== "rain") return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = 900 + Math.random() * 1400;
      g.gain.value = 0.0001;
      osc.connect(g);
      g.connect(this.master!);
      const now = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.14);
    }, 700);
    this.timers.push(drip);
  }

  private fire(ctx: AudioContext): void {
    const source = this.noise(ctx, "brown");
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400;
    const gain = ctx.createGain();
    gain.gain.value = 0.45;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master!);
    this.track(filter);
    this.track(gain);
    source.start();
    const crackle = window.setInterval(() => {
      if (!this.context || this.current !== "fire") return;
      const burst = this.noise(ctx, "white", 1);
      const g = ctx.createGain();
      g.gain.value = 0.04 + Math.random() * 0.05;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 1200 + Math.random() * 2000;
      burst.connect(f);
      f.connect(g);
      g.connect(this.master!);
      burst.start();
      window.setTimeout(() => {
        burst.stop();
        burst.disconnect();
      }, 180);
    }, 420);
    this.timers.push(crackle);
  }

  private library(ctx: AudioContext): void {
    const source = this.noise(ctx, "brown");
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 240;
    const gain = ctx.createGain();
    gain.gain.value = 0.2;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master!);
    this.track(filter);
    this.track(gain);
    source.start();
  }

  private forest(ctx: AudioContext): void {
    const source = this.noise(ctx, "brown");
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 500;
    filter.Q.value = 0.4;
    const gain = ctx.createGain();
    gain.gain.value = 0.22;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master!);
    this.track(filter);
    this.track(gain);
    source.start();
  }

  private cafe(ctx: AudioContext): void {
    const source = this.noise(ctx, "brown");
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 800;
    const gain = ctx.createGain();
    gain.gain.value = 0.28;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master!);
    this.track(filter);
    this.track(gain);
    source.start();
  }
}

export const ambience = new AmbienceEngine();
