// Original synthesis only. No recordings, remote assets, timers or audio worklets.
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);

export class AudioDirector {
  constructor() {
    this.context = null;
    this.volume = 0.55;
    this.muted = false;
    this.paused = false;
    this.nodes = new Set();
    this.sources = new Set();
    this.beat = 0;
    this.nextBeat = 0;
    this.footClock = 0;
    this.lastSound = new Map();
    this.combat = false;
    this.transformed = false;
    this.intensity = 0;
  }

  async start() {
    try {
      if (!this.context) {
        const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContext) return false;
        this.context = new AudioContext({ latencyHint: 'interactive' });
        this.buildGraph();
      }
      if (this.context.state === 'suspended') await this.context.resume();
      this.nextBeat = this.context.currentTime + 0.12;
      this.applyVolume();
      return this.context.state === 'running';
    } catch {
      return false;
    }
  }

  track(node) { this.nodes.add(node); return node; }

  gain(value, destination) {
    const node = this.track(this.context.createGain());
    node.gain.value = value;
    if (destination) node.connect(destination);
    return node;
  }

  filter(type, freq, q = 0.7) {
    const node = this.track(this.context.createBiquadFilter());
    node.type = type;
    node.frequency.value = freq;
    node.Q.value = q;
    return node;
  }

  buildGraph() {
    const ctx = this.context;
    this.master = this.gain(0);
    const limiter = this.track(ctx.createDynamicsCompressor());
    limiter.threshold.value = -16;
    limiter.knee.value = 16;
    limiter.ratio.value = 5;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.18;
    this.master.connect(limiter);
    limiter.connect(ctx.destination);
    this.ambient = this.gain(0.3, this.master);
    this.music = this.gain(0.48, this.master);
    this.effects = this.gain(0.74, this.master);
    this.engine = this.gain(0, this.master);
    this.makeNoiseBuffer();

    // A short, dark room response glues the percussion and metallic tails together.
    const convolver = this.track(ctx.createConvolver());
    const impulse = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 0.9), ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      let previous = 0;
      for (let i = 0; i < data.length; i++) {
        previous = previous * 0.6 + (Math.random() * 2 - 1) * 0.4;
        data[i] = previous * (1 - i / data.length) ** 3;
      }
    }
    convolver.buffer = impulse;
    const reverb = this.gain(0.11, this.master);
    convolver.connect(reverb);
    this.music.connect(convolver);
    this.effects.connect(convolver);

    const rain = this.filter('lowpass', 2800, 0.5);
    const rainHighpass = this.filter('highpass', 480, 0.5);
    rain.connect(rainHighpass);
    rainHighpass.connect(this.gain(0.18, this.ambient));
    this.loopNoise(rain, 0.92);
    const city = this.filter('lowpass', 190, 0.8);
    city.connect(this.gain(0.16, this.ambient));
    this.loopNoise(city, 0.53);

    // Slightly detuned low oscillators and filtered mechanical hiss, not a raw buzzer.
    this.engineFilter = this.filter('lowpass', 650, 0.65);
    this.engineFilter.connect(this.engine);
    this.engineOscillators = [];
    for (const [type, base, level] of [['triangle', 54, 0.31], ['sawtooth', 108.7, 0.055], ['triangle', 163, 0.07]]) {
      const osc = this.track(ctx.createOscillator());
      osc.type = type;
      osc.frequency.value = base;
      osc.connect(this.gain(level, this.engineFilter));
      osc.start();
      this.sources.add(osc);
      this.engineOscillators.push({ osc, base });
    }
    const chainNoise = this.filter('bandpass', 1100, 1.2);
    chainNoise.connect(this.gain(0.10, this.engineFilter));
    this.loopNoise(chainNoise, 1.31);
    const flutter = this.track(ctx.createOscillator());
    flutter.type = 'sine';
    flutter.frequency.value = 23;
    const flutterDepth = this.gain(3.5);
    flutter.connect(flutterDepth);
    for (const { osc } of this.engineOscillators) flutterDepth.connect(osc.frequency);
    flutter.start();
    this.sources.add(flutter);
  }

  makeNoiseBuffer() {
    const ctx = this.context;
    this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  loopNoise(destination, speed) {
    const source = this.track(this.context.createBufferSource());
    source.buffer = this.noiseBuffer;
    source.loop = true;
    source.playbackRate.value = speed;
    source.connect(destination);
    source.start();
    this.sources.add(source);
  }

  release(source, nodes, stopTime) {
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      for (const node of [source, ...nodes]) {
        node.disconnect();
        this.nodes.delete(node);
      }
    };
    source.stop(stopTime);
  }

  tone(hz, duration, volume, type = 'sine', when = this.context.currentTime, endHz = hz, destination = this.effects) {
    const ctx = this.context;
    const oscillator = this.track(ctx.createOscillator());
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(hz, when);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(15, endHz), when + duration);
    const envelope = this.gain(0, destination);
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(volume, when + Math.min(0.015, duration * 0.1));
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.connect(envelope);
    oscillator.start(when);
    this.release(oscillator, [envelope], when + duration + 0.03);
  }

  noise(duration, volume, fromHz, toHz, type = 'bandpass', when = this.context.currentTime, destination = this.effects) {
    const source = this.track(this.context.createBufferSource());
    source.buffer = this.noiseBuffer;
    const filter = this.filter(type, fromHz, 0.8);
    filter.frequency.setValueAtTime(fromHz, when);
    filter.frequency.exponentialRampToValueAtTime(toHz, when + duration);
    const envelope = this.gain(0, destination);
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(volume, when + 0.009);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter);
    filter.connect(envelope);
    source.start(when, Math.random());
    this.release(source, [filter, envelope], when + duration + 0.03);
  }

  play(name) {
    if (!this.context || this.context.state !== 'running' || this.paused || this.muted) return;
    const now = this.context.currentTime;
    const aliases = { attack: 'light', hit: 'light', transform: 'ignite', footstep: 'step', special: 'finisher', kill: 'death' };
    name = aliases[name] || name;
    // Crowds may hit on the same frame. Coalesce identical sounds before node allocation.
    if (now - (this.lastSound.get(name) ?? -10) < (name === 'step' ? 0.18 : 0.055)) return;
    this.lastSound.set(name, now);
    const variation = 0.94 + Math.random() * 0.12;
    switch (name) {
      case 'light':
        this.noise(0.16, 0.22, 2200, 600);
        this.tone(120 * variation, 0.12, 0.24, 'triangle', now, 48);
        this.tone(890 * variation, 0.1, 0.045, 'sine', now + 0.014, 430);
        break;
      case 'heavy':
      case 'finisher':
        this.noise(name === 'finisher' ? 0.65 : 0.35, 0.36, 1700, 130, 'lowpass');
        this.tone(105, 0.4, 0.42, 'sine', now, 29);
        this.tone(186 * variation, 0.24, 0.17, 'triangle', now, 43);
        this.tone(1560, 0.22, 0.07, 'sine', now, 510);
        break;
      case 'dodge':
        this.noise(0.28, 0.17, 230, 2500);
        break;
      case 'parry':
        this.tone(1480, 0.5, 0.17, 'sine');
        this.tone(2214, 0.3, 0.10, 'sine');
        this.tone(90, 0.16, 0.3, 'triangle', now, 35);
        this.noise(0.09, 0.18, 5000, 850);
        break;
      case 'ignite':
        for (let i = 0; i < 4; i++) {
          this.noise(0.08, 0.17, 1600, 600, 'bandpass', now + i * 0.09);
          this.tone(70 + i * 16, 0.15, 0.19, 'triangle', now + i * 0.09, 45);
        }
        this.tone(46, 1.2, 0.34, 'triangle', now + 0.22, 190);
        this.noise(1.1, 0.27, 160, 2900, 'lowpass', now + 0.2);
        this.tone(85, 0.65, 0.25, 'sine', now + 0.8, 28);
        break;
      case 'hurt':
        this.noise(0.24, 0.23, 480, 110, 'lowpass');
        this.tone(95, 0.27, 0.28, 'triangle', now, 35);
        break;
      case 'ui':
        this.tone(760, 0.065, 0.065, 'sine', now, 1140);
        break;
      case 'boss':
        this.tone(62, 1.7, 0.25, 'triangle', now, 28);
        this.tone(92, 1.5, 0.16, 'sine', now, 41);
        this.noise(1.8, 0.24, 1100, 80, 'lowpass');
        break;
      case 'death':
        this.noise(0.38, 0.19, 900, 130, 'lowpass');
        this.tone(130, 0.32, 0.17, 'triangle', now, 35);
        break;
      case 'step':
        this.noise(0.10, 0.055, 800, 170, 'lowpass');
        this.tone(95 * variation, 0.06, 0.06, 'sine', now, 45);
        break;
      case 'victory':
        for (const [i, midi] of [50, 57, 62, 65].entries()) {
          this.tone(frequency(midi), 2.2, 0.11, 'sine', now + i * 0.24);
          this.tone(frequency(midi + 12), 1.6, 0.035, 'triangle', now + i * 0.24);
        }
        break;
    }
  }

  scheduleBeat(when) {
    const step = this.beat++ % 32;
    const root = [38, 39, 38, 36][Math.floor(step / 8)];
    if (this.combat) {
      if (step % 4 === 0 || step % 8 === 6) {
        this.tone(100, 0.19, 0.16, 'sine', when, 34, this.music);
        this.noise(0.04, 0.08, 700, 100, 'lowpass', when, this.music);
      }
      if (step % 4 === 2) this.noise(0.16, 0.12, 1500, 620, 'bandpass', when, this.music);
      this.noise(0.04, 0.024, 6300, 3400, 'highpass', when, this.music);
      if (step % 2 === 0) this.tone(frequency(root), 0.21, 0.13, 'triangle', when, frequency(root), this.music);
      if (this.intensity > 0.4 && step % 2 === 1) {
        const note = root + 24 + [0, 7, 12, 3][Math.floor(step / 2) % 4];
        this.tone(frequency(note), 0.24, 0.045, 'sine', when, frequency(note), this.music);
      }
    } else if (step % 8 === 0) {
      this.tone(frequency(root + 12), 3.8, 0.075, 'sine', when, frequency(root + 12), this.music);
      this.tone(frequency(root + 19), 3.3, 0.035, 'sine', when + 0.1, frequency(root + 19), this.music);
    }
  }

  update(dt, { combat = false, transformed = false, moving = false, intensity = 0 } = {}) {
    if (!this.context || this.context.state !== 'running' || this.paused) return;
    const now = this.context.currentTime;
    if (combat !== this.combat) {
      this.nextBeat = now + 0.06;
      this.beat = 0;
    }
    this.combat = combat;
    this.transformed = transformed;
    this.intensity = Number.isFinite(intensity) ? clamp(intensity, 0, 1) : 0;
    this.engine.gain.setTargetAtTime(transformed ? (combat ? 0.26 : 0.16) : 0, now, 0.2);
    const rpm = 1 + (moving ? 0.33 : 0) + this.intensity * 0.65;
    for (const { osc, base } of this.engineOscillators) osc.frequency.setTargetAtTime(base * rpm, now, 0.12);
    this.engineFilter.frequency.setTargetAtTime(560 + this.intensity * 750, now, 0.15);
    this.music.gain.setTargetAtTime(combat ? 0.56 : 0.40, now, 0.8);
    this.ambient.gain.setTargetAtTime(combat ? 0.16 : 0.3, now, 0.8);
    if (this.nextBeat < now - 0.25) this.nextBeat = now + 0.05;
    for (let guard = 0; this.nextBeat < now + 0.12 && guard < 4; guard++) {
      this.scheduleBeat(this.nextBeat);
      this.nextBeat += 60 / (combat ? 124 : 70) / 2;
    }
    if (moving) {
      this.footClock -= clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
      if (this.footClock <= 0) { this.play('step'); this.footClock = transformed ? 0.31 : 0.38; }
    } else this.footClock = 0;
  }

  applyVolume() {
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(this.muted || this.paused ? 0 : this.volume * 0.8, this.context.currentTime, 0.035);
  }

  setVolume(value) { this.volume = Number.isFinite(value) ? clamp(value, 0, 1) : 0.55; this.applyVolume(); }
  setMuted(value) { this.muted = Boolean(value); this.applyVolume(); }
  pause(value) {
    this.paused = Boolean(value);
    if (this.context) this.nextBeat = this.context.currentTime + 0.08;
    this.applyVolume();
  }

  dispose() {
    for (const source of this.sources) { try { source.stop(); } catch { /* already ended */ } }
    for (const node of this.nodes) { try { node.disconnect(); } catch { /* already disconnected */ } }
    this.sources.clear();
    this.nodes.clear();
    if (this.context && this.context.state !== 'closed') this.context.close().catch(() => {});
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.lastSound.clear();
  }
}
