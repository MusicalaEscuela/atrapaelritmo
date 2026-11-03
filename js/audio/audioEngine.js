const VOLUME_KEY = "atrapa_ritmo_volume";
const CHORDS = [
  [261.63, 329.63, 392, 493.88], // Cmaj7
  [220, 261.63, 329.63, 392],   // Am7
  [174.61, 220, 261.63, 329.63], // Fmaj7
  [196, 246.94, 293.66, 392]   // G
];

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.output = null;
    this.volume = 0.85;
    try {
      const stored = localStorage.getItem(VOLUME_KEY);
      if (stored !== null && Number.isFinite(Number(stored))) this.volume = Math.max(0, Math.min(1, Number(stored)));
    } catch { /* Storage can be unavailable in private browsing. */ }
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
  }

  async init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.music = this.ctx.createGain();
      this.fx = this.ctx.createGain();
      this.master.gain.value = 2.2;
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 18;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.18;
      this.output = this.ctx.createGain();
      this.output.gain.value = this.volume;
      this.music.gain.value = 0.95;
      this.fx.gain.value = 0.65;
      this.music.connect(this.master);
      this.fx.connect(this.master);
      this.master.connect(compressor);
      compressor.connect(this.output);
      this.output.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer();
    }

    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    return this.ctx;
  }

  setVolume(value) {
    if (!Number.isFinite(Number(value))) return;
    this.volume = Math.max(0, Math.min(1, Number(value)));
    if (this.output) this.output.gain.setTargetAtTime(this.volume, this.now(), 0.025);
    try { localStorage.setItem(VOLUME_KEY, String(this.volume)); } catch { /* Optional persistence. */ }
  }

  chordAt(songBeat) {
    return CHORDS[Math.floor((Math.max(0, songBeat) + 1e-7) / 4) % CHORDS.length];
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  startTimeline({ bpm, countInBeats, totalBeats, notes = [] }) {
    this.stop();
    this.bpm = bpm;
    this.beatDuration = 60 / bpm;
    this.countInBeats = countInBeats;
    this.totalBeats = totalBeats;
    this.nextBeatIndex = 0;
    this.melodyNotes = notes;
    this.nextNoteIndex = 0;
    this.energyLevel = 0;
    this.energyDropUntil = 0;
    this.startTime = this.now() + 0.08;
    this.isPlaying = true;
    this.schedulerId = window.setInterval(() => this.schedulerTick(), 25);
    this.schedulerTick();
    return this.startTime;
  }

  // Rendering and judging follow the audio reaching the speakers, not the render-ahead clock.
  audibleNow(at = performance.now()) {
    const current = performance.now();
    if (!Number.isFinite(at) || Math.abs(at - current) > 1000) at = current;
    const stamp = this.ctx?.getOutputTimestamp?.();
    let heard;
    if (stamp && stamp.contextTime > 0 && stamp.performanceTime > 0 && Math.abs(current - stamp.performanceTime) < 1000) {
      heard = stamp.contextTime + (at - stamp.performanceTime) / 1000;
    } else {
      const latency = (this.ctx?.baseLatency || 0) + (this.ctx?.outputLatency || 0);
      heard = this.now() - latency + (at - current) / 1000;
    }
    // DynamicsCompressorNode has a fixed 6 ms look-ahead delay.
    return Math.min(this.now(), heard) - 0.006;
  }

  timelineTime(at) {
    if (!this.isPlaying) return 0;
    return this.audibleNow(at) - this.startTime;
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
      if (time >= this.now() - 0.025) this.scheduleBeat(this.nextBeatIndex, time);
      this.nextBeatIndex += 1;
    }
    while (this.nextNoteIndex < (this.melodyNotes?.length || 0)) {
      const note = this.melodyNotes[this.nextNoteIndex];
      const time = this.startTime + note.targetTime;
      if (time > this.now() + this.lookahead) break;
      if (time >= this.now() - 0.025) {
        const songBeat = (note.targetTime / this.beatDuration) - this.countInBeats;
        this.scheduleBell(time, this.chordAt(songBeat)[note.lane] * 2, 0.95);
      }
      this.nextNoteIndex += 1;
    }
  }

  scheduleBeat(index, time) {
    if (index < this.countInBeats) {
      this.scheduleBell(time, index === 0 ? 880 : 660, 0.9);
      return;
    }
    const songBeat = index - this.countInBeats;
    const beat = songBeat % 4;
    const bar = Math.floor(songBeat / 4);
    const totalBars = this.totalBeats / 4;
    const chord = this.chordAt(songBeat);
    const energy = this.getEffectiveEnergy();
    const b = this.beatDuration;
    // A short tonic coda after the playable phrase.
    if (songBeat >= this.totalBeats) {
      if (songBeat === this.totalBeats) {
        this.scheduleChord(time, CHORDS[0], 0.8, 0.8);
        this.scheduleBass(time, 130.815, 1);
        this.scheduleBell(time, 523.26, 0.8);
      }
      return;
    }
    const intro = bar < 2;
    const breakdown = totalBars >= 10 && bar === Math.floor(totalBars / 2);
    const finale = bar >= totalBars - 2;
    if (!breakdown || beat === 0) {
      if (beat === 0 || beat === 2) this.scheduleKick(time, beat === 0 ? 1.25 : 1);
      if (beat === 1 || beat === 3) this.scheduleClap(time, 1.05);
      if (!intro && beat === 2) this.scheduleKick(time + b * 0.75, 0.65);
    }
    this.scheduleHat(time, beat % 2 ? 0.65 : 0.45);
    if (!intro && !breakdown) this.scheduleHat(time + b * 0.5, 0.48);
    // Bass is always present: the song has body even without a combo.
    this.scheduleBass(time, chord[beat === 2 ? 2 : 0] / 2, beat === 0 ? 1.2 : 0.85);
    if (beat === 1 || beat === 3) this.scheduleBass(time + b * 0.75, chord[0], 0.55);
    if (beat === 0) this.scheduleChord(time, chord, intro ? 0.48 : 0.7, b * 1.4);
    if (!intro && (beat === 1 || beat === 3)) this.scheduleChord(time + b * 0.5, chord, 0.65, b * 0.35);
    // Playable melody is scheduled from the chart itself in schedulerTick.
    if (energy >= 2 && beat === 0) this.scheduleChord(time, chord.map(n => n * 2), 0.25, b * 0.6);
    if (energy >= 1 && !breakdown) this.scheduleHat(time + b * 0.75, 0.28);
    if (beat === 3 && (bar % 4 === 3 || finale)) {
      this.scheduleClap(time + b * 0.5, 0.5);
      this.scheduleClap(time + b * 0.75, 0.65);
    }
  }

  scheduleChord(time, notes, intensity = 0.7, duration = 0.3) {
    notes.forEach((note, index) => {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.createEnvelope(this.music, time, {
        attack: 0.012, decay: duration, peak: 0.075 * intensity
      });
      osc.type = "triangle";
      osc.frequency.value = note;
      osc.detune.value = index % 2 ? 4 : -4;
      filter.type = "lowpass";
      filter.frequency.value = 2400;
      osc.connect(filter).connect(gain);
      osc.start(time);
      osc.stop(time + duration + 0.06);
      this.trackNode(osc);
    });
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
    const songBeat = Math.max(0, this.timelineTime() / this.beatDuration - this.countInBeats);
    const base = this.chordAt(songBeat)[lane] * 2;
    const time = this.now();
    if (["perfect", "good", "bad"].includes(resultType)) {
      // One short accent: avoid the old delayed three-note echo hiding the pulse.
      this.scheduleBell(time, base, resultType === "perfect" ? 0.22 : 0.12);
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
      peak: 0.045
    });
    osc.type = "sine";
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
