/** Soft retail-style Web Audio SFX (no asset files). */
export class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  /** Soft wood/thock on place. */
  place(): void {
    this.noiseThock(0.045, 0.07);
    this.tone(180, 0.07, 'triangle', 0.05, 0);
  }

  /** Rising clear chime; richer for combos. */
  clear(combo = 1): void {
    const n = Math.min(Math.max(combo, 1), 5);
    const base = 520;
    for (let i = 0; i < n; i++) {
      const f = base + i * 110;
      this.tone(f, 0.12 + i * 0.02, 'sine', 0.09 - i * 0.01, i * 0.07);
      this.tone(f * 2, 0.08, 'triangle', 0.03, i * 0.07 + 0.02);
    }
  }

  cheer(): void {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => {
      this.tone(f, 0.14, 'sine', 0.09, i * 0.09);
    });
  }

  nice(): void {
    this.tone(660, 0.1, 'sine', 0.08, 0);
    this.tone(880, 0.12, 'sine', 0.07, 0.08);
  }

  gameOver(): void {
    this.tone(320, 0.2, 'triangle', 0.07, 0);
    this.tone(240, 0.24, 'triangle', 0.06, 0.12);
    this.tone(160, 0.3, 'sine', 0.05, 0.24);
  }

  bad(): void {
    this.tone(160, 0.1, 'sawtooth', 0.04, 0);
    this.tone(120, 0.12, 'sawtooth', 0.03, 0.06);
  }

  tap(): void {
    this.tone(900, 0.03, 'triangle', 0.035, 0);
  }

  undo(): void {
    this.tone(420, 0.08, 'sine', 0.05, 0);
    this.tone(320, 0.1, 'triangle', 0.04, 0.06);
  }

  refill(): void {
    this.tone(480, 0.06, 'sine', 0.04, 0);
    this.tone(560, 0.06, 'sine', 0.04, 0.07);
    this.tone(640, 0.08, 'sine', 0.045, 0.14);
  }

  whoosh(): void {
    this.noiseThock(0.08, 0.04);
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    delay: number,
  ): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private noiseThock(duration: number, gain: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = 1 - i / len;
      data[i] = (Math.random() * 2 - 1) * env * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 680;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start();
  }
}
