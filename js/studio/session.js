import { arrange } from "./songs.js";

export const MODES = {
  band: { name: "Banda", description: "Toca una parte mientras suenan las demás." },
  echo: { name: "Eco", description: "Escucha la frase, luego repítela en los mismos pads." },
  pulse: { name: "Pulso", description: "Marca el pulso cuando la guía desaparezca y comprueba tu tempo." },
  practice: { name: "Práctica", description: "Repite dos compases con la parte y el tempo que elijas." }
};

export function makeSession(song, { mode, part, speed = 1, firstBar = 0, blind = false }) {
  const beatSeconds = 60 / (song.bpm * speed);
  const meter = song.meter;
  const cue = beat => ({ beat, voice: "wood", midi: 60, accent: beat % meter === 0, gain: .45 });
  const backing = Array.from({ length: meter }, (_, i) => cue(i - meter));
  const targets = [];
  let beats = meter * 8;
  let phases = [];

  if (mode === "band" || mode === "practice") {
    const arrangement = arrange(song, part, firstBar, mode === "practice" ? 2 : 8);
    backing.push(...arrangement.backing);
    targets.push(...arrangement.targets);
    if (mode === "practice") beats = meter * 2;
  } else if (mode === "echo") {
    beats = meter * 8;
    for (let phrase = 0; phrase < 4; phrase++) {
      const { targets: example } = arrange(song, part, phrase, 1);
      const start = meter * phrase * 2;
      for (const note of example) {
        backing.push({ ...note, beat: note.beat + start });
        targets.push({ ...note, hold: 0, beat: note.beat + start + meter, hidden: blind });
      }
      phases.push({ beat: start, label: "Escucha" }, { beat: start + meter, label: "Responde" });
    }
  } else {
    for (let beat = 0; beat < beats; beat++) {
      const hidden = beat >= meter * 2 && beat < meter * 6;
      if (!hidden) backing.push(cue(beat));
      targets.push({ ...cue(beat), lane: 0, hidden, gain: .24 });
    }
    phases = [
      { beat: 0, label: "Sigue la guía" },
      { beat: meter * 2, label: "Mantén el pulso" },
      { beat: meter * 6, label: "Volvió la guía" }
    ];
  }

  const timing = note => ({ ...note, at: note.beat * beatSeconds, duration: (note.hold || 0) * beatSeconds });
  return {
    beatSeconds, meter, bpm: song.bpm * speed, end: beats * beatSeconds,
    backing: backing.map(timing).sort((a, b) => a.at - b.at),
    targets: targets.map(timing).sort((a, b) => a.at - b.at),
    phases
  };
}

export const HIT_WINDOW = .19;
export const PERFECT_WINDOW = .065;

export function closestNote(notes, lane, at) {
  let best;
  for (const note of notes) {
    if (note.state || note.lane !== lane || Math.abs(note.at - at) > HIT_WINDOW) continue;
    if (!best || Math.abs(note.at - at) < Math.abs(best.at - at)) best = note;
  }
  return best;
}

export function measure(notes) {
  const hits = notes.filter(note => note.state === "hit");
  const average = hits.length ? hits.reduce((sum, note) => sum + note.delta, 0) / hits.length : null;
  const pulse = hits.filter(note => note.hidden);
  const first = pulse[0];
  const last = pulse.at(-1);
  const tempo = pulse.length >= 2 ? 60 * (last.beat - first.beat) / (last.at + last.delta - first.at - first.delta) : null;
  return {
    hits: hits.length,
    total: notes.length,
    perfect: hits.filter(note => Math.abs(note.delta) <= PERFECT_WINDOW).length,
    average,
    tempo
  };
}
