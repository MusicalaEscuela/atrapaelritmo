export const PARTS = {
  percussion: "Percusión",
  bass: "Bajo",
  melody: "Melodía"
};

const tones = [0, 2, 4, 5, 7, 9, 11];

const songs = [
  {
    id: "cumbia", name: "Patio de colores", style: "Cumbia", bpm: 96, meter: 4, key: 60,
    scale: [0, 2, 3, 5, 7, 8, 10], chords: [0, 0, 4, 4, 0, 3, 4, 0],
    lead: "marimba", drums: ["tambora", "guache", "wood", "clap"],
    groove: [[0,0],[.5,1],[1,2],[1.5,1],[2,0],[2.5,1],[3,2],[3.5,1]],
    bass: [0, 1.5, 2, 3.5],
    phrases: [[[0,0],[.5,2],[1,4],[2,2],[3,1],[3.5,2]], [[0,3],[1,4],[1.5,3],[2.5,1],[3.5,0]]]
  },
  {
    id: "pop", name: "Vuelta al sol", style: "Pop", bpm: 104, meter: 4, key: 62,
    chords: [0, 4, 5, 3, 0, 4, 3, 0],
    lead: "piano", drums: ["kick", "hat", "snare", "clap"],
    groove: [[0,0],[.5,1],[1,2],[1.5,1],[2,0],[2.5,1],[3,2],[3.5,1]],
    bass: [0, 1, 2.5, 3],
    phrases: [[[0,2],[1,2],[1.5,4],[2,5],[3,4]], [[0,4],[.5,2],[1,0],[2,1],[3,0]]]
  },
  {
    id: "funk", name: "Cruce nocturno", style: "Funk", bpm: 110, meter: 4, key: 57,
    scale: [0, 2, 3, 5, 7, 9, 10], chords: [0, 0, 3, 3, 0, 1, 4, 0],
    lead: "keys", drums: ["kick", "hat", "snare", "clap"],
    groove: [[0,0],[.5,1],[.75,0],[1,2],[1.5,1],[2.25,0],[2.5,1],[3,2],[3.75,1]],
    bass: [0, .75, 1.5, 2.25, 3.5],
    phrases: [[[0,0],[.75,3],[1.5,4],[2.25,2],[2.75,3],[3.5,1]], [[.25,4],[1,5],[1.75,4],[2.5,2],[3.25,0]]]
  },
  {
    id: "salsa", name: "Paso de esquina", style: "Salsa", bpm: 116, meter: 4, key: 65,
    chords: [0, 3, 1, 4, 0, 3, 4, 0],
    lead: "piano", drums: ["tambora", "guache", "wood", "clap"],
    groove: [[0,2],[.5,1],[1.5,2],[2,0],[2.5,1],[3,2],[3.5,0]],
    alternateGroove: [[0,0],[.5,1],[1,2],[1.5,0],[2,2],[2.5,1],[3.5,0]],
    bass: [.5, 1.5, 2.5, 3.5],
    phrases: [[[.5,0],[1,2],[1.5,4],[2.5,5],[3,2]], [[0,4],[.5,3],[1.5,2],[2,1],[3.5,0]]]
  },
  {
    id: "bambuco", name: "La loma despierta", style: "Bambuco", bpm: 76, meter: 2, key: 64,
    chords: [0, 1, 4, 0, 5, 1, 4, 0],
    lead: "pluck", drums: ["tambora", "guache", "wood", "clap"],
    groove: [[0,0],[1/3,1],[2/3,2],[1,0],[4/3,1],[5/3,2]],
    bass: [0, 2/3, 4/3],
    phrases: [[[0,0],[1/3,1],[2/3,2],[1,4],[5/3,2]], [[0,3],[2/3,1],[1,2],[4/3,1],[5/3,0]]]
  }
];

export const SONGS = songs.map(song => ({ ...song, signature: song.meter === 2 ? "6/8" : "4/4" }));

const pitch = (song, degree) => song.key + (song.scale || tones)[degree % 7] + 12 * Math.floor(degree / 7);

export function arrange(song, part, firstBar = 0, bars = 8) {
  const backing = [];
  const targets = [];
  for (let index = 0; index < bars; index++) {
    const bar = firstBar + index;
    const start = index * song.meter;
    const root = song.chords[bar % song.chords.length];
    const ending = bar % 8 === 7;
    const groove = (bar % 2 && song.alternateGroove) || song.groove;
    const phrase = song.phrases[bar % song.phrases.length];
    const add = (track, beat, lane, voice, midi, options = {}) => {
      const note = { beat: start + beat, lane, voice, midi, ...options };
      (track === part ? targets : backing).push(note);
    };

    groove.forEach(([beat, lane], i) => {
      add("percussion", beat, lane, song.drums[lane], 60, { accent: i === 0 });
      if (bar % 4 === 3 && i === 0) add("percussion", beat, 3, song.drums[3], 60);
    });

    song.bass.forEach((beat, i) => {
      const lane = i % 2 ? 2 : 0;
      add("bass", beat, lane, "bass", pitch(song, root + (lane ? 4 : 0)) - 24, {
        hold: ending && i === song.bass.length - 1 ? (song.meter - beat) * .65 : 0,
        accent: i === 0
      });
    });

    const melody = ending ? [[0, 4], [song.meter / 2, 0]] : phrase;
    melody.forEach(([beat, degree], i) => {
      add("melody", beat, [0, 1, 2, 2, 3, 3][degree], song.lead, pitch(song, root + degree), {
        hold: ending && i === 1 ? song.meter / 2 * .75 : 0,
        accent: i === 0
      });
    });

    const chordBeats = song.id === "funk" ? [.5, 1.75, 3.25] : song.meter === 2 ? [0, 1] : [0, 2.5];
    chordBeats.forEach(beat => [0, 2, 4].forEach(interval => {
      add("harmony", beat, 0, "keys", pitch(song, root + interval) - 12, { gain: .23 });
    }));
  }
  return { backing, targets };
}
