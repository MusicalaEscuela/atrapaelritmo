import CONFIG from "../config.js";

export function normalizeLevel(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

export function levelSettings(difficultyKey, value = 1) {
  const level = normalizeLevel(value);
  const key = Object.hasOwn(CONFIG.difficulties, difficultyKey) ? difficultyKey : "normal";
  const base = CONFIG.difficulties[key];
  const progress = level - 1;
  return {
    ...base, level,
    bpm: base.bpm + Math.min(36, progress * 3),
    bars: base.bars + Math.min(4, Math.floor(progress / 3)) * 2,
    fallDuration: Math.max(1.05, base.fallDuration - Math.min(0.6, progress * 0.045)),
    rhythmKey: key === "easy" ? (level >= 9 ? "hard" : level >= 5 ? "normal" : "easy")
      : key === "normal" && level >= 5 ? "hard" : key,
    variation: progress
  };
}

export function passedLevel(results) {
  return results.finishReason === "complete" && results.totalNotes > 0 && results.resolved === results.totalNotes;
}
