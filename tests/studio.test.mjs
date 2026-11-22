import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SONGS, PARTS } from "../js/studio/songs.js";
import { MODES, makeSession, closestNote, measure } from "../js/studio/session.js";

test("all song, mode and instrument combinations fit their charts and have both sample velocities", () => {
  for (const song of SONGS) {
    for (const mode of Object.keys(MODES)) {
      for (const part of Object.keys(PARTS)) {
        const { targets, backing, end } = makeSession(song, { mode, part });
        assert.ok(targets.length);
        const gates = new Set();
        for (const note of targets) {
          assert.ok(note.at >= 0 && note.at + note.duration < end);
          assert.ok(note.lane >= 0 && note.lane < 4);
          const key = `${note.at}/${note.lane}`;
          assert.ok(!gates.has(key), key);
          gates.add(key);
        }
        for (const voice of new Set([...targets, ...backing].map(note => note.voice))) {
          for (const velocity of [0, 1]) {
            const bytes = readFileSync(new URL(`../assets/studio/${voice}-${velocity}.wav`, import.meta.url));
            assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
          }
        }
      }
    }
  }
});

test("band keeps the chosen part out of playback and supports chords and sustains", () => {
  const melody = makeSession(SONGS[0], { mode: "band", part: "melody" });
  assert.ok(melody.targets.some(note => note.duration > 0));
  assert.ok(melody.backing.every(note => note.voice !== SONGS[0].lead));
  const drums = makeSession(SONGS[0], { mode: "band", part: "percussion" });
  const simultaneous = drums.targets.filter(note => note.at === drums.targets.find(n => n.lane === 3).at);
  assert.equal(simultaneous.length, 2);
  assert.notEqual(closestNote(drums.targets, simultaneous[0].lane, simultaneous[0].at),
    closestNote(drums.targets, simultaneous[1].lane, simultaneous[1].at));
});

test("echo copies the demonstrated phrase, pulse hides the guide, and practice uses the selected pair and tempo", () => {
  const song = SONGS.find(item => item.id === "bambuco");
  const echo = makeSession(song, { mode: "echo", part: "melody", blind: true });
  for (const note of echo.targets) {
    assert.ok(note.hidden);
    assert.ok(echo.backing.some(demo => Math.abs(demo.beat - note.beat + song.meter) < 1e-8 && demo.midi === note.midi));
  }
  const pulse = makeSession(song, { mode: "pulse" });
  const hidden = pulse.targets.filter(note => note.hidden);
  assert.ok(hidden.length > 2);
  assert.ok(hidden.every(note => !pulse.backing.some(cue => cue.at === note.at)));
  const performance = pulse.targets.map(note => ({ ...note, state: "hit", delta: .03 }));
  assert.ok(Math.abs(measure(performance).tempo - song.bpm) < .001);
  const practice = makeSession(song, { mode: "practice", part: "melody", speed: .5, firstBar: 6 });
  assert.equal(practice.bpm, song.bpm * .5);
  assert.equal(practice.end, 2 * song.meter * practice.beatSeconds);
  assert.ok(practice.targets.some(note => note.duration > 0));
});
