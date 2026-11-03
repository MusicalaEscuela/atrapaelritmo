import CONFIG from "../config.js";

let sessionCalibrationOffset;
let sessionBest = 0;

export function getBestScore() {
  try {
    const stored = Number(localStorage.getItem(CONFIG.storageKeys.best) || 0);
    return Math.max(sessionBest, Number.isFinite(stored) && stored > 0 ? stored : 0);
  } catch { return sessionBest; }
}

export function saveBestScore(score) {
  const best = getBestScore();
  if (score > best) {
    sessionBest = score;
    try { localStorage.setItem(CONFIG.storageKeys.best, String(score)); } catch { /* Keep the session record. */ }
    return score;
  }
  return best;
}

export function getCalibrationOffset() {
  if (sessionCalibrationOffset !== undefined) return sessionCalibrationOffset;
  try {
    const value = Number(localStorage.getItem(CONFIG.storageKeys.calibration) || 0);
    return Number.isFinite(value) ? Math.max(-220, Math.min(220, value)) : 0;
  } catch { return 0; }
}

export function saveCalibrationOffset(offsetMs) {
  sessionCalibrationOffset = Number.isFinite(offsetMs) ? Math.max(-220, Math.min(220, offsetMs)) : 0;
  try { localStorage.setItem(CONFIG.storageKeys.calibration, String(sessionCalibrationOffset)); } catch { /* Session can still run without storage. */ }
}

const PROGRESS_KEY = "atrapa_el_ritmo_levels_v1";
let sessionProgress = {};
function readProgress() {
  try {
    const value = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const merged = { ...value };
      for (const [key, level] of Object.entries(sessionProgress)) {
        const stored = Number.isSafeInteger(value[key]) && value[key] > 0 ? value[key] : 1;
        merged[key] = Math.max(stored, level);
      }
      return merged;
    }
  } catch { /* Keep playing when storage is unavailable. */ }
  return { ...sessionProgress };
}

export function getUnlockedLevel(difficulty = "normal") {
  const value = readProgress()[difficulty];
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

export function unlockNextLevel(difficulty, completedLevel) {
  if (!Object.hasOwn(CONFIG.difficulties, difficulty)) return 1;
  const unlocked = getUnlockedLevel(difficulty);
  if (!Number.isSafeInteger(completedLevel) || completedLevel < 1 || completedLevel > unlocked) return unlocked;
  const progress = readProgress();
  progress[difficulty] = Math.max(unlocked, completedLevel + 1);
  sessionProgress = progress;
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch { /* Retain progress during this session. */ }
  return progress[difficulty];
}
