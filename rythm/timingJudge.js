import CONFIG from "../config.js";

export function judgeTiming(deltaMs) {
  const abs = Math.abs(deltaMs);
  if (abs <= CONFIG.judgeWindowsMs.perfect) return { type: "perfect", label: "Perfecto", deltaMs };
  if (abs <= CONFIG.judgeWindowsMs.good) return { type: "good", label: "Bien", deltaMs };
  if (abs <= CONFIG.judgeWindowsMs.bad) {
    return { type: "bad", label: deltaMs < 0 ? "Temprano" : "Tarde", deltaMs };
  }
  return { type: "miss", label: "Fallo", deltaMs };
}

export function isMissed(note, audioTime) {
  return audioTime - note.targetTime > CONFIG.judgeWindowsMs.bad / 1000;
}
