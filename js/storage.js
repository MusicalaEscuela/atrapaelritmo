// storage.js
// Persistencia local para Atrapa el Ritmo
// Maneja: progreso acumulado, high scores, historial de sesiones,
//         desbloqueos narrativos y configuración del jugador.

const STORAGE_PREFIX  = "musicala_atrapa_ritmo";
const STORAGE_VERSION = 2;
const MAX_SCORES      = 10;
const MAX_SESSIONS    = 20;

/* =========================
   HELPERS INTERNOS
========================= */

function buildKey(key) {
  return `${STORAGE_PREFIX}_${key}`;
}

function safeParse(json, fallback = null) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function nowISO() {
  return new Date().toISOString();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/* =========================
   MIGRACIONES
   Cuando STORAGE_VERSION sube, aquí se transforma
   el payload viejo en lugar de descartarlo.
========================= */

const MIGRATIONS = {
  // v1 → v2: high_scores pasó de array plano a array de objetos {score, difficulty, date}
  2: (key, data) => {
    if (key !== "high_scores") return data;
    if (!Array.isArray(data))   return [];

    // Si ya son objetos, dejarlos como están
    if (data.length && typeof data[0] === "object") return data;

    // Si son números crudos (formato v1), envolverlos
    return data.map((score) => ({
      score      : Math.max(0, Math.round(Number(score) || 0)),
      difficulty : "normal",
      date       : nowISO()
    }));
  }
};

function migratePayload(key, payload) {
  const storedVersion = payload.__version ?? 1;

  if (storedVersion === STORAGE_VERSION) {
    return payload.data ?? null;
  }

  // Aplicar migraciones en cadena desde storedVersion + 1 hasta STORAGE_VERSION
  let data = payload.data ?? null;

  for (let v = storedVersion + 1; v <= STORAGE_VERSION; v++) {
    if (typeof MIGRATIONS[v] === "function") {
      data = MIGRATIONS[v](key, data);
    }
  }

  return data;
}

/* =========================
   BASE STORAGE
========================= */

function getItem(key, fallback = null) {
  try {
    const raw = localStorage.getItem(buildKey(key));
    if (raw === null) return fallback;

    const payload = safeParse(raw, null);
    if (!payload || typeof payload !== "object") return fallback;

    const data = migratePayload(key, payload);
    return data ?? fallback;
  } catch {
    return fallback;
  }
}

function setItem(key, value) {
  try {
    const payload    = { __version: STORAGE_VERSION, updatedAt: nowISO(), data: value };
    const serialized = safeStringify(payload);
    if (!serialized) return false;

    localStorage.setItem(buildKey(key), serialized);
    return true;
  } catch {
    return false;
  }
}

function removeItem(key) {
  try {
    localStorage.removeItem(buildKey(key));
    return true;
  } catch {
    return false;
  }
}

/* =========================
   HIGH SCORES
   Formato interno: [{ score, difficulty, date }, ...]
========================= */

function getHighScores() {
  return getItem("high_scores", []) || [];
}

/**
 * Guarda un nuevo score.
 * @param {number} score
 * @param {string} difficulty  "easy" | "normal" | "hard"
 * @returns {{ score, difficulty, date }[]}  lista actualizada
 */
function saveScore(score = 0, difficulty = "normal") {
  const safeScore = Math.max(0, Math.round(Number(score) || 0));

  const entry = {
    score      : safeScore,
    difficulty : difficulty || "normal",
    date       : nowISO()
  };

  const updated = [...getHighScores(), entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SCORES);

  setItem("high_scores", updated);
  return updated;
}

/** Solo los valores numéricos, para mostrar en ranking simple. */
function getTopScores(limit = 3) {
  return getHighScores()
    .slice(0, limit)
    .map((entry) => entry.score);
}

/** El mayor score registrado, número plano. */
function getBestScore() {
  const list = getHighScores();
  return list.length ? list[0].score : 0;
}

/* =========================
   HISTORIAL DE SESIONES
   Guarda un resumen de cada partida terminada.
   Útil para mostrar tendencias o debug.
========================= */

function getSessions() {
  return getItem("sessions", []) || [];
}

/**
 * @param {{
 *   score:      number,
 *   difficulty: string,
 *   accuracy:   number,
 *   bestCombo:  number,
 *   completed:  boolean,
 *   elapsedMs:  number
 * }} sessionData
 */
function saveSession(sessionData = {}) {
  const entry = {
    score      : Math.max(0, Math.round(sessionData.score   || 0)),
    difficulty : sessionData.difficulty || "normal",
    accuracy   : clamp(Number(sessionData.accuracy)  || 0, 0, 100),
    bestCombo  : Math.max(0, Number(sessionData.bestCombo)  || 0),
    completed  : Boolean(sessionData.completed),
    elapsedMs  : Math.max(0, Number(sessionData.elapsedMs)  || 0),
    date       : nowISO()
  };

  const updated = [entry, ...getSessions()].slice(0, MAX_SESSIONS);
  setItem("sessions", updated);
  return updated;
}

function clearSessions() {
  setItem("sessions", []);
}

/* =========================
   PROGRESO ACUMULADO
   Totales agregados de toda la historia del jugador.
========================= */

const DEFAULT_PROGRESS = {
  totalScore     : 0,
  totalHits      : 0,
  totalMisses    : 0,
  bestScore      : 0,
  bestCombo      : 0,
  sessionsPlayed : 0,
  lastPlayedAt   : null
};

function getProgress() {
  return { ...DEFAULT_PROGRESS, ...(getItem("progress", {}) || {}) };
}

/**
 * Actualiza el progreso acumulado al final de cada partida.
 * Los campos con prefijo "add" son deltas, el resto son overwrites.
 *
 * @param {{
 *   addScore?:        number,
 *   addHits?:         number,
 *   addMisses?:       number,
 *   bestScore?:       number,
 *   bestCombo?:       number,
 *   incrementSessions?: boolean
 * }} delta
 */
function saveProgress(delta = {}) {
  const current = getProgress();

  const next = {
    ...current,
    totalScore     : Math.max(0, current.totalScore  + (Number(delta.addScore)   || 0)),
    totalHits      : Math.max(0, current.totalHits   + (Number(delta.addHits)    || 0)),
    totalMisses    : Math.max(0, current.totalMisses + (Number(delta.addMisses)  || 0)),
    bestScore      : Math.max(current.bestScore,  Number(delta.bestScore)  || 0),
    bestCombo      : Math.max(current.bestCombo,  Number(delta.bestCombo)  || 0),
    sessionsPlayed : current.sessionsPlayed + (delta.incrementSessions ? 1 : 0),
    lastPlayedAt   : nowISO()
  };

  setItem("progress", next);
  return next;
}

function resetProgress() {
  setItem("progress", { ...DEFAULT_PROGRESS });
}

/* =========================
   DESBLOQUEOS NARRATIVOS
========================= */

const DEFAULT_UNLOCKS = {
  keywords       : [],
  phasesUnlocked : 1
};

function getUnlocks() {
  return { ...DEFAULT_UNLOCKS, ...(getItem("unlocks", {}) || {}) };
}

/** Agrega una palabra clave si no existe ya. */
function unlockKeyword(keyword) {
  if (!keyword) return getUnlocks();

  const current = getUnlocks();
  if (current.keywords.includes(keyword)) return current;

  const next = { ...current, keywords: [...current.keywords, String(keyword).toUpperCase()] };
  setItem("unlocks", next);
  return next;
}

function unlockNextPhase() {
  const current = getUnlocks();
  const next    = { ...current, phasesUnlocked: current.phasesUnlocked + 1 };
  setItem("unlocks", next);
  return next;
}

function hasKeyword(keyword) {
  return getUnlocks().keywords.includes(String(keyword || "").toUpperCase());
}

/* =========================
   CONFIGURACIÓN
========================= */

const DEFAULT_SETTINGS = {
  volume     : 0.9,
  difficulty : "normal",
  vibration  : true
};

function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(getItem("settings", {}) || {}) };
}

/**
 * Guarda configuración parcial. Solo los campos presentes se sobrescriben.
 */
function saveSettings(partial = {}) {
  const current = getSettings();
  const next    = {
    ...current,
    ...partial,
    volume: clamp(partial.volume ?? current.volume, 0, 1)
  };
  setItem("settings", next);
  return next;
}

/* =========================
   PERSISTENCIA COMPLETA AL TERMINAR PARTIDA
   Conveniente para llamar desde main.js en un solo lugar.
========================= */

/**
 * @param {{
 *   score:      number,
 *   difficulty: string,
 *   accuracy:   number,
 *   bestCombo:  number,
 *   totalHits:  number,
 *   totalMisses:number,
 *   completed:  boolean,
 *   elapsedMs:  number,
 *   keyword?:   string
 * }} runData
 */
function persistRunResult(runData = {}) {
  // 1. High scores (formato enriquecido)
  saveScore(runData.score, runData.difficulty);

  // 2. Historial de sesiones
  saveSession({
    score      : runData.score,
    difficulty : runData.difficulty,
    accuracy   : runData.accuracy,
    bestCombo  : runData.bestCombo,
    completed  : runData.completed,
    elapsedMs  : runData.elapsedMs
  });

  // 3. Progreso acumulado
  saveProgress({
    addScore          : runData.score,
    addHits           : runData.totalHits,
    addMisses         : runData.totalMisses,
    bestScore         : runData.score,
    bestCombo         : runData.bestCombo,
    incrementSessions : true
  });

  // 4. Desbloqueo narrativo (opcional)
  if (runData.completed && runData.keyword) {
    unlockKeyword(runData.keyword);
  }
}

/* =========================
   UTILIDADES
========================= */

function clearAllStorage() {
  Object.keys(localStorage)
    .filter((key) => key.startsWith(STORAGE_PREFIX))
    .forEach((key) => localStorage.removeItem(key));
}

/** Devuelve un snapshot de todo lo guardado (útil para debug). */
function dump() {
  return {
    highScores : getHighScores(),
    sessions   : getSessions(),
    progress   : getProgress(),
    unlocks    : getUnlocks(),
    settings   : getSettings()
  };
}

/* =========================
   EXPORT
========================= */

export default {
  // base
  getItem,
  setItem,
  removeItem,

  // high scores
  getHighScores,
  saveScore,
  getTopScores,
  getBestScore,

  // historial
  getSessions,
  saveSession,
  clearSessions,

  // progreso acumulado
  getProgress,
  saveProgress,
  resetProgress,

  // desbloqueos
  getUnlocks,
  unlockKeyword,
  unlockNextPhase,
  hasKeyword,

  // settings
  getSettings,
  saveSettings,

  // conveniencia
  persistRunResult,

  // utils
  clearAllStorage,
  dump
};