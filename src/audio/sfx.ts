import { audioContext } from './context';

/** Bright, short notes. Nothing is left ringing. */
const PLACE = [523.25, 587.33, 659.25, 783.99, 880];
const CLEAR = [523.25, 659.25, 783.99, 1046.5, 1318.51];

/** Soft effects that change with the move. No audio files, no held tones. */
export class Sfx {
  muted = false;
  private noise: AudioBuffer | null = null;
  private placeStep = 0;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    return audioContext();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  /** Each new game starts the place melody over. */
  resetPhrase(): void {
    this.placeStep = 0;
  }

  /**
   * A landing thock. Bigger pieces sit lower and heavier.
   * Consecutive places walk a short scale so the run has a tune.
   */
  place(cells = 1): void {
    const size = Math.max(1, Math.min(9, Math.round(cells)));
    const step = PLACE[this.placeStep % PLACE.length] ?? 523;
    this.placeStep += 1;
    const weight = size >= 5 ? 0.84 : size <= 2 ? 1.08 : 1;
    const freq = step * weight;
    const dur = size >= 5 ? 0.11 : 0.07;
    this.thock(freq, dur, size >= 4 ? 0.09 : 0.055);
    this.pluck(freq, dur, size >= 5 ? 0.06 : 0.045, 0, 0.78);
  }

  /** Rising chime. Combos add notes; a streak starts the run higher. */
  clear(combo = 1, streak = 1): void {
    const notes = Math.max(1, Math.min(4, Math.round(combo)));
    const start = Math.max(0, Math.min(CLEAR.length - 1, Math.round(streak) - 1));
    for (let i = 0; i < notes; i++) {
      const freq = CLEAR[Math.min(CLEAR.length - 1, start + i)] ?? 659;
      this.pluck(freq, 0.12 + i * 0.015, 0.055, i * 0.055);
      this.pluck(freq * 2, 0.07, 0.018, i * 0.055 + 0.02);
    }
    if (streak >= 3) {
      this.pluck(1567.98, 0.1, 0.03, notes * 0.055);
    }
  }

  cheer(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      this.pluck(freq, 0.13, 0.06, i * 0.07);
    });
    this.pluck(1567.98, 0.16, 0.035, 0.3);
  }

  nice(): void {
    this.pluck(659.25, 0.1, 0.05, 0);
    this.pluck(987.77, 0.12, 0.045, 0.07);
  }

  gameOver(): void {
    const notes = [493.88, 392, 329.63, 261.63];
    notes.forEach((freq, i) => {
      this.pluck(freq, 0.14, 0.045, i * 0.08, 0.9);
    });
  }

  bad(): void {
    this.thock(311, 0.06, 0.05);
    this.pluck(233, 0.08, 0.04, 0.04, 0.7);
  }

  tap(): void {
    this.thock(1800, 0.025, 0.03);
  }

  undo(): void {
    this.pluck(659.25, 0.07, 0.04, 0, 1.15);
    this.pluck(523.25, 0.08, 0.035, 0.05, 1.1);
    this.pluck(392, 0.1, 0.03, 0.1, 1.05);
  }

  refill(): void {
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      this.pluck(freq, 0.08, 0.035, i * 0.05);
    });
  }

  /** Short rising air for a multi-clear. */
  whoosh(): void {
    this.sweep(0.18, 0.045);
  }

  private pluck(
    freq: number,
    duration: number,
    gain: number,
    delay: number,
    drop = 0.92,
  ): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(80, freq * drop), t0 + duration);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(4200, freq * 4), t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private thock(freq: number, duration: number, gain: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(Math.max(240, freq), ctx.currentTime);
    filter.Q.value = 0.7;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start(t);
    src.stop(t + duration);
  }

  private sweep(duration: number, gain: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    src.playbackRate.value = 1.4;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.8;
    const t = ctx.currentTime;
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(2400, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start(t);
    src.stop(t + duration);
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise && this.noise.sampleRate === ctx.sampleRate) return this.noise;
    const len = Math.floor(ctx.sampleRate * 0.2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = 1 - i / len;
      data[i] = (Math.random() * 2 - 1) * env;
    }
    this.noise = buf;
    return buf;
  }
}
