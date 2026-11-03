import test from "node:test";
import assert from "node:assert/strict";
import { audioEngine } from "../js/audio/audioEngine.js";
import { generatePattern } from "../js/rhythm/patternGenerator.js";
import RhythmEngine from "../js/rhythm/rhythmEngine.js";
import { estimateCalibration } from "../js/rhythm/calibration.js";

const original = {};
for (const name of ["scheduleBeat", "scheduleBell", "playLaneHit", "playMiss", "setEnergyLevel"]) {
  original[name] = audioEngine[name];
  audioEngine[name] = () => {};
}
globalThis.window = { setInterval: () => 1, clearInterval() {} };
audioEngine.ctx = { currentTime: 0, baseLatency: 0.02, outputLatency: 0.08 };

test("audible clock compensates device latency and timestamps input events", () => {
  audioEngine.ctx.currentTime = 10;
  assert.ok(Math.abs(audioEngine.audibleNow() - 9.894) < .002);
  assert.ok(Math.abs(audioEngine.audibleNow(performance.now() - 40) - 9.854) < .002);
  const stampTime = performance.now();
  audioEngine.ctx.getOutputTimestamp = () => ({contextTime: 9.8, performanceTime: stampTime});
  assert.ok(Math.abs(audioEngine.audibleNow(stampTime) - 9.794) < 1e-8);
  delete audioEngine.ctx.getOutputTimestamp;
});

test("every chart note schedules exactly one melody sound at its target, on all difficulties", () => {
  for (const difficulty of ["easy", "normal", "hard"]) {
    const plan = generatePattern(difficulty);
    const played = [];
    audioEngine.scheduleBell = (time, frequency) => played.push({time, frequency});
    audioEngine.ctx.currentTime = 0;
    audioEngine.startTimeline({bpm:plan.bpm,countInBeats:4,totalBeats:plan.totalBeats,notes:plan.notes});
    const start = audioEngine.startTime;
    for (let t = 0; t < plan.countIn + plan.totalBeats * plan.beat + 2; t += .025) {
      audioEngine.ctx.currentTime = t;
      audioEngine.schedulerTick();
    }
    assert.equal(played.length, plan.notes.length);
    plan.notes.forEach((note, i) => {
      assert.ok(Math.abs(played[i].time - start - note.targetTime) < 1e-8);
      const beat = note.targetTime / plan.beat - 4;
      assert.equal(played[i].frequency, audioEngine.chordAt(beat)[note.lane] * 2);
    });
    audioEngine.stop();
  }
  audioEngine.scheduleBell = () => {};
});

test("late calibrated taps remain playable until the same corrected miss deadline", () => {
  for (const offset of [-150, 0, 100]) {
    const engine = new RhythmEngine("normal", offset);
    const note = engine.notes[0];
    engine.notes = [note];
    engine.audioTime = () => note.targetTime - offset / 1000;
    engine.updateMisses();
    assert.equal(note.resolved, false);
    assert.equal(engine.hitLane(note.lane).type, "perfect");
    assert.equal(engine.misses, 0);
    assert.equal(engine.resolved, 1);
    const missed = new RhythmEngine("normal", offset);
    missed.notes = [{...note, resolved:false}];
    missed.audioTime = () => note.targetTime - offset / 1000 + .181;
    missed.updateMisses();
    assert.equal(missed.misses, 1);
  }
});

test("guided calibration handles consistent taps, outliers and unreliable attempts", () => {
  assert.equal(estimateCalibration([98,100,102,99,101,100,100,99,101,100,98,250]).offset, -100);
  assert.equal(estimateCalibration([-20,-22,-19,-21,-20,-18,-22,-20]).offset, 20);
  assert.equal(estimateCalibration([1,2,3]).ok, false);
  assert.equal(estimateCalibration([-200,200,-150,150,-100,100,-80,80,0,200,-200,150]).ok, false);
  assert.equal(estimateCalibration(Array(12).fill(250)).ok, false);
});

test("scheduler skips stale melody after a long stall instead of playing a burst", () => {
  const plan = generatePattern("easy");
  const played = [];
  audioEngine.scheduleBell = (time) => played.push(time);
  audioEngine.ctx.currentTime = 0;
  audioEngine.startTimeline({bpm:plan.bpm,countInBeats:4,totalBeats:plan.totalBeats,notes:plan.notes});
  audioEngine.ctx.currentTime = 12;
  audioEngine.schedulerTick();
  assert.ok(played.every(time => time >= 11.975));
  audioEngine.stop();
});
