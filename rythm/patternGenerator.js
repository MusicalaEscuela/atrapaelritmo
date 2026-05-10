import CONFIG from "../config.js";

const TEMPLATES = {
  easy: {
    intro: [[0, 4], [0, 2, 4]],
    variation: [[0, 2, 4, 6], [0, 4, 6]],
    build: [[0, 2, 6], [0, 2, 4]],
    challenge: [[0, 2, 4, 6], [0, 2, 4]],
    resolution: [[0, 4], [0, 2, 4]]
  },
  normal: {
    intro: [[0, 2, 4, 6], [0, 2, 4, 6, 7]],
    variation: [[0, 2, 3, 4, 6], [0, 1, 2, 4, 6]],
    build: [[0, 2, 4, 5, 6], [0, 2, 3, 4, 6]],
    challenge: [[0, 1, 2, 4, 6], [0, 2, 4, 6, 7]],
    resolution: [[0, 2, 4, 6], [0, 2, 4]]
  },
  hard: {
    intro: [[0, 2, 3, 5, 6], [0, 1, 3, 4, 6]],
    variation: [[0, 1, 3, 4, 6, 7], [0, 2, 3, 5, 6]],
    build: [[0, 1, 2, 4, 5, 7], [0, 3, 4, 5, 6, 7]],
    challenge: [[0, 1, 3, 4, 6, 7], [0, 1, 2, 4, 5, 7]],
    resolution: [[0, 2, 3, 5, 6], [0, 2, 4, 6]]
  }
};

const MOTIFS = {
  climb: [0, 1, 2, 3],
  fall: [3, 2, 1, 0],
  callResponse: [0, 2, 1, 3],
  centerSides: [1, 2, 0, 3],
  stable: [1, 2, 1, 2]
};

const SECTION_ORDER = ["intro", "variation", "build", "challenge", "resolution"];

function sectionForBar(barIndex, totalBars) {
  const progress = (barIndex + 0.5) / totalBars;
  if (progress < 0.25) return "intro";
  if (progress < 0.5) return "variation";
  if (progress < 0.75) return "build";
  if (progress < 0.9) return "challenge";
  return "resolution";
}

function templateForBar(difficultyKey, section, barIndex) {
  const options = TEMPLATES[difficultyKey]?.[section] || TEMPLATES.normal[section];
  return options[barIndex % options.length];
}

function motifForBar(section, barIndex) {
  const namesBySection = {
    intro: ["stable", "centerSides"],
    variation: ["climb", "callResponse"],
    build: ["climb", "fall", "callResponse"],
    challenge: ["callResponse", "centerSides", "fall"],
    resolution: ["stable", "fall"]
  };
  const names = namesBySection[section] || ["climb"];
  return MOTIFS[names[barIndex % names.length]];
}

function chooseLane({ stepInBar, noteIndex, motif, previousLane, repeatCount }) {
  const strongPulse = stepInBar === 0 || stepInBar === 2 || stepInBar === 4 || stepInBar === 6;
  const contra = stepInBar % 2 === 1;
  let lane = motif[noteIndex % motif.length];

  if (strongPulse && noteIndex % 3 === 0) {
    lane = stepInBar < 4 ? 1 : 2;
  } else if (contra) {
    lane = lane === 1 ? 0 : lane === 2 ? 3 : lane;
  }

  if (lane === previousLane && repeatCount >= 1) {
    lane = (lane + (contra ? 3 : 1)) % CONFIG.lanes.length;
  }

  return lane;
}

export function generatePattern(difficultyKey) {
  const difficulty = CONFIG.difficulties[difficultyKey] || CONFIG.difficulties.normal;
  const beat = 60 / difficulty.bpm;
  const subdivision = beat / 2;
  const countIn = CONFIG.countInBeats * beat;
  const fallDuration = difficulty.fallDuration;
  const notes = [];
  let previousLane = -1;
  let repeatCount = 0;

  for (let bar = 0; bar < difficulty.bars; bar += 1) {
    const section = sectionForBar(bar, difficulty.bars);
    const template = templateForBar(difficultyKey, section, bar);
    const motif = motifForBar(section, bar);

    template.forEach((stepInBar, noteIndex) => {
      const globalStep = bar * 8 + stepInBar;
      const lane = chooseLane({ stepInBar, noteIndex, motif, previousLane, repeatCount });
      repeatCount = lane === previousLane ? repeatCount + 1 : 0;
      previousLane = lane;

      const targetTime = countIn + globalStep * subdivision;
      notes.push({
        id: `note-${difficultyKey}-${bar}-${stepInBar}-${lane}`,
        lane,
        spawnTime: targetTime - fallDuration,
        targetTime,
        resolved: false,
        section,
        stepInBar
      });
    });
  }

  return {
    bpm: difficulty.bpm,
    label: difficulty.label,
    maxFails: difficulty.maxFails,
    fallDuration,
    countIn,
    beat,
    sections: SECTION_ORDER,
    totalBeats: difficulty.bars * 4,
    notes
  };
}
