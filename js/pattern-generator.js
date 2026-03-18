// pattern-generator.js
// Generador progresivo de patrones para Atrapa el Ritmo

import CONFIG from "./config.js";

const DEFAULT_KEYS = ["a", "s", "d", "f"];

/* =========================
   HELPERS
========================= */

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomInt(min, max) {
  const safeMin = Math.ceil(min);
  const safeMax = Math.floor(max);
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}

function randomItem(list = []) {
  if (!Array.isArray(list) || !list.length) return null;
  return list[randomInt(0, list.length - 1)];
}

function shuffle(list = []) {
  const clone = [...list];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

function chance(probability = 0) {
  return Math.random() < probability;
}

function normalizeDifficulty(value) {
  return CONFIG.difficulty[value] ? value : "normal";
}

function clonePattern(pattern = []) {
  return Array.isArray(pattern) ? [...pattern] : [];
}

function sumSteps(pattern = []) {
  return pattern.reduce((acc, step) => acc + (step ? 1 : 0), 0);
}

function getPatternLength(pattern = []) {
  return Array.isArray(pattern) ? pattern.length : 0;
}

function createId(prefix = "pattern") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

/* =========================
   FIGURAS BASE
   No se nombran para el jugador,
   pero internamente sí las organizamos.
========================= */

const FIGURE_LIBRARY = {
  whole: {
    id: "whole",
    label: "larga",
    steps: [1, 0, 0, 0, 0, 0, 0, 0],
    weight: 1
  },
  half: {
    id: "half",
    label: "media",
    steps: [1, 0, 0, 0],
    weight: 1
  },
  quarter: {
    id: "quarter",
    label: "corta",
    steps: [1, 0],
    weight: 1
  },
  eighthPair: {
    id: "eighthPair",
    label: "doble",
    steps: [1, 1],
    weight: 1
  }
};

const PHASE_BLUEPRINT = [
  {
    phase: 1,
    allowedFigures: ["whole"],
    mixed: false,
    minBlocks: 3,
    maxBlocks: 5,
    lanesMode: "single"
  },
  {
    phase: 2,
    allowedFigures: ["half"],
    mixed: false,
    minBlocks: 4,
    maxBlocks: 6,
    lanesMode: "single"
  },
  {
    phase: 3,
    allowedFigures: ["quarter"],
    mixed: false,
    minBlocks: 5,
    maxBlocks: 7,
    lanesMode: "single"
  },
  {
    phase: 4,
    allowedFigures: ["eighthPair"],
    mixed: false,
    minBlocks: 5,
    maxBlocks: 7,
    lanesMode: "single"
  },
  {
    phase: 5,
    allowedFigures: ["half", "quarter"],
    mixed: true,
    minBlocks: 6,
    maxBlocks: 8,
    lanesMode: "single"
  },
  {
    phase: 6,
    allowedFigures: ["quarter", "eighthPair"],
    mixed: true,
    minBlocks: 6,
    maxBlocks: 8,
    lanesMode: "single"
  },
  {
    phase: 7,
    allowedFigures: ["whole", "half", "quarter"],
    mixed: true,
    minBlocks: 7,
    maxBlocks: 9,
    lanesMode: "alternating"
  },
  {
    phase: 8,
    allowedFigures: ["half", "quarter", "eighthPair"],
    mixed: true,
    minBlocks: 8,
    maxBlocks: 10,
    lanesMode: "alternating"
  },
  {
    phase: 9,
    allowedFigures: ["whole", "half", "quarter", "eighthPair"],
    mixed: true,
    minBlocks: 8,
    maxBlocks: 12,
    lanesMode: "alternating"
  }
];

/* =========================
   CORE
========================= */

class PatternGenerator {
  constructor(options = {}) {
    this.keys = Array.isArray(options.keys) && options.keys.length
      ? [...options.keys]
      : [...DEFAULT_KEYS];

    this.seed = options.seed || null;
    this.phaseBlueprint = options.phaseBlueprint || PHASE_BLUEPRINT;
    this.figureLibrary = options.figureLibrary || FIGURE_LIBRARY;
  }

  /* =========================
     BLUEPRINT
  ========================= */

  getPhaseConfig(phase = 1) {
    const sorted = [...this.phaseBlueprint].sort((a, b) => a.phase - b.phase);

    return (
      sorted.find((item) => item.phase === phase) ||
      sorted[sorted.length - 1] ||
      PHASE_BLUEPRINT[0]
    );
  }

  getDifficultyConfig(difficulty = "normal") {
    return CONFIG.difficulty[normalizeDifficulty(difficulty)];
  }

  getFigure(id) {
    return this.figureLibrary[id] || null;
  }

  getAllowedFigures(phase = 1) {
    const config = this.getPhaseConfig(phase);
    return (config.allowedFigures || [])
      .map((id) => this.getFigure(id))
      .filter(Boolean);
  }

  /* =========================
     ELECCIÓN DE FIGURAS
  ========================= */

  pickFigureForPhase(phase = 1, options = {}) {
    const config = this.getPhaseConfig(phase);
    const available = this.getAllowedFigures(phase);

    if (!available.length) {
      return this.getFigure("quarter");
    }

    if (!config.mixed) {
      return available[0];
    }

    const previousFigureId = options.previousFigureId || null;
    const complexityChance =
      CONFIG.rhythm.complexityChance?.[normalizeDifficulty(options.difficulty)] ?? 0.5;

    let pool = [...available];

    if (previousFigureId && pool.length > 1 && chance(0.45)) {
      pool = pool.filter((figure) => figure.id !== previousFigureId);
      if (!pool.length) pool = [...available];
    }

    if (chance(complexityChance)) {
      const weightedPool = pool.flatMap((figure) =>
        Array.from({ length: Math.max(1, figure.weight || 1) }, () => figure)
      );
      return randomItem(weightedPool);
    }

    return randomItem(pool);
  }

  /* =========================
     CARRILES
  ========================= */

  buildLaneSequence(count = 4, mode = "single") {
    if (mode === "single") {
      const singleKey = randomItem(this.keys) || "a";
      return Array.from({ length: count }, () => singleKey);
    }

    if (mode === "alternating") {
      const shuffled = shuffle(this.keys).slice(0, Math.min(4, this.keys.length));
      const base = shuffled.length ? shuffled : ["a", "s", "d", "f"];
      const sequence = [];

      for (let i = 0; i < count; i += 1) {
        sequence.push(base[i % base.length]);
      }

      return sequence;
    }

    if (mode === "random") {
      return Array.from({ length: count }, () => randomItem(this.keys) || "a");
    }

    return Array.from({ length: count }, () => "a");
  }

  /* =========================
     BLOQUES
========================= */

  createBlock({
    phase = 1,
    difficulty = "normal",
    laneKey = "a",
    figureId = null,
    previousFigureId = null,
    index = 0
  } = {}) {
    const figure =
      this.getFigure(figureId) ||
      this.pickFigureForPhase(phase, { difficulty, previousFigureId }) ||
      this.getFigure("quarter");

    const steps = clonePattern(figure.steps);

    return {
      id: createId("block"),
      index,
      phase,
      laneKey,
      figureId: figure.id,
      figureLabel: figure.label,
      steps,
      stepsLength: getPatternLength(steps),
      hitsCount: sumSteps(steps)
    };
  }

  buildBlocksForPhase({
    phase = 1,
    difficulty = "normal"
  } = {}) {
    const phaseConfig = this.getPhaseConfig(phase);
    const difficultyConfig = this.getDifficultyConfig(difficulty);

    const baseMin = phaseConfig.minBlocks ?? 4;
    const baseMax = phaseConfig.maxBlocks ?? 6;

    const extra = Math.max(0, Math.round((difficultyConfig.patternLength - 4) / 2));
    const totalBlocks = randomInt(baseMin + extra, baseMax + extra);

    const laneSequence = this.buildLaneSequence(totalBlocks, phaseConfig.lanesMode);
    const blocks = [];

    let previousFigureId = null;

    for (let i = 0; i < totalBlocks; i += 1) {
      const block = this.createBlock({
        phase,
        difficulty,
        laneKey: laneSequence[i],
        previousFigureId,
        index: i
      });

      previousFigureId = block.figureId;
      blocks.push(block);
    }

    return blocks;
  }

  /* =========================
     SECUENCIA DE FASE
========================= */

  buildPhaseSequence({
    phase = 1,
    difficulty = "normal"
  } = {}) {
    const blocks = this.buildBlocksForPhase({ phase, difficulty });

    const flatSteps = [];
    const noteEvents = [];

    let globalStepIndex = 0;

    blocks.forEach((block, blockIndex) => {
      block.steps.forEach((stepValue, localStepIndex) => {
        const step = {
          id: `${block.id}-step-${localStepIndex}`,
          phase,
          blockId: block.id,
          blockIndex,
          stepIndex: localStepIndex,
          globalStepIndex,
          laneKey: block.laneKey,
          value: stepValue,
          figureId: block.figureId
        };

        flatSteps.push(step);

        if (stepValue === 1) {
          noteEvents.push({
            id: `${block.id}-note-${localStepIndex}`,
            phase,
            blockId: block.id,
            blockIndex,
            laneKey: block.laneKey,
            figureId: block.figureId,
            stepIndex: localStepIndex,
            globalStepIndex
          });
        }

        globalStepIndex += 1;
      });
    });

    return {
      id: createId("phase-sequence"),
      phase,
      difficulty: normalizeDifficulty(difficulty),
      blocks,
      flatSteps,
      noteEvents,
      totalBlocks: blocks.length,
      totalSteps: flatSteps.length,
      totalHits: noteEvents.length
    };
  }

  /* =========================
     PARTIDA COMPLETA
========================= */

  buildRunPlan({
    startPhase = 1,
    phaseCount = 3,
    difficulty = "normal"
  } = {}) {
    const safeStartPhase = Math.max(1, Number(startPhase) || 1);
    const safePhaseCount = Math.max(1, Number(phaseCount) || 1);
    const safeDifficulty = normalizeDifficulty(difficulty);

    const phases = [];
    let totalSteps = 0;
    let totalHits = 0;

    for (let i = 0; i < safePhaseCount; i += 1) {
      const phaseNumber = safeStartPhase + i;
      const sequence = this.buildPhaseSequence({
        phase: phaseNumber,
        difficulty: safeDifficulty
      });

      phases.push(sequence);
      totalSteps += sequence.totalSteps;
      totalHits += sequence.totalHits;
    }

    return {
      id: createId("run"),
      difficulty: safeDifficulty,
      startPhase: safeStartPhase,
      phaseCount: safePhaseCount,
      phases,
      totalSteps,
      totalHits
    };
  }

  /* =========================
     COMPATIBILIDAD SIMPLE
     Para usar fácil desde main o state
========================= */

  getPatternQueue({
    phase = 1,
    difficulty = "normal"
  } = {}) {
    const sequence = this.buildPhaseSequence({ phase, difficulty });

    return sequence.blocks.map((block) => ({
      id: block.id,
      key: block.laneKey,
      steps: clonePattern(block.steps),
      figureId: block.figureId,
      phase: block.phase,
      hitsCount: block.hitsCount
    }));
  }

  getFlatBinaryPattern({
    phase = 1,
    difficulty = "normal"
  } = {}) {
    const sequence = this.buildPhaseSequence({ phase, difficulty });
    return sequence.flatSteps.map((step) => step.value);
  }

  /* =========================
     DEBUG / INSPECCIÓN
========================= */

  describePhase({
    phase = 1,
    difficulty = "normal"
  } = {}) {
    const sequence = this.buildPhaseSequence({ phase, difficulty });

    return {
      phase: sequence.phase,
      difficulty: sequence.difficulty,
      totalBlocks: sequence.totalBlocks,
      totalSteps: sequence.totalSteps,
      totalHits: sequence.totalHits,
      figures: sequence.blocks.map((block) => ({
        laneKey: block.laneKey,
        figureId: block.figureId,
        steps: clonePattern(block.steps)
      }))
    };
  }
}

const patternGenerator = new PatternGenerator();

export {
  PatternGenerator,
  FIGURE_LIBRARY,
  PHASE_BLUEPRINT
};

export default patternGenerator;