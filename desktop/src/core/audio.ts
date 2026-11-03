export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;
  private noiseBuf: AudioBuffer | null = null;

  init(): void {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.4;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType = 'square',
    vol = 0.2,
    slideTo?: number,
    delay = 0,
  ): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol = 0.2, freq = 1200, delay = 0): void {
    if (!this.ctx || !this.master || !this.noiseBuf || !this.enabled) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur);
  }

  jump(): void { this.tone(300, 0.1, 'square', 0.12, 520); }
  doubleJump(): void { this.tone(420, 0.12, 'triangle', 0.14, 700); }
  dash(): void { this.noise(0.14, 0.14, 2400); this.tone(200, 0.12, 'sawtooth', 0.06, 90); }
  hit(): void { this.noise(0.09, 0.24, 1800); this.tone(160, 0.08, 'square', 0.1, 60); }
  hurt(): void { this.tone(220, 0.25, 'sawtooth', 0.2, 70); this.noise(0.18, 0.18, 900); }
  coin(): void { this.tone(880, 0.06, 'square', 0.08); this.tone(1320, 0.09, 'square', 0.07, undefined, 0.05); }
  raise(): void { this.tone(160, 0.35, 'triangle', 0.16, 420); this.tone(240, 0.4, 'sine', 0.1, 640, 0.08); }
  loot(): void { this.tone(520, 0.08, 'triangle', 0.12, 760); this.tone(900, 0.1, 'triangle', 0.1, 1200, 0.07); }
  spell(): void { this.tone(500, 0.22, 'sawtooth', 0.1, 1100); }
  heal(): void { this.tone(440, 0.18, 'sine', 0.14, 660); this.tone(660, 0.25, 'sine', 0.12, 990, 0.12); }
  summon(): void { this.tone(120, 0.4, 'sawtooth', 0.12, 300); this.tone(180, 0.5, 'triangle', 0.1, 480, 0.1); }
  death(): void { this.tone(180, 0.8, 'sawtooth', 0.2, 45); this.noise(0.7, 0.16, 500); }
  explode(): void { this.noise(0.3, 0.26, 900); this.tone(90, 0.3, 'sawtooth', 0.18, 35); }
  boss(): void { this.tone(70, 0.9, 'sawtooth', 0.22, 40); this.tone(105, 0.7, 'square', 0.08, 60, 0.15); }
  select(): void { this.tone(600, 0.05, 'square', 0.06); }
  buy(): void { this.tone(700, 0.07, 'square', 0.1); this.tone(1050, 0.1, 'square', 0.09, undefined, 0.06); }
  deny(): void { this.tone(140, 0.15, 'square', 0.12, 90); }
  victory(): void {
    const notes = [392, 523, 659, 784, 1046];
    notes.forEach((n, i) => this.tone(n, 0.5, 'triangle', 0.14, undefined, i * 0.16));
  }
}
