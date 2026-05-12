class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.music = null;
    this.fx = null;
    this.noiseBuffer = null;
    this.startTime = 0;
    this.isPlaying = false;
    this.scheduledNodes = [];
    this.schedulerId = null;
    this.bpm = 92;
    this.beatDuration = 60 / this.bpm;
    this.countInBeats = 4;
    this.totalBeats = 0;
    this.nextBeatIndex = 0;
    this.lookahead = 0.12;
    this.energyLevel = 0;
    this.energyDropUntil = 0;
    this.laneNotes = [523.25, 659.25, 783.99, 1046.5];
  }

  async init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.music = this.ctx.createGain();
      this.fx = this.ctx.createGain();
      this.master.gain.value = 0.74;
      this.music.gain.value = 0.48;
      this.fx.gain.value = 0.72;
      this.music.connect(this.master);
      this.fx.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer();
    }

    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    return this.ctx;
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  startTimeline({ bpm, countInBeats, totalBeats }) {
    this.stop();
    this.bpm = bpm;
    this.beatDuration = 60 / bpm;
    this.countInBeats = countInBeats;
    this.totalBeats = totalBeats;
    this.nextBeatIndex = 0;
    this.energyLevel = 0;
    this.energyDropUntil = 0;
    this.startTime = this.now() + 0.08;
    this.isPlaying = true;
    this.schedulerId = window.setInterval(() => this.schedulerTick(), 25);
    this.schedulerTick();
    return this.startTime;
  }

  timelineTime() {
    if (!this.isPlaying) return 0;
    return Math.max(0, this.now() - this.startTime);
  }

  stop() {
    if (this.schedulerId) {
      window.clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
    this.scheduledNodes.forEach((node) => {
      try {
        node.stop();
      } catch {
        // Node already stopped.
      }
    });
    this.scheduledNodes = [];
    this.isPlaying = false;
  }

  schedulerTick() {
    if (!this.isPlaying || !this.ctx) return;
    const endBeat = this.countInBeats + this.totalBeats + 2;
    while (this.nextBeatIndex < endBeat) {
      const time = this.startTime + this.nextBeatIndex * this.beatDuration;
      if (time > this.now() + this.lookahead) break;
      this.scheduleBeat(this.nextBeatIndex, time);
      this.nextBeatIndex += 1;
    }
  }

  scheduleBeat(index, time) {
    const isCountIn = index < this.countInBeats;
    const songBeat = Math.max(0, index - this.countInBeats);
    const beatInBar = songBeat % 4;
    const energy = this.getEffectiveEnergy();

    if (isCountIn) {
      this.scheduleBell(time, beatInBar === 0 ? 880 : 660, beatInBar === 0 ? 0.45 : 0.32);
      return;
    }

    if (beatInBar === 0 || beatInBar === 2) {
      this.scheduleKick(time, beatInBar === 0 ? 0.82 : 0.55);
    }
    if (beatInBar === 1 || beatInBar === 3) {
      this.scheduleClap(time, energy >= 1 ? 0.42 : 0.28);
    }

    if (energy >= 1) {
      this.scheduleHat(time, 0.22);
      this.scheduleHat(time + this.beatDuration / 2, energy >= 2 ? 0.18 : 0.12);
    }

    if (energy >= 2) {
      const bassNotes = [98, 123.47, 110, 146.83];
      this.scheduleBass(time, bassNotes[beatInBar], beatInBar === 0 ? 0.52 : 0.34);
    }

    if (energy >= 3) {
      const melody = [523.25, 659.25, 783.99, 659.25, 880, 783.99, 659.25, 523.25];
      const note = melody[songBeat % melody.length];
      this.scheduleBell(time + this.beatDuration * 0.5, note, 0.2);
      if (beatInBar === 3) {
        this.scheduleBell(time + this.beatDuration * 0.75, note * 1.25, 0.16);
      }
    }
  }

  getEffectiveEnergy() {
    if (this.now() < this.energyDropUntil) {
      return Math.max(0, this.energyLevel - 2);
    }
    return this.energyLevel;
  }

  setEnergyLevel(combo) {
    if (combo >= 20) this.energyLevel = 3;
    else if (combo >= 10) this.energyLevel = 2;
    else if (combo >= 5) this.energyLevel = 1;
    else this.energyLevel = 0;
  }

  dropEnergy() {
    this.energyDropUntil = this.now() + 1.4;
    this.energyLevel = Math.max(0, this.energyLevel - 1);
  }

  createEnvelope(destination, time, {
    attack = 0.006,
    decay = 0.14,
    peak = 0.24,
    sustain = 0.0001
  } = {}) {
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + attack);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), time + attack + decay);
    gain.connect(destination);
    return gain;
  }

  createNoiseBuffer() {
    const length = this.ctx.sampleRate * 1.2;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  trackNode(node) {
    this.scheduledNodes.push(node);
    node.addEventListener?.("ended", () => {
      this.scheduledNodes = this.scheduledNodes.filter((item) => item !== node);
    });
  }

  scheduleKick(time, intensity = 1) {
    const osc = this.ctx.createOscillator();
    const gain = this.createEnvelope(this.music, time, {
      attack: 0.004,
      decay: 0.18,
      peak: 0.35 * intensity
    });
    osc.type = "sine";
    osc.frequency.setValueAtTime(138, time);
    osc.frequency.exponentialRampToValueAtTime(48, time + 0.16);
    osc.connect(gain);
    osc.start(time);
    osc.stop(time + 0.22);
    this.trackNode(osc);
  }

  scheduleClap(time, intensity = 1) {
    const noise = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.createEnvelope(this.music, time, {
      attack: 0.005,
      decay: 0.075,
      peak: 0.16 * intensity
    });
    noise.buffer = this.noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1450, time);
    filter.Q.setValueAtTime(0.85, time);
    noise.connect(filter).connect(gain);
    noise.start(time);
    noise.stop(time + 0.1);
    this.trackNode(noise);
  }

  scheduleHat(time, intensity = 1) {
    const noise = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.createEnvelope(this.music, time, {
      attack: 0.002,
      decay: 0.04,
      peak: 0.09 * intensity
    });
    noise.buffer = this.noiseBuffer;
    filter.type = "highpass";
    filter.frequency.setValueAtTime(5200, time);
    noise.connect(filter).connect(gain);
    noise.start(time);
    noise.stop(time + 0.055);
    this.trackNode(noise);
  }

  scheduleBass(time, note = 110, intensity = 1) {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.createEnvelope(this.music, time, {
      attack: 0.012,
      decay: 0.28,
      peak: 0.16 * intensity
    });
    osc.type = "triangle";
    osc.frequency.setValueAtTime(note, time);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(620, time);
    osc.connect(filter).connect(gain);
    osc.start(time);
    osc.stop(time + 0.34);
    this.trackNode(osc);
  }

  scheduleBell(time, note = 660, intensity = 1) {
    const oscA = this.ctx.createOscillator();
    const oscB = this.ctx.createOscillator();
    const gain = this.createEnvelope(this.music, time, {
      attack: 0.008,
      decay: 0.32,
      peak: 0.12 * intensity
    });
    oscA.type = "sine";
    oscB.type = "triangle";
    oscA.frequency.setValueAtTime(note, time);
    oscB.frequency.setValueAtTime(note * 2.01, time);
    oscA.connect(gain);
    oscB.connect(gain);
    oscA.start(time);
    oscB.start(time);
    oscA.stop(time + 0.38);
    oscB.stop(time + 0.28);
    this.trackNode(oscA);
    this.trackNode(oscB);
  }

  playLaneHit(lane, resultType = "perfect") {
    if (!this.ctx) return;
    const base = this.laneNotes[lane] || 660;
    const time = this.now();
    if (resultType === "perfect") {
      this.scheduleBell(time, base, 0.46);
      this.scheduleBell(time + 0.045, base * 1.25, 0.34);
      this.scheduleBell(time + 0.09, base * 1.5, 0.24);
      return;
    }
    if (resultType === "good") {
      this.scheduleBell(time, base, 0.34);
      return;
    }
    if (resultType === "bad") {
      this.scheduleBell(time, base * 0.75, 0.22);
      return;
    }
    this.playMiss();
  }

  playMiss() {
    if (!this.ctx) return;
    const time = this.now();
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.createEnvelope(this.fx, time, {
      attack: 0.004,
      decay: 0.11,
      peak: 0.15
    });
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(170, time);
    osc.frequency.exponentialRampToValueAtTime(92, time + 0.11);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(520, time);
    osc.connect(filter).connect(gain);
    osc.start(time);
    osc.stop(time + 0.14);
    this.trackNode(osc);
    this.dropEnergy();
  }
}

export const audioEngine = new AudioEngine();
