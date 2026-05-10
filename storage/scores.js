import CONFIG from "../config.js";

export function getBestScore() {
  return Number(localStorage.getItem(CONFIG.storageKeys.best) || 0);
}

export function saveBestScore(score) {
  const best = getBestScore();
  if (score > best) {
    localStorage.setItem(CONFIG.storageKeys.best, String(score));
    return score;
  }
  return best;
}

export function getCalibrationOffset() {
  return Number(localStorage.getItem(CONFIG.storageKeys.calibration) || 0);
}

export function saveCalibrationOffset(offsetMs) {
  localStorage.setItem(CONFIG.storageKeys.calibration, String(offsetMs));
}
