// audio-engine.js
// Motor de audio para Atrapa el Ritmo
// Sin archivos externos, puro Web Audio API (más confiable y preciso)

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;

    this.isRunning = false;
    this.bpm = 90;

    this.lookahead = 25; // ms
    this.scheduleAheadTime = 0.1; // segundos

    this.currentBeat = 0;
    this.nextNoteTime = 0;

    this.timerID = null;

    // subdivisión base (4 = negras)
    this.subdivision = 4;

    // callbacks externos (para sincronizar visual)
    this.onBeat = null;
  }

  /* =========================
     INIT
  ========================= */

  async init() {
    if (this.ctx) return;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.9;
    this.masterGain.connect(this.ctx.destination);

    // desbloquear audio (móviles)
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  /* =========================
     CONTROL
  ========================= */

  start(bpm = 90) {
    if (!this.ctx) return;

    this.stop();

    this.bpm = bpm;
    this.isRunning = true;

    this.currentBeat = 0;
    this.nextNoteTime = this.ctx.currentTime;

    this.scheduler();
  }

  stop() {
    this.isRunning = false;

    if (this.timerID) {
      clearTimeout(this.timerID);
      this.timerID = null;
    }
  }

  /* =========================
     SCHEDULER (CORAZÓN)
  ========================= */

  scheduler() {
    while (
      this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime
    ) {
      this.scheduleBeat(this.currentBeat, this.nextNoteTime);
      this.nextBeat();
    }

    this.timerID = setTimeout(() => this.scheduler(), this.lookahead);
  }

  nextBeat() {
    const secondsPerBeat = 60.0 / this.bpm;

    this.nextNoteTime += secondsPerBeat;
    this.currentBeat++;
  }

  /* =========================
     SONIDO DE PULSO
  ========================= */

  scheduleBeat(beatNumber, time) {
    const isStrong = beatNumber % 4 === 0;

    this.playClick(time, isStrong);

    if (this.onBeat) {
      this.onBeat(beatNumber, time);
    }
  }

  playClick(time, strong = false) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = strong ? 1000 : 700;

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.5, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.06);
  }

  /* =========================
     FEEDBACK DEL JUGADOR
  ========================= */

  playHit(type = "good") {
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (type === "perfect") {
      osc.frequency.value = 1200;
    } else if (type === "good") {
      osc.frequency.value = 900;
    } else {
      osc.frequency.value = 250;
    }

    osc.type = "triangle";

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.6, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  /* =========================
     NOTAS RÍTMICAS (CLAVE)
  ========================= */

  playPattern(pattern = []) {
    // pattern ejemplo:
    // [1, 0, 1, 1, 0, 0, 1, 0]
    // donde 1 = golpe, 0 = silencio

    const secondsPerBeat = 60 / this.bpm;
    const stepTime = secondsPerBeat / 2; // subdivisión básica (corcheas)

    let t = this.ctx.currentTime;

    pattern.forEach((step) => {
      if (step === 1) {
        this.playNote(t);
      }
      t += stepTime;
    });
  }

  playNote(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "square";
    osc.frequency.value = 600;

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.4, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.1);
  }

  /* =========================
     UTILIDAD
  ========================= */

  setVolume(value) {
    if (!this.masterGain) return;
    this.masterGain.gain.value = value;
  }

  setBPM(bpm) {
    this.bpm = bpm;
  }
}

export default AudioEngine;