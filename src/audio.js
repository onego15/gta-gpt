export class AudioSystem {
  start() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.25;
    this.master.connect(this.ctx.destination);
    this.engine = this.ctx.createOscillator();
    this.engine.type = "sawtooth";
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    let f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 210;
    this.engine.connect(f).connect(this.engineGain).connect(this.master);
    this.engine.start();
    this.ambient = this.ctx.createBufferSource();
    let b = this.ctx.createBuffer(
        1,
        this.ctx.sampleRate * 3,
        this.ctx.sampleRate,
      ),
      a = b.getChannelData(0);
    let v = 0;
    for (let i = 0; i < a.length; i++) {
      v = (v + (Math.random() * 2 - 1) * 0.025) / 1.025;
      a[i] = v;
    }
    this.ambient.buffer = b;
    this.ambient.loop = true;
    let g = this.ctx.createGain();
    g.gain.value = 0.2;
    this.ambient.connect(g).connect(this.master);
    this.ambient.start();
  }
  tone(freq = 600, duration = 0.1, volume = 0.1, type = "sine") {
    if (!this.ctx || this.muted) return;
    let o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(
      freq * 0.65,
      this.ctx.currentTime + duration,
    );
    g.gain.setValueAtTime(volume, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(this.ctx.currentTime + duration);
  }
  shot(enemy = false) {
    if (!this.ctx || this.muted) return;
    let b = this.ctx.createBuffer(
        1,
        this.ctx.sampleRate * 0.17,
        this.ctx.sampleRate,
      ),
      d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    let s = this.ctx.createBufferSource(),
      g = this.ctx.createGain();
    s.buffer = b;
    g.gain.value = enemy ? 0.12 : 0.4;
    s.connect(g).connect(this.master);
    s.start();
    this.tone(100, 0.16, 0.25, "triangle");
  }
  update(speed, driving, wanted, t) {
    if (!this.ctx) return;
    this.engine.frequency.setTargetAtTime(
      40 + Math.abs(speed) * 5,
      this.ctx.currentTime,
      0.1,
    );
    this.engineGain.gain.setTargetAtTime(
      driving && !this.muted ? 0.08 : 0,
      this.ctx.currentTime,
      0.1,
    );
    if (wanted && Math.floor(t * 2) !== this.beat) {
      this.beat = Math.floor(t * 2);
      this.tone(this.beat % 2 ? 730 : 540, 0.4, 0.025);
    }
  }
  mute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.25;
    return this.muted;
  }
}
