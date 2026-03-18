// game-state.js
// Estado central de Atrapa el Ritmo

import CONFIG from "./config.js";

const DIFFICULTY_FALLBACK = "normal";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeDifficulty(value) {
  if (!value) return DIFFICULTY_FALLBACK;
  return CONFIG.difficulty[value] ? value : DIFFICULTY_FALLBACK;
}

function createSessionStats() {
  return {
    totalHits: 0,
    perfectHits: 0,
    goodHits: 0,
    badHits: 0,
    misses: 0,
    totalNotes: 0,
    accuracy: 0,
    bestCombo: 0
  };
}

function createRunMeta() {
  return {
    startedAt: null,
    endedAt: null,
    elapsedMs: 0,
    completed: false,
    failed: false
  };
}

function createPatternState() {
  return {
    phase: 1,
    blockIndex: 0,
    patternIndex: 0,
    currentPattern: [],
    queuedPatterns: [],
    currentStepIndex: 0,
    totalStepsPlayed: 0,
    totalStepsTarget: 0
  };
}

function createUnlockState() {
  return {
    unlocked: false,
    keyword: "???"
  };
}

function createDefaultState(overrides = {}) {
  const difficulty = normalizeDifficulty(overrides.difficulty);

  return {
    isReady: true,
    isRunning: false,
    isPaused: false,
    isFinished: false,

    difficulty,
    bpm:
      CONFIG.audio.defaultBPM +
      (CONFIG.audio.bpmStep[difficulty] ?? 0),

    score: 0,
    combo: 0,
    bestCombo: 0,
    misses: 0,
    progress: 0,

    lastHitType: null,
    lastHitLabel: "Esperando...",
    runStateLabel: "En espera",

    pattern: createPatternState(),
    session: createSessionStats(),
    run: createRunMeta(),
    unlock: createUnlockState(),

    activeNotes: [],
    pressedKeys: new Set(),

    ...overrides
  };
}

class GameState {
  constructor(initialState = {}) {
    this.state = createDefaultState(initialState);
    this.listeners = new Set();
  }

  /* =========================
     SUSCRIPCIONES
  ========================= */

  subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    this.listeners.add(listener);

    listener(this.getState());

    return () => {
      this.listeners.delete(listener);
    };
  }

  emit() {
    const snapshot = this.getState();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  /* =========================
     GETTERS
  ========================= */

  getState() {
    return {
      ...this.state,
      pattern: {
        ...this.state.pattern,
        currentPattern: [...this.state.pattern.currentPattern],
        queuedPatterns: [...this.state.pattern.queuedPatterns]
      },
      session: { ...this.state.session },
      run: { ...this.state.run },
      unlock: { ...this.state.unlock },
      activeNotes: [...this.state.activeNotes],
      pressedKeys: new Set(this.state.pressedKeys)
    };
  }

  getDifficultyConfig() {
    return CONFIG.difficulty[this.state.difficulty] ?? CONFIG.difficulty[DIFFICULTY_FALLBACK];
  }

  getTimingConfig() {
    return CONFIG.timing;
  }

  getScoringConfig() {
    return CONFIG.scoring;
  }

  isGameOver() {
    return this.state.isFinished || this.state.misses >= CONFIG.gameplay.maxMisses;
  }

  /* =========================
     RESET / INICIO
  ========================= */

  reset(overrides = {}) {
    const difficulty = normalizeDifficulty(
      overrides.difficulty ?? this.state.difficulty
    );

    this.state = createDefaultState({
      difficulty,
      unlock: { ...this.state.unlock, unlocked: false, keyword: "???" },
      ...overrides
    });

    this.emit();
  }

  startRun() {
    const difficulty = this.state.difficulty;

    this.state.isReady = false;
    this.state.isRunning = true;
    this.state.isPaused = false;
    this.state.isFinished = false;

    this.state.bpm =
      CONFIG.audio.defaultBPM +
      (CONFIG.audio.bpmStep[difficulty] ?? 0);

    this.state.run.startedAt = Date.now();
    this.state.run.endedAt = null;
    this.state.run.elapsedMs = 0;
    this.state.run.completed = false;
    this.state.run.failed = false;

    this.state.runStateLabel = "Jugando";
    this.state.lastHitLabel = "En curso...";
    this.emit();
  }

  pauseRun() {
    if (!this.state.isRunning || this.state.isFinished) return;
    this.state.isPaused = true;
    this.state.isRunning = false;
    this.state.runStateLabel = "En pausa";
    this.emit();
  }

  resumeRun() {
    if (this.state.isFinished) return;
    this.state.isPaused = false;
    this.state.isRunning = true;
    this.state.runStateLabel = "Jugando";
    this.emit();
  }

  finishRun({ completed = false, failed = false } = {}) {
    this.state.isRunning = false;
    this.state.isPaused = false;
    this.state.isFinished = true;

    this.state.run.endedAt = Date.now();
    this.state.run.elapsedMs = this.state.run.startedAt
      ? this.state.run.endedAt - this.state.run.startedAt
      : 0;
    this.state.run.completed = completed;
    this.state.run.failed = failed;

    if (completed) {
      this.state.runStateLabel = "Completado";
    } else if (failed) {
      this.state.runStateLabel = "Fallido";
    } else {
      this.state.runStateLabel = "Finalizado";
    }

    this.emit();
  }

  /* =========================
     DIFICULTAD / BPM
  ========================= */

  setDifficulty(value) {
    const difficulty = normalizeDifficulty(value);
    this.state.difficulty = difficulty;
    this.state.bpm =
      CONFIG.audio.defaultBPM +
      (CONFIG.audio.bpmStep[difficulty] ?? 0);
    this.emit();
  }

  setBPM(value) {
    this.state.bpm = clamp(
      Number(value) || CONFIG.audio.defaultBPM,
      CONFIG.audio.minBPM,
      CONFIG.audio.maxBPM
    );
    this.emit();
  }

  /* =========================
     SCORE / COMBO / FALLOS
  ========================= */

  registerHit(type = "good") {
    const scoring = CONFIG.scoring;
    const feedbackMessages = CONFIG.feedback.messages;

    this.state.session.totalHits += 1;
    this.state.session.totalNotes += 1;

    if (type === "perfect") {
      this.state.session.perfectHits += 1;
      this.state.score += scoring.perfect;
      this.state.combo += 1;
    } else if (type === "good") {
      this.state.session.goodHits += 1;
      this.state.score += scoring.good;
      this.state.combo += 1;
    } else if (type === "bad") {
      this.state.session.badHits += 1;
      this.state.score += scoring.bad;
      this.state.combo = 0;
    } else {
      this.registerMiss();
      return;
    }

    const comboTier = Math.min(
      Math.floor(this.state.combo / CONFIG.gameplay.comboMultiplierStep),
      CONFIG.gameplay.maxComboMultiplier
    );

    if (this.state.combo > 0 && comboTier > 0) {
      this.state.score += comboTier * scoring.comboBonus;
    }

    this.state.bestCombo = Math.max(this.state.bestCombo, this.state.combo);
    this.state.session.bestCombo = Math.max(
      this.state.session.bestCombo,
      this.state.combo
    );

    this.state.lastHitType = type;
    this.state.lastHitLabel = feedbackMessages[type] ?? "Bien";

    this.recalculateAccuracy();
    this.recalculateProgress();
    this.emit();
  }

  registerMiss() {
    this.state.session.misses += 1;
    this.state.session.totalNotes += 1;
    this.state.misses += 1;
    this.state.combo = 0;
    this.state.score += CONFIG.scoring.miss;
    this.state.lastHitType = "miss";
    this.state.lastHitLabel = CONFIG.feedback.messages.miss ?? "Fallo";

    this.recalculateAccuracy();
    this.recalculateProgress();

    if (this.state.misses >= CONFIG.gameplay.maxMisses) {
      this.finishRun({ failed: true });
      return;
    }

    this.emit();
  }

  setLastHitLabel(label) {
    this.state.lastHitLabel = label || "Esperando...";
    this.emit();
  }

  /* =========================
     PROGRESO
  ========================= */

  setProgress(value) {
    this.state.progress = clamp(Number(value) || 0, 0, 100);
    this.emit();
  }

  recalculateProgress() {
    const target =
      this.state.pattern.totalStepsTarget ||
      CONFIG.gameplay.targetScore ||
      100;

    let progressBase = 0;

    if (this.state.pattern.totalStepsTarget > 0) {
      progressBase =
        (this.state.pattern.totalStepsPlayed / this.state.pattern.totalStepsTarget) * 100;
    } else {
      progressBase = (this.state.score / target) * 100;
    }

    this.state.progress = clamp(progressBase, 0, 100);

    if (this.state.progress >= 100 && !this.state.isFinished) {
      this.finishRun({ completed: true });
    }
  }

  /* =========================
     PRECISIÓN
  ========================= */

  recalculateAccuracy() {
    const total = this.state.session.totalNotes;

    if (!total) {
      this.state.session.accuracy = 0;
      return;
    }

    const weightedHits =
      this.state.session.perfectHits * 1 +
      this.state.session.goodHits * 0.8 +
      this.state.session.badHits * 0.45;

    this.state.session.accuracy = Math.round((weightedHits / total) * 100);
  }

  /* =========================
     PATRONES
  ========================= */

  setCurrentPattern(pattern = []) {
    this.state.pattern.currentPattern = Array.isArray(pattern) ? [...pattern] : [];
    this.state.pattern.currentStepIndex = 0;
    this.emit();
  }

  setQueuedPatterns(patterns = []) {
    this.state.pattern.queuedPatterns = Array.isArray(patterns) ? [...patterns] : [];
    this.emit();
  }

  setPatternMeta({
    phase,
    blockIndex,
    patternIndex,
    totalStepsTarget
  } = {}) {
    if (typeof phase === "number") this.state.pattern.phase = phase;
    if (typeof blockIndex === "number") this.state.pattern.blockIndex = blockIndex;
    if (typeof patternIndex === "number") this.state.pattern.patternIndex = patternIndex;
    if (typeof totalStepsTarget === "number") {
      this.state.pattern.totalStepsTarget = Math.max(0, totalStepsTarget);
    }

    this.emit();
  }

  advancePatternStep(amount = 1) {
    const increment = Math.max(0, Number(amount) || 0);

    this.state.pattern.currentStepIndex += increment;
    this.state.pattern.totalStepsPlayed += increment;

    this.recalculateProgress();
    this.emit();
  }

  nextPattern() {
    this.state.pattern.patternIndex += 1;
    this.state.pattern.currentStepIndex = 0;
    this.emit();
  }

  nextPhase() {
    this.state.pattern.phase += 1;
    this.state.pattern.blockIndex = 0;
    this.state.pattern.patternIndex = 0;
    this.emit();
  }

  /* =========================
     NOTAS ACTIVAS
  ========================= */

  setActiveNotes(notes = []) {
    this.state.activeNotes = Array.isArray(notes) ? [...notes] : [];
    this.emit();
  }

  addActiveNote(note) {
    if (!note) return;
    this.state.activeNotes.push(note);
    this.emit();
  }

  removeActiveNote(noteId) {
    this.state.activeNotes = this.state.activeNotes.filter(
      (note) => note?.id !== noteId
    );
    this.emit();
  }

  clearActiveNotes() {
    this.state.activeNotes = [];
    this.emit();
  }

  /* =========================
     INPUTS ACTIVOS
  ========================= */

  pressKey(key) {
    if (!key) return;
    this.state.pressedKeys.add(String(key).toLowerCase());
    this.emit();
  }

  releaseKey(key) {
    if (!key) return;
    this.state.pressedKeys.delete(String(key).toLowerCase());
    this.emit();
  }

  clearPressedKeys() {
    this.state.pressedKeys.clear();
    this.emit();
  }

  /* =========================
     DESBLOQUEOS
  ========================= */

  unlockKeyword(keyword = "RITMO") {
    this.state.unlock.unlocked = true;
    this.state.unlock.keyword = String(keyword || "RITMO").toUpperCase();
    this.emit();
  }

  clearUnlock() {
    this.state.unlock.unlocked = false;
    this.state.unlock.keyword = "???";
    this.emit();
  }

  /* =========================
     UTILIDAD
  ========================= */

  getAccuracyLabel() {
    return `${this.state.session.accuracy}%`;
  }

  getProgressLabel() {
    return `${Math.round(this.state.progress)}%`;
  }

  getLiveComboLabel() {
    return `Combo x${this.state.combo}`;
  }
}

const gameState = new GameState();

export { GameState, createDefaultState };
export default gameState;