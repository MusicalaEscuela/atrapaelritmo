import test from "node:test";
import assert from "node:assert/strict";
import { levelSettings, passedLevel } from "../js/rhythm/levels.js";
import { generatePattern } from "../js/rhythm/patternGenerator.js";
import RhythmEngine from "../js/rhythm/rhythmEngine.js";
import { audioEngine } from "../js/audio/audioEngine.js";
import { getUnlockedLevel, unlockNextLevel, getBestScore, saveBestScore } from "../js/storage/scores.js";
const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
audioEngine.playLaneHit = audioEngine.playMiss = audioEngine.setEnergyLevel = () => {};

test("levels gradually increase tempo and duration with bounded speeds", () => {
  for (const difficulty of ["easy", "normal", "hard"]) {
    const first = levelSettings(difficulty, 1);
    const second = levelSettings(difficulty, 2);
    const later = levelSettings(difficulty, 10);
    assert.ok(second.bpm > first.bpm);
    assert.ok(second.fallDuration < first.fallDuration);
    assert.ok(later.bars > first.bars);
    assert.ok(levelSettings(difficulty, 999).bpm <= 168);
    assert.ok(levelSettings(difficulty, 999).fallDuration >= 0.75);
  }
});

test("charts remain aligned to musical subdivisions at later levels", () => {
  for (const difficulty of ["easy", "normal", "hard"]) for (const level of [1, 2, 5, 9, 20]) {
    const plan = generatePattern(difficulty, level);
    assert.equal(plan.level, level);
    let previous = -Infinity;
    for (const note of plan.notes) {
      assert.ok(note.targetTime > previous);
      assert.ok(note.lane >= 0 && note.lane < 4);
      const step = (note.targetTime - plan.countIn) / (plan.beat / 4);
      assert.ok(Math.abs(step - Math.round(step)) < 1e-8);
      assert.ok(Math.abs(note.targetTime - note.spawnTime - plan.fallDuration) < 1e-8);
      previous = note.targetTime;
    }
  }
});

test("an actual completed run passes, while reaching the miss limit does not", () => {
  const won = new RhythmEngine("easy", 0, 2);
  for (const note of won.notes) {
    won.audioTime = () => note.targetTime;
    assert.equal(won.hitLane(note.lane).type, "perfect");
  }
  assert.equal(won.isFinished, false); // Let the musical coda play.
  won.checkFinished(won.plan.countIn + won.plan.totalBeats * won.plan.beat + 1.2);
  assert.equal(passedLevel(won.snapshot()), true);
  const lost = new RhythmEngine("easy", 0, 2);
  lost.updateMisses(lost.plan.countIn + lost.plan.totalBeats * lost.plan.beat + 2);
  assert.equal(lost.finishReason, "max-fails");
  assert.equal(passedLevel(lost.snapshot()), false);
});

test("progress unlocks sequentially per difficulty and replay never lowers it", async () => {
  assert.equal(getUnlockedLevel("easy"), 1);
  assert.equal(unlockNextLevel("easy", 5), 1);
  assert.equal(unlockNextLevel("easy", 1), 2);
  assert.equal(unlockNextLevel("easy", 2), 3);
  assert.equal(unlockNextLevel("easy", 1), 3);
  assert.equal(getUnlockedLevel("normal"), 1);
  // Reload module to verify persistent storage independently of session cache.
  const reloaded = await import("../js/storage/scores.js?reload");
  assert.equal(reloaded.getUnlockedLevel("easy"), 3);
});

test("unavailable or malformed storage does not stop play", async () => {
  storage.set("atrapa_el_ritmo_levels_v1", "invalid json");
  const clean = await import("../js/storage/scores.js?malformed");
  assert.equal(clean.getUnlockedLevel("normal"), 1);
  globalThis.localStorage = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); } };
  assert.equal(clean.unlockNextLevel("normal", 1), 2);
  assert.equal(clean.getUnlockedLevel("normal"), 2);
  assert.equal(saveBestScore(1200), 1200);
  assert.equal(getBestScore(), 1200);
});


test("each early level measurably increases required taps per second in all modes", () => {
  for (const difficulty of ["easy", "normal", "hard"]) {
    let previousRate = 0;
    for (let level = 1; level <= 6; level++) {
      const plan = generatePattern(difficulty, level);
      const rate = plan.notes.length / (plan.totalBeats * plan.beat);
      if (level > 1) assert.ok(rate > previousRate * 1.10, `${difficulty} level ${level}: ${rate} vs ${previousRate}`);
      previousRate = rate;
      if (level > 1) {
        assert.ok(plan.notes.filter(n => n.targetTime < plan.countIn + 4 * plan.beat).length >= levelSettings(difficulty, level).notesPerBar);
        assert.equal(new Set(plan.notes.slice(0,4).map(n => n.lane)).size, 4);
        for (let i=1;i<plan.notes.length;i++) assert.notEqual(plan.notes[i].lane, plan.notes[i-1].lane);
      }
    }
  }
});

test("advanced levels include musical sixteenth runs without simultaneous notes", () => {
  for (const difficulty of ["easy", "normal", "hard"]) {
    const plan = generatePattern(difficulty, 8);
    assert.ok(plan.notes.some(note => !Number.isInteger(note.stepInBar)));
    for (let i=1;i<plan.notes.length;i++) {
      assert.ok(plan.notes[i].targetTime - plan.notes[i-1].targetTime >= plan.beat / 4 - 1e-8);
    }
  }
});
