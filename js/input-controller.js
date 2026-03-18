// input-controller.js
// Control de entradas para Atrapa el Ritmo
// Maneja teclado + controles táctiles/pointer

import gameState from "./game-state.js";

const DEFAULT_KEYS = ["a", "s", "d", "f"];

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidGameKey(value, allowedKeys = DEFAULT_KEYS) {
  return allowedKeys.includes(normalizeKey(value));
}

class InputController {
  constructor(options = {}) {
    this.allowedKeys = Array.isArray(options.allowedKeys) && options.allowedKeys.length
      ? options.allowedKeys.map(normalizeKey)
      : [...DEFAULT_KEYS];

    this.root = options.root || document;
    this.touchSelector = options.touchSelector || ".touch-btn[data-key]";
    this.laneSelector = options.laneSelector || ".lane[data-key]";

    this.onPress = typeof options.onPress === "function" ? options.onPress : null;
    this.onRelease = typeof options.onRelease === "function" ? options.onRelease : null;
    this.onInvalid = typeof options.onInvalid === "function" ? options.onInvalid : null;

    this.isEnabled = true;
    this.isBound = false;

    this.activePointers = new Map(); // pointerId => key
    this.activeTouchesFallback = new Set(); // para casos raros
    this.pressedKeys = new Set();

    this.touchButtons = [];
    this.lanes = [];

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerCancel = this.handlePointerCancel.bind(this);

    this.handleMouseLeave = this.handleMouseLeave.bind(this);

    this.handleTouchStartFallback = this.handleTouchStartFallback.bind(this);
    this.handleTouchEndFallback = this.handleTouchEndFallback.bind(this);
  }

  /* =========================
     INIT / BIND
  ========================= */

  init() {
    this.refreshElements();
    this.bind();
    return this;
  }

  refreshElements() {
    this.touchButtons = Array.from(this.root.querySelectorAll(this.touchSelector));
    this.lanes = Array.from(this.root.querySelectorAll(this.laneSelector));
  }

  bind() {
    if (this.isBound) return;

    window.addEventListener("keydown", this.handleKeyDown, { passive: false });
    window.addEventListener("keyup", this.handleKeyUp, { passive: false });
    document.addEventListener("visibilitychange", this.handleVisibilityChange);

    this.refreshElements();

    this.touchButtons.forEach((button) => {
      button.addEventListener("pointerdown", this.handlePointerDown, { passive: false });
      button.addEventListener("pointerup", this.handlePointerUp, { passive: false });
      button.addEventListener("pointercancel", this.handlePointerCancel, { passive: false });
      button.addEventListener("lostpointercapture", this.handlePointerCancel, { passive: false });

      // fallback para navegadores viejitos o temperamentales
      button.addEventListener("touchstart", this.handleTouchStartFallback, { passive: false });
      button.addEventListener("touchend", this.handleTouchEndFallback, { passive: false });
      button.addEventListener("touchcancel", this.handleTouchEndFallback, { passive: false });

      button.addEventListener("mouseleave", this.handleMouseLeave, { passive: true });
      button.addEventListener("dragstart", (event) => event.preventDefault());
    });

    this.isBound = true;
  }

  destroy() {
    if (!this.isBound) return;

    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);

    this.touchButtons.forEach((button) => {
      button.removeEventListener("pointerdown", this.handlePointerDown);
      button.removeEventListener("pointerup", this.handlePointerUp);
      button.removeEventListener("pointercancel", this.handlePointerCancel);
      button.removeEventListener("lostpointercapture", this.handlePointerCancel);

      button.removeEventListener("touchstart", this.handleTouchStartFallback);
      button.removeEventListener("touchend", this.handleTouchEndFallback);
      button.removeEventListener("touchcancel", this.handleTouchEndFallback);

      button.removeEventListener("mouseleave", this.handleMouseLeave);
    });

    this.releaseAll();
    this.isBound = false;
  }

  /* =========================
     ENABLE / DISABLE
  ========================= */

  enable() {
    this.isEnabled = true;
  }

  disable({ release = true } = {}) {
    this.isEnabled = false;
    if (release) this.releaseAll();
  }

  setCallbacks({ onPress, onRelease, onInvalid } = {}) {
    if (typeof onPress === "function") this.onPress = onPress;
    if (typeof onRelease === "function") this.onRelease = onRelease;
    if (typeof onInvalid === "function") this.onInvalid = onInvalid;
  }

  /* =========================
     HELPERS
  ========================= */

  getButtonByKey(key) {
    const safeKey = normalizeKey(key);
    return this.touchButtons.find((button) => normalizeKey(button.dataset.key) === safeKey) || null;
  }

  getLaneByKey(key) {
    const safeKey = normalizeKey(key);
    return this.lanes.find((lane) => normalizeKey(lane.dataset.key) === safeKey) || null;
  }

  setVisualActive(key, isActive) {
    const button = this.getButtonByKey(key);
    const lane = this.getLaneByKey(key);

    if (button) button.classList.toggle("active", isActive);
    if (lane) lane.classList.toggle("active", isActive);
  }

  canProcessKey(key) {
    return this.isEnabled && isValidGameKey(key, this.allowedKeys);
  }

  emitPress(key, source = "keyboard", originalEvent = null) {
    if (typeof this.onPress === "function") {
      this.onPress({
        key: normalizeKey(key),
        source,
        originalEvent,
        pressedKeys: new Set(this.pressedKeys),
        timestamp: performance.now()
      });
    }
  }

  emitRelease(key, source = "keyboard", originalEvent = null) {
    if (typeof this.onRelease === "function") {
      this.onRelease({
        key: normalizeKey(key),
        source,
        originalEvent,
        pressedKeys: new Set(this.pressedKeys),
        timestamp: performance.now()
      });
    }
  }

  emitInvalid(rawKey, source = "keyboard", originalEvent = null) {
    if (typeof this.onInvalid === "function") {
      this.onInvalid({
        key: normalizeKey(rawKey),
        source,
        originalEvent,
        timestamp: performance.now()
      });
    }
  }

  /* =========================
     PRESS / RELEASE CORE
  ========================= */

  pressKey(key, source = "keyboard", originalEvent = null) {
    const safeKey = normalizeKey(key);

    if (!this.isEnabled) return false;

    if (!isValidGameKey(safeKey, this.allowedKeys)) {
      this.emitInvalid(safeKey, source, originalEvent);
      return false;
    }

    if (this.pressedKeys.has(safeKey)) {
      return false;
    }

    this.pressedKeys.add(safeKey);
    gameState.pressKey(safeKey);
    this.setVisualActive(safeKey, true);
    this.emitPress(safeKey, source, originalEvent);

    return true;
  }

  releaseKey(key, source = "keyboard", originalEvent = null) {
    const safeKey = normalizeKey(key);

    if (!this.pressedKeys.has(safeKey)) {
      return false;
    }

    this.pressedKeys.delete(safeKey);
    gameState.releaseKey(safeKey);
    this.setVisualActive(safeKey, false);
    this.emitRelease(safeKey, source, originalEvent);

    return true;
  }

  releaseAll() {
    [...this.pressedKeys].forEach((key) => {
      this.releaseKey(key, "system", null);
    });

    this.activePointers.clear();
    this.activeTouchesFallback.clear();
    gameState.clearPressedKeys();
  }

  /* =========================
     KEYBOARD
  ========================= */

  handleKeyDown(event) {
    const key = normalizeKey(event.key);

    if (!isValidGameKey(key, this.allowedKeys)) return;

    event.preventDefault();

    if (event.repeat) return;
    this.pressKey(key, "keyboard", event);
  }

  handleKeyUp(event) {
    const key = normalizeKey(event.key);

    if (!isValidGameKey(key, this.allowedKeys)) return;

    event.preventDefault();
    this.releaseKey(key, "keyboard", event);
  }

  /* =========================
     POINTER EVENTS
  ========================= */

  handlePointerDown(event) {
    const button = event.currentTarget;
    const key = normalizeKey(button?.dataset?.key);

    if (!this.canProcessKey(key)) return;

    event.preventDefault();

    try {
      if (button?.setPointerCapture && event.pointerId != null) {
        button.setPointerCapture(event.pointerId);
      }
    } catch {
      // Algunos navegadores aman fallar en silencio. Qué sorpresa.
    }

    if (event.pointerId != null) {
      this.activePointers.set(event.pointerId, key);
    }

    this.pressKey(key, "pointer", event);
  }

  handlePointerUp(event) {
    const button = event.currentTarget;
    const fallbackKey = normalizeKey(button?.dataset?.key);
    const mappedKey = event.pointerId != null ? this.activePointers.get(event.pointerId) : null;
    const key = normalizeKey(mappedKey || fallbackKey);

    if (event.pointerId != null) {
      this.activePointers.delete(event.pointerId);
    }

    this.releaseKey(key, "pointer", event);
  }

  handlePointerCancel(event) {
    const button = event.currentTarget;
    const fallbackKey = normalizeKey(button?.dataset?.key);
    const mappedKey = event.pointerId != null ? this.activePointers.get(event.pointerId) : null;
    const key = normalizeKey(mappedKey || fallbackKey);

    if (event.pointerId != null) {
      this.activePointers.delete(event.pointerId);
    }

    this.releaseKey(key, "pointer-cancel", event);
  }

  handleMouseLeave(event) {
    const button = event.currentTarget;
    const key = normalizeKey(button?.dataset?.key);

    // Solo para mouse. En touch/pointer no queremos cortar entradas por accidente.
    if (event.buttons === 0) {
      this.releaseKey(key, "mouseleave", event);
    }
  }

  /* =========================
     TOUCH FALLBACK
  ========================= */

  handleTouchStartFallback(event) {
    const button = event.currentTarget;
    const key = normalizeKey(button?.dataset?.key);

    if (!this.canProcessKey(key)) return;

    event.preventDefault();

    if (this.activeTouchesFallback.has(key)) return;
    this.activeTouchesFallback.add(key);

    this.pressKey(key, "touch", event);
  }

  handleTouchEndFallback(event) {
    const button = event.currentTarget;
    const key = normalizeKey(button?.dataset?.key);

    event.preventDefault();

    this.activeTouchesFallback.delete(key);
    this.releaseKey(key, "touch", event);
  }

  /* =========================
     VISIBILITY
  ========================= */

  handleVisibilityChange() {
    if (document.hidden) {
      this.releaseAll();
    }
  }
}

const inputController = new InputController();

export { InputController, DEFAULT_KEYS, normalizeKey, isValidGameKey };
export default inputController;