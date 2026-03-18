// main.js
// Punto de entrada de Atrapa el Ritmo

import CONFIG       from "./config.js";
import gameState    from "./game-state.js";
import AudioEngine  from "./audio-engine.js";
import rhythmEngine from "./rythm-engine.js";
import noteRenderer from "./note-renderer.js";
import inputController from "./input-controller.js";

/* =========================
   DOM
========================= */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const dom = {
  difficultyBadge      : $("#difficultyBadge"),
  statusBadge          : $("#statusBadge"),

  score                : $("#score"),
  misses               : $("#misses"),
  combo                : $("#combo"),
  bestScore            : $("#bestScore"),

  progressText         : $("#progressText"),
  progressFill         : $("#progressFill"),
  hitFeedback          : $("#hitFeedback"),

  difficultySelect     : $("#difficultySelect"),

  startBtn             : $("#startBtn"),
  restartBtn           : $("#restartBtn"),

  accuracyValue        : $("#accuracyValue"),
  bestCombo            : $("#bestCombo"),
  runState             : $("#runState"),

  rankingList          : $("#rankingList"),

  storyUnlockBox       : $("#storyUnlockBox"),
  storyKeywordPreview  : $("#storyKeywordPreview"),

  rewardModal          : $("#rewardModal"),
  rewardKeyword        : $("#rewardKeyword"),
  closeRewardBtn       : $("#closeRewardBtn"),

  message              : $("#message"),
  gameArea             : $("#gameArea"),
  liveComboChip        : $("#liveComboChip"),

  beatDots             : $$(".beat-dot"),
  lanes                : $$(".lane[data-key]"),
  touchButtons         : $$(".touch-btn[data-key]")
};

/* =========================
   INSTANCIAS
========================= */

const audioEngine = new AudioEngine();

/* =========================
   ESTADO LOCAL DE SESIÓN
========================= */

const localSession = {
  bestScores          : loadBestScores(),
  rewardShownThisRun  : false,
  startedOnce         : false,
  finishHandled       : false   // evita ejecutar completeRun dos veces
};

/* =========================
   HELPERS GENÉRICOS
========================= */

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatDifficultyLabel(difficulty) {
  return { easy: "Fácil", normal: "Normal", hard: "Difícil" }[difficulty] || "Normal";
}

function getDifficultyBPM(difficulty) {
  const step = CONFIG.audio.bpmStep[difficulty] ?? 0;
  return clamp(CONFIG.audio.defaultBPM + step, CONFIG.audio.minBPM, CONFIG.audio.maxBPM);
}

function getRewardKeyword(difficulty) {
  return { easy: "PULSO", normal: "RITMO", hard: "CLAVE" }[difficulty] || "RITMO";
}

/* =========================
   STORAGE
========================= */

function loadBestScores() {
  try {
    const raw    = localStorage.getItem("musicala_atrapa_ritmo_best_scores");
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Number.isFinite).map(Number);
  } catch {
    return [];
  }
}

function saveBestScores() {
  try {
    localStorage.setItem(
      "musicala_atrapa_ritmo_best_scores",
      JSON.stringify(localSession.bestScores.slice(0, 10))
    );
  } catch { /* storage no crítico */ }
}

function registerScore(score) {
  const safe = Math.max(0, Math.round(score || 0));
  localSession.bestScores.push(safe);
  localSession.bestScores = localSession.bestScores.sort((a, b) => b - a).slice(0, 10);
  saveBestScores();
  renderRanking();
}

function getHighestScore() {
  return localSession.bestScores.length ? Math.max(...localSession.bestScores) : 0;
}

/* =========================
   RENDER UI
========================= */

function setMessage(html, type = "") {
  if (!dom.message) return;
  dom.message.innerHTML = html;
  dom.message.classList.remove("good", "bad");
  if (type) dom.message.classList.add(type);
}

function setMessageFromHitResult(result) {
  const msgs = {
    perfect : ["¡Muy bien! Entraste <strong>justo a tiempo</strong>.", "good"],
    good    : ["Buen golpe. Mantén el <strong>pulso</strong>.", "good"],
    bad     : ["Entraste, pero no tan preciso. <strong>Respira y vuelve al centro</strong>.", "bad"],
    miss    : ["Fallaste ese golpe. <strong>No adivines</strong>, espera el momento.", "bad"],
  };
  const [html, type] = msgs[result] || [
    'Pulsa <strong>Iniciar</strong>, observa el pulso y usa <strong>A S D F</strong> o los botones táctiles.',
    ""
  ];
  setMessage(html, type);
}

function updateBadges(state) {
  if (dom.difficultyBadge) dom.difficultyBadge.textContent = `Dificultad: ${formatDifficultyLabel(state.difficulty)}`;
  if (dom.statusBadge)     dom.statusBadge.textContent     = state.runStateLabel || "En espera";
}

function updateStats(state) {
  if (dom.score)         dom.score.textContent         = Math.max(0, Math.round(state.score));
  if (dom.misses)        dom.misses.textContent        = state.misses;
  if (dom.combo)         dom.combo.textContent         = state.combo;
  if (dom.bestScore)     dom.bestScore.textContent     = getHighestScore();
  if (dom.accuracyValue) dom.accuracyValue.textContent = `${state.session.accuracy}%`;
  if (dom.bestCombo)     dom.bestCombo.textContent     = state.session.bestCombo;
  if (dom.runState)      dom.runState.textContent      = state.runStateLabel || "En espera";
  if (dom.liveComboChip) dom.liveComboChip.textContent = `Combo x${state.combo}`;
}

function updateProgress(state) {
  const pct = Math.round(clamp(state.progress, 0, 100));
  if (dom.progressText) dom.progressText.textContent = `${pct}%`;
  if (dom.progressFill) dom.progressFill.style.width = `${pct}%`;
}

function updateFeedback(state) {
  if (dom.hitFeedback) dom.hitFeedback.textContent = state.lastHitLabel || "Esperando...";
}

function updateUnlock(state) {
  if (dom.storyKeywordPreview) dom.storyKeywordPreview.textContent = state.unlock?.keyword || "???";
  if (dom.storyUnlockBox) dom.storyUnlockBox.classList.toggle("is-unlocked", Boolean(state.unlock?.unlocked));
}

function updateButtons(state) {
  if (dom.startBtn)        dom.startBtn.disabled        = state.isRunning;
  if (dom.restartBtn)      dom.restartBtn.disabled      = false;
  if (dom.difficultySelect) dom.difficultySelect.disabled = state.isRunning;
}

function renderRanking() {
  if (!dom.rankingList) return;
  const scores = [...localSession.bestScores].sort((a, b) => b - a).slice(0, 3);
  while (scores.length < 3) scores.push(0);
  dom.rankingList.innerHTML = scores
    .map((s, i) => `<li><span>${i + 1}.</span><strong>${s} pts</strong></li>`)
    .join("");
}

function applyStateToUI(state) {
  updateBadges(state);
  updateStats(state);
  updateProgress(state);
  updateFeedback(state);
  updateUnlock(state);
  updateButtons(state);
}

/* =========================
   PULSO VISUAL
========================= */

function pulseBeatDot(index) {
  dom.beatDots.forEach((dot, i) => dot.classList.toggle("is-active", i === index));
}

function clearBeatPulse() {
  dom.beatDots.forEach((dot) => dot.classList.remove("is-active"));
}

function pulseLane(key) {
  const lane = dom.lanes.find((l) => l.dataset.key === key);
  if (!lane) return;
  lane.classList.add("pulse");
  setTimeout(() => lane.classList.remove("pulse"), 140);
}

/* =========================
   REWARD MODAL
========================= */

function showReward(keyword) {
  if (dom.rewardKeyword) dom.rewardKeyword.textContent = String(keyword || "RITMO").toUpperCase();
  if (dom.rewardModal) {
    dom.rewardModal.hidden = false;
    dom.rewardModal.setAttribute("aria-hidden", "false");
  }
}

function hideReward() {
  if (!dom.rewardModal) return;
  dom.rewardModal.hidden = true;
  dom.rewardModal.setAttribute("aria-hidden", "true");
}

/* =========================
   AUDIO
========================= */

async function ensureAudioReady() {
  await audioEngine.init();
  audioEngine.setVolume(CONFIG.audio.volume);
}

/* =========================
   GAME FLOW
========================= */

async function startGame() {
  hideReward();
  localSession.rewardShownThisRun = false;
  localSession.finishHandled      = false;

  await ensureAudioReady();

  const state      = gameState.getState();
  const difficulty = state.difficulty;
  const bpm        = getDifficultyBPM(difficulty);

  // 1. Actualizar estado
  gameState.setBPM(bpm);
  gameState.startRun();

  // 2. Arrancar metrónomo (audio)
  audioEngine.start(bpm);

  // 3. Arrancar motor de ritmo (notas + timing)
  rhythmEngine.start({ bpm, difficulty, phase: 1, phaseCount: 3 });

  // 4. Conectar callbacks del motor de ritmo
  rhythmEngine.onBeat = (beatIndex) => {
    pulseBeatDot(beatIndex);
  };

  rhythmEngine.onHit = (key, result) => {
    audioEngine.playHit(result);
    pulseLane(key);
    setMessageFromHitResult(result);
  };

  rhythmEngine.onMiss = (key) => {
    audioEngine.playHit("bad");
    pulseLane(key);
    setMessageFromHitResult("miss");
  };

  rhythmEngine.onComplete = () => {
    handleRunEnd();
  };

  setMessage("La partida comenzó. <strong>Escucha el pulso</strong> y entra cuando te sientas seguro.", "good");
  localSession.startedOnce = true;
}

function restartGame() {
  // Detener todo
  audioEngine.stop();
  rhythmEngine.stop();
  clearBeatPulse();
  hideReward();

  const difficulty = dom.difficultySelect?.value || gameState.getState().difficulty;

  localSession.rewardShownThisRun = false;
  localSession.finishHandled      = false;

  gameState.reset({ difficulty });
  setMessageFromHitResult(null);
}

/**
 * Ejecutado cuando el run termina (por completar o por fallos).
 * El gameState ya fue actualizado por rhythmEngine antes de llamar aquí.
 */
function handleRunEnd() {
  if (localSession.finishHandled) return;
  localSession.finishHandled = true;

  audioEngine.stop();
  clearBeatPulse();

  const state = gameState.getState();

  registerScore(state.score);

  if (state.run.completed) {
    const keyword = getRewardKeyword(state.difficulty);
    gameState.unlockKeyword(keyword);

    // Dar un frame para que el unlock se propague al subscriber antes del modal
    requestAnimationFrame(() => {
      if (!localSession.rewardShownThisRun) {
        localSession.rewardShownThisRun = true;
        showReward(keyword);
      }
    });

    setMessage(
      `¡Completado! Desbloqueaste <strong>${keyword}</strong>. Bien hecho.`,
      "good"
    );
    return;
  }

  if (state.run.failed) {
    setMessage(
      "La sesión terminó por demasiados fallos. Reinicia y vuelve a entrar en el pulso.",
      "bad"
    );
  }
}

/* =========================
   INPUT
========================= */

function resolveInput(key) {
  const state = gameState.getState();
  if (!state.isRunning || state.isFinished) return;

  // Delegar al motor de ritmo: él evalúa timing y actualiza gameState
  const result = rhythmEngine.handleInput(key);

  // Si no había nota elegible en este carril, ignorar silenciosamente.
  // El feedback visual/audio lo dispara rhythmEngine.onHit / onMiss.
  if (result === null) return;

  // Pulso visual extra en el carril (complementa el que dispara onHit)
  pulseLane(key);
}

/* =========================
   WIRING: AUDIO CALLBACK
   El metrónomo del audioEngine sigue corriendo como referencia sonora,
   pero el beat visual ahora lo controla rhythmEngine.onBeat (más preciso).
   Aquí solo lo apagamos para evitar conflicto.
========================= */

function setupAudioCallbacks() {
  audioEngine.onBeat = null; // rhythmEngine.onBeat se asigna en startGame()
}

/* =========================
   WIRING: INPUT
========================= */

function setupInputController() {
  inputController.setCallbacks({
    onPress({ key }) {
      void ensureAudioReady();
      resolveInput(key);
    },
    onRelease() {},
    onInvalid() {}
  });

  inputController.init();
}

/* =========================
   WIRING: UI EVENTS
========================= */

function setupUIEvents() {
  dom.startBtn?.addEventListener("click", async () => {
    await startGame();
  });

  dom.restartBtn?.addEventListener("click", () => {
    restartGame();
  });

  dom.difficultySelect?.addEventListener("change", (event) => {
    gameState.setDifficulty(event.target.value);
    restartGame();
  });

  dom.closeRewardBtn?.addEventListener("click", hideReward);

  dom.rewardModal?.addEventListener("click", (event) => {
    if (event.target.classList.contains("reward-backdrop")) hideReward();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideReward();
  });
}

/* =========================
   WIRING: STATE SUBSCRIPTION
   Solo actualiza la UI. La lógica de fin de partida
   la maneja handleRunEnd(), disparada por rhythmEngine.onComplete.
========================= */

function setupStateSubscription() {
  gameState.subscribe((state) => {
    applyStateToUI(state);

    // Seguridad: si gameState detectó fin por fallos (maxMisses),
    // y el motor de ritmo no lo capturó aún (edge case), lo manejamos aquí.
    if (state.isFinished && !localSession.finishHandled) {
      handleRunEnd();
    }
  });
}

/* =========================
   INIT
========================= */

function initDefaults() {
  const difficulty = dom.difficultySelect?.value || "normal";
  gameState.reset({ difficulty });
  renderRanking();
  noteRenderer.init();
  setMessageFromHitResult(null);
}

async function init() {
  setupAudioCallbacks();
  setupInputController();
  setupUIEvents();
  setupStateSubscription();
  initDefaults();

  // Desbloquear audio en primera interacción (requisito de navegadores)
  window.addEventListener("pointerdown", () => void ensureAudioReady(), { once: true });
}

void init();