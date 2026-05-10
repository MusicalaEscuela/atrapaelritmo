import CONFIG from "../config.js";
import { audioEngine } from "../audio/audioEngine.js";
import { generatePattern } from "./patternGenerator.js";
import { isMissed, judgeTiming } from "./timingJudge.js";

export default class RhythmEngine {
  constructor(difficultyKey, calibrationOffsetMs = 0) {
    this.plan = generatePattern(difficultyKey);
    this.notes = this.plan.notes.map((note) => ({ ...note }));
    this.offsetMs = calibrationOffsetMs;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hits = 0;
    this.weightedHits = 0;
    this.misses = 0;
    this.resolved = 0;
    this.isFinished = false;
    this.finishReason = "";
  }

  async start() {
    await audioEngine.init();
    audioEngine.startTimeline({
      bpm: this.plan.bpm,
      countInBeats: CONFIG.countInBeats,
      totalBeats: this.plan.totalBeats
    });
  }

  stop() {
    audioEngine.stop();
  }

  audioTime() {
    return audioEngine.timelineTime();
  }

  visibleNotes(audioTime = this.audioTime()) {
    return this.notes.filter((note) => {
      if (note.resolved) return false;
      return audioTime >= note.spawnTime && audioTime <= note.targetTime + 0.45;
    });
  }

  updateMisses(audioTime = this.audioTime()) {
    for (const note of this.notes) {
      if (!note.resolved && isMissed(note, audioTime)) {
        this.resolveMiss(note);
      }
    }
    this.checkFinished(audioTime);
  }

  hitLane(lane) {
    const inputAudioTime = this.audioTime() + this.offsetMs / 1000;
    const candidates = this.notes
      .filter((note) => !note.resolved && note.lane === lane)
      .map((note) => ({ note, delta: inputAudioTime - note.targetTime }))
      .filter(({ delta }) => Math.abs(delta * 1000) <= CONFIG.judgeWindowsMs.bad)
      .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));

    if (!candidates.length) {
      audioEngine.playMiss();
      return { type: "miss", label: "Fallo", lane, empty: true, deltaMs: 0 };
    }

    const { note, delta } = candidates[0];
    const result = judgeTiming(delta * 1000);
    note.resolved = true;
    note.result = result.type;
    this.resolved += 1;

    if (result.type === "miss") {
      this.resolveMiss(note);
    } else {
      const comboBonus = Math.min(40, this.combo * 2);
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.hits += 1;
      this.weightedHits += { perfect: 1, good: 0.72, bad: 0.38 }[result.type] || 0;
      this.score += CONFIG.score[result.type] + comboBonus;
      audioEngine.setEnergyLevel(this.combo);
    }

    audioEngine.playLaneHit(lane, result.type);
    this.checkFinished(inputAudioTime);
    return { ...result, lane, noteId: note.id };
  }

  resolveMiss(note) {
    if (!note.resolved) {
      note.resolved = true;
      this.resolved += 1;
    }
    note.result = "miss";
    this.combo = 0;
    this.misses += 1;
    audioEngine.playMiss();
  }

  accuracy() {
    const total = this.hits + this.misses;
    if (!total) return 100;
    return Math.max(0, Math.round((this.weightedHits / total) * 100));
  }

  checkFinished(audioTime = this.audioTime()) {
    if (this.isFinished) return true;
    const lastTarget = this.notes.length ? this.notes[this.notes.length - 1].targetTime : 0;
    if (this.misses >= this.plan.maxFails) {
      this.isFinished = true;
      this.finishReason = "max-fails";
    } else if (this.resolved >= this.notes.length || audioTime > lastTarget + 1.2) {
      this.isFinished = true;
      this.finishReason = "complete";
    }
    return this.isFinished;
  }

  snapshot() {
    return {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      misses: this.misses,
      accuracy: this.accuracy(),
      totalNotes: this.notes.length,
      resolved: this.resolved,
      difficulty: this.plan.label,
      finishReason: this.finishReason
    };
  }
}
