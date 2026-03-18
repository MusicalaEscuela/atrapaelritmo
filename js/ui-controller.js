// ui-controller.js
// Controlador de interfaz para Atrapa el Ritmo

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function difficultyLabel(difficulty) {
  const map = {
    easy: "Fácil",
    normal: "Normal",
    hard: "Difícil"
  };

  return map[difficulty] || "Normal";
}

class UIController {
  constructor(options = {}) {
    this.root = options.root || document;
    this.dom = {};
    this.initialized = false;
  }

  /* =========================
     INIT
  ========================= */

  init() {
    this.cacheDOM();
    this.initialized = true;
    return this;
  }

  cacheDOM() {
    this.dom = {
      difficultyBadge: $("#difficultyBadge", this.root),
      statusBadge: $("#statusBadge", this.root),

      score: $("#score", this.root),
      misses: $("#misses", this.root),
      combo: $("#combo", this.root),
      bestScore: $("#bestScore", this.root),

      progressText: $("#progressText", this.root),
      progressFill: $("#progressFill", this.root),
      hitFeedback: $("#hitFeedback", this.root),

      difficultySelect: $("#difficultySelect", this.root),

      startBtn: $("#startBtn", this.root),
      restartBtn: $("#restartBtn", this.root),

      accuracyValue: $("#accuracyValue", this.root),
      bestCombo: $("#bestCombo", this.root),
      runState: $("#runState", this.root),

      rankingList: $("#rankingList", this.root),

      storyUnlockBox: $("#storyUnlockBox", this.root),
      storyKeywordPreview: $("#storyKeywordPreview", this.root),

      rewardModal: $("#rewardModal", this.root),
      rewardKeyword: $("#rewardKeyword", this.root),
      closeRewardBtn: $("#closeRewardBtn", this.root),

      message: $("#message", this.root),
      gameArea: $("#gameArea", this.root),
      liveComboChip: $("#liveComboChip", this.root),

      beatDots: $$(".beat-dot", this.root),
      lanes: $$(".lane[data-key]", this.root),
      touchButtons: $$(".touch-btn[data-key]", this.root)
    };
  }

  ensureReady() {
    if (!this.initialized) this.init();
  }

  /* =========================
     GETTERS UI
  ========================= */

  getDifficultyValue() {
    this.ensureReady();
    return this.dom.difficultySelect?.value || "normal";
  }

  setDifficultyValue(value = "normal") {
    this.ensureReady();
    if (this.dom.difficultySelect) {
      this.dom.difficultySelect.value = value;
    }
  }

  /* =========================
     MENSAJES
  ========================= */

  setMessage(text, type = "") {
    this.ensureReady();

    const el = this.dom.message;
    if (!el) return;

    el.innerHTML = text;
    el.classList.remove("good", "bad");

    if (type === "good") el.classList.add("good");
    if (type === "bad") el.classList.add("bad");
  }

  setDefaultMessage() {
    this.setMessage(
      'Pulsa <strong>Iniciar</strong>, observa el pulso y usa <strong>A S D F</strong> o los botones táctiles para seguir el patrón.'
    );
  }

  setHitMessage(type = null) {
    if (type === "perfect") {
      this.setMessage("¡Muy bien! Entraste <strong>justo a tiempo</strong>.", "good");
      return;
    }

    if (type === "good") {
      this.setMessage("Buen golpe. Mantén el <strong>pulso</strong>.", "good");
      return;
    }

    if (type === "bad") {
      this.setMessage(
        "Entraste, pero no tan preciso. <strong>Respira y vuelve al centro</strong>.",
        "bad"
      );
      return;
    }

    if (type === "miss") {
      this.setMessage(
        "Fallaste ese golpe. <strong>No adivines</strong>, espera el momento.",
        "bad"
      );
      return;
    }

    this.setDefaultMessage();
  }

  /* =========================
     BADGES / HUD
  ========================= */

  updateBadges(state) {
    this.ensureReady();

    if (this.dom.difficultyBadge) {
      this.dom.difficultyBadge.textContent = `Dificultad: ${difficultyLabel(state.difficulty)}`;
    }

    if (this.dom.statusBadge) {
      this.dom.statusBadge.textContent = state.runStateLabel || "En espera";
    }
  }

  updateStats(state, extra = {}) {
    this.ensureReady();

    if (this.dom.score) this.dom.score.textContent = formatNumber(state.score);
    if (this.dom.misses) this.dom.misses.textContent = formatNumber(state.misses);
    if (this.dom.combo) this.dom.combo.textContent = formatNumber(state.combo);
    if (this.dom.bestScore) {
      this.dom.bestScore.textContent = formatNumber(extra.bestScore ?? 0);
    }

    if (this.dom.accuracyValue) {
      this.dom.accuracyValue.textContent = `${formatNumber(state.session?.accuracy)}%`;
    }

    if (this.dom.bestCombo) {
      this.dom.bestCombo.textContent = formatNumber(
        state.session?.bestCombo ?? state.bestCombo ?? 0
      );
    }

    if (this.dom.runState) {
      this.dom.runState.textContent = state.runStateLabel || "En espera";
    }

    if (this.dom.liveComboChip) {
      this.dom.liveComboChip.textContent = `Combo x${formatNumber(state.combo)}`;
    }
  }

  updateProgress(state) {
    this.ensureReady();

    const progress = clamp(Number(state.progress) || 0, 0, 100);

    if (this.dom.progressText) {
      this.dom.progressText.textContent = `${Math.round(progress)}%`;
    }

    if (this.dom.progressFill) {
      this.dom.progressFill.style.width = `${progress}%`;
    }
  }

  updateFeedback(state) {
    this.ensureReady();

    if (this.dom.hitFeedback) {
      this.dom.hitFeedback.textContent = state.lastHitLabel || "Esperando...";
    }
  }

  updateUnlock(state) {
    this.ensureReady();

    const unlocked = Boolean(state.unlock?.unlocked);
    const keyword = state.unlock?.keyword || "???";

    if (this.dom.storyKeywordPreview) {
      this.dom.storyKeywordPreview.textContent = keyword;
    }

    if (this.dom.storyUnlockBox) {
      this.dom.storyUnlockBox.classList.toggle("is-unlocked", unlocked);
    }
  }

  updateButtons(state) {
    this.ensureReady();

    if (this.dom.startBtn) {
      this.dom.startBtn.disabled = Boolean(state.isRunning);
    }

    if (this.dom.restartBtn) {
      this.dom.restartBtn.disabled = false;
    }

    if (this.dom.difficultySelect) {
      this.dom.difficultySelect.disabled = Boolean(state.isRunning);
    }
  }

  applyState(state, extra = {}) {
    this.updateBadges(state);
    this.updateStats(state, extra);
    this.updateProgress(state);
    this.updateFeedback(state);
    this.updateUnlock(state);
    this.updateButtons(state);
  }

  /* =========================
     RANKING
  ========================= */

  renderRanking(scores = []) {
    this.ensureReady();

    if (!this.dom.rankingList) return;

    const safeScores = [...scores]
      .filter((value) => Number.isFinite(value))
      .map((value) => Math.max(0, Math.round(value)))
      .sort((a, b) => b - a)
      .slice(0, 3);

    while (safeScores.length < 3) {
      safeScores.push(0);
    }

    this.dom.rankingList.innerHTML = safeScores
      .map((score, index) => {
        return `
          <li>
            <span>${index + 1}.</span>
            <strong>${escapeHTML(score)} pts</strong>
          </li>
        `;
      })
      .join("");
  }

  /* =========================
     REWARD MODAL
  ========================= */

  showReward(keyword = "RITMO") {
    this.ensureReady();

    if (this.dom.rewardKeyword) {
      this.dom.rewardKeyword.textContent = String(keyword || "RITMO").toUpperCase();
    }

    if (this.dom.rewardModal) {
      this.dom.rewardModal.hidden = false;
      this.dom.rewardModal.setAttribute("aria-hidden", "false");
    }
  }

  hideReward() {
    this.ensureReady();

    if (this.dom.rewardModal) {
      this.dom.rewardModal.hidden = true;
      this.dom.rewardModal.setAttribute("aria-hidden", "true");
    }
  }

  isRewardOpen() {
    this.ensureReady();
    return !!this.dom.rewardModal && !this.dom.rewardModal.hidden;
  }

  /* =========================
     PULSO VISUAL
  ========================= */

  pulseBeatDot(index) {
    this.ensureReady();

    this.dom.beatDots.forEach((dot, dotIndex) => {
      dot.classList.toggle("is-active", dotIndex === index);
    });
  }

  clearBeatPulse() {
    this.ensureReady();
    this.dom.beatDots.forEach((dot) => dot.classList.remove("is-active"));
  }

  pulseLane(key) {
    this.ensureReady();

    const lane = this.dom.lanes.find((item) => item.dataset.key === key);
    if (!lane) return;

    lane.classList.add("pulse");
    window.setTimeout(() => {
      lane.classList.remove("pulse");
    }, 140);
  }

  setLanePressed(key, isActive) {
    this.ensureReady();

    const lane = this.dom.lanes.find((item) => item.dataset.key === key);
    const touchBtn = this.dom.touchButtons.find((item) => item.dataset.key === key);

    if (lane) lane.classList.toggle("active", Boolean(isActive));
    if (touchBtn) touchBtn.classList.toggle("active", Boolean(isActive));
  }

  clearLanePressed() {
    this.ensureReady();

    this.dom.lanes.forEach((lane) => lane.classList.remove("active"));
    this.dom.touchButtons.forEach((btn) => btn.classList.remove("active"));
  }

  /* =========================
     RESET VISUAL
  ========================= */

  resetForNewRun({ difficulty = "normal", bestScore = 0 } = {}) {
    this.ensureReady();

    this.setDifficultyValue(difficulty);
    this.hideReward();
    this.clearBeatPulse();
    this.clearLanePressed();
    this.setDefaultMessage();

    this.applyState(
      {
        difficulty,
        score: 0,
        misses: 0,
        combo: 0,
        progress: 0,
        bestCombo: 0,
        runStateLabel: "En espera",
        lastHitLabel: "Esperando...",
        session: {
          accuracy: 0,
          bestCombo: 0
        },
        unlock: {
          unlocked: false,
          keyword: "???"
        },
        isRunning: false
      },
      { bestScore }
    );
  }

  /* =========================
     EVENT HELPERS
  ========================= */

  onStart(handler) {
    this.ensureReady();
    this.dom.startBtn?.addEventListener("click", handler);
  }

  onRestart(handler) {
    this.ensureReady();
    this.dom.restartBtn?.addEventListener("click", handler);
  }

  onDifficultyChange(handler) {
    this.ensureReady();
    this.dom.difficultySelect?.addEventListener("change", handler);
  }

  onCloseReward(handler) {
    this.ensureReady();
    this.dom.closeRewardBtn?.addEventListener("click", handler);

    this.dom.rewardModal?.addEventListener("click", (event) => {
      if (event.target.classList.contains("reward-backdrop")) {
        handler(event);
      }
    });
  }
}

const uiController = new UIController();

export { UIController, difficultyLabel };
export default uiController;