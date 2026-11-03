import CONFIG from "../config.js";

export function normalizeLevel(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

export function levelSettings(difficultyKey, value = 1) {
  const level = normalizeLevel(value);
  const key = Object.hasOwn(CONFIG.difficulties, difficultyKey) ? difficultyKey : "normal";
  const base = CONFIG.difficulties[key];
  const progress = level - 1;
  const limits = {
    easy: { maxBpm: 132, minFall: 0.95, startNotes: 3, maxNotes: 10 },
    normal: { maxBpm: 152, minFall: 0.85, startNotes: 5, maxNotes: 11 },
    hard: { maxBpm: 168, minFall: 0.75, startNotes: 6, maxNotes: 12 }
  }[key];
  return {
    ...base, level,
    bpm: Math.min(limits.maxBpm, base.bpm + progress * 8),
    bars: base.bars + Math.min(2, Math.floor(progress / 4)) * 2,
    fallDuration: Math.max(limits.minFall, base.fallDuration - progress * 0.14),
    notesPerBar: Math.min(limits.maxNotes, limits.startNotes + progress),
    rhythmKey: key,
    variation: progress
  };
}

export function passedLevel(results) {
  return results.finishReason === "complete" && results.totalNotes > 0 && results.resolved === results.totalNotes;
}
