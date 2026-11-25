/**
 * Storybook sounds, synthesized like the room tones so no audio files ship:
 * a celesta-like chime when the cover opens and a paper rustle per page turn.
 */
let context: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!context) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    }
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

export function wakeStorybookSound(): void {
  audio();
}

export function playChime(volume = 1): void {
  const ac = audio();
  if (!ac) return;
  const notes = [783.99, 987.77, 1174.66, 1479.98, 1567.98, 1975.53];
  notes.forEach((frequency, index) => {
    const start = ac.currentTime + index * 0.13;
    [1, 2.01].forEach((multiple, partial) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = partial ? "triangle" : "sine";
      osc.frequency.value = frequency * multiple;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime((partial ? 0.015 : 0.06) * volume, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 2.2);
      osc.connect(gain).connect(ac.destination);
      osc.start(start);
      osc.stop(start + 2.3);
    });
  });
}

export function playRustle(volume = 1): void {
  const ac = audio();
  if (!ac) return;
  const length = Math.floor(ac.sampleRate * 0.45);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2) * (0.5 + 0.5 * Math.sin(i / 900));
  }
  const source = ac.createBufferSource();
  const filter = ac.createBiquadFilter();
  const gain = ac.createGain();
  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.value = 2400;
  filter.Q.value = 0.7;
  gain.gain.value = 0.12 * volume;
  source.connect(filter).connect(gain).connect(ac.destination);
  source.start();
}
