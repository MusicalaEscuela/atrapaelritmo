// note-renderer.js
// Render visual de notas y efectos para Atrapa el Ritmo

const DEFAULT_SELECTORS = {
  gameArea: "#gameArea",
  fxLayer: "#fxLayer",
  lane: ".lane[data-key]"
};

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function ensureNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function createNoteElement(note) {
  const el = document.createElement("div");
  el.className = "note";
  el.dataset.noteId = String(note.id);
  el.dataset.key = normalizeKey(note.key);
  el.setAttribute("aria-hidden", "true");

  if (note.type) {
    el.dataset.type = String(note.type);
  }

  return el;
}

class NoteRenderer {
  constructor(options = {}) {
    this.root = options.root || document;

    this.selectors = {
      ...DEFAULT_SELECTORS,
      ...(options.selectors || {})
    };

    this.gameArea = null;
    this.fxLayer = null;
    this.laneMap = new Map();

    this.noteElements = new Map(); // noteId => element
    this.noteMeta = new Map(); // noteId => noteData

    this.isReady = false;
    this.lastResizeWidth = window.innerWidth;
    this.lastResizeHeight = window.innerHeight;

    this.boundHandleResize = this.handleResize.bind(this);
  }

  /* =========================
     INIT
  ========================= */

  init() {
    this.cacheDOM();
    this.bind();
    this.isReady = true;
    return this;
  }

  cacheDOM() {
    this.gameArea = $(this.selectors.gameArea, this.root);
    this.fxLayer = $(this.selectors.fxLayer, this.root);

    const lanes = $$(this.selectors.lane, this.root);
    this.laneMap.clear();

    lanes.forEach((lane) => {
      const key = normalizeKey(lane.dataset.key);
      if (key) {
        this.laneMap.set(key, lane);
      }
    });
  }

  bind() {
    window.addEventListener("resize", this.boundHandleResize, { passive: true });
  }

  destroy() {
    window.removeEventListener("resize", this.boundHandleResize);
    this.clearAllNotes();
    this.clearFX();

    this.noteElements.clear();
    this.noteMeta.clear();
    this.laneMap.clear();
    this.isReady = false;
  }

  handleResize() {
    if (
      this.lastResizeWidth === window.innerWidth &&
      this.lastResizeHeight === window.innerHeight
    ) {
      return;
    }

    this.lastResizeWidth = window.innerWidth;
    this.lastResizeHeight = window.innerHeight;

    this.cacheDOM();
  }

  /* =========================
     HELPERS
  ========================= */

  getLane(key) {
    return this.laneMap.get(normalizeKey(key)) || null;
  }

  getLaneMetrics(key) {
    const lane = this.getLane(key);
    if (!lane) return null;

    const header = lane.querySelector(".lane-header");
    const hitZone = lane.querySelector(".hit-zone");

    const laneRect = lane.getBoundingClientRect();
    const headerRect = header?.getBoundingClientRect() || null;
    const hitZoneRect = hitZone?.getBoundingClientRect() || null;

    const topY = headerRect ? headerRect.bottom - laneRect.top + 6 : 52;
    const hitTopY = hitZoneRect ? hitZoneRect.top - laneRect.top : laneRect.height - 90;
    const hitBottomY = hitZoneRect ? hitZoneRect.bottom - laneRect.top : laneRect.height - 18;
    const travelHeight = Math.max(1, hitTopY - topY);

    return {
      lane,
      laneRect,
      headerRect,
      hitZoneRect,
      topY,
      hitTopY,
      hitBottomY,
      travelHeight
    };
  }

  ensureFXLayer() {
    if (!this.fxLayer && this.gameArea) {
      const existing = $("#fxLayer", this.gameArea);
      if (existing) {
        this.fxLayer = existing;
      }
    }
    return this.fxLayer;
  }

  /* =========================
     NOTAS
  ========================= */

  createNote(note) {
    if (!this.isReady) this.init();

    const safeId = String(note?.id ?? "");
    const safeKey = normalizeKey(note?.key);

    if (!safeId || !safeKey) return null;

    const lane = this.getLane(safeKey);
    if (!lane) return null;

    if (this.noteElements.has(safeId)) {
      return this.noteElements.get(safeId);
    }

    const el = createNoteElement({
      ...note,
      id: safeId,
      key: safeKey
    });

    lane.appendChild(el);
    this.noteElements.set(safeId, el);
    this.noteMeta.set(safeId, {
      ...note,
      id: safeId,
      key: safeKey,
      progress: 0
    });

    this.updateNotePosition(safeId, note.progress ?? 0);

    return el;
  }

  updateNote(note) {
    const safeId = String(note?.id ?? "");
    if (!safeId || !this.noteElements.has(safeId)) return;

    const previous = this.noteMeta.get(safeId) || {};
    const merged = {
      ...previous,
      ...note,
      id: safeId,
      key: normalizeKey(note?.key ?? previous.key)
    };

    this.noteMeta.set(safeId, merged);

    if (typeof note.progress === "number") {
      this.updateNotePosition(safeId, note.progress);
    }

    if (note.type) {
      const el = this.noteElements.get(safeId);
      if (el) el.dataset.type = String(note.type);
    }
  }

  updateNotePosition(noteId, progress = 0) {
    const safeId = String(noteId);
    const el = this.noteElements.get(safeId);
    const meta = this.noteMeta.get(safeId);

    if (!el || !meta) return;

    const metrics = this.getLaneMetrics(meta.key);
    if (!metrics) return;

    const safeProgress = clamp(ensureNumber(progress, 0), 0, 1);
    const y = lerp(metrics.topY, metrics.hitTopY, safeProgress);

    el.style.top = `${Math.round(y)}px`;
    el.style.opacity = safeProgress >= 0.985 ? "0.92" : "1";

    this.noteMeta.set(safeId, {
      ...meta,
      progress: safeProgress
    });
  }

  removeNote(noteId) {
    const safeId = String(noteId);
    const el = this.noteElements.get(safeId);

    if (el?.parentNode) {
      el.parentNode.removeChild(el);
    }

    this.noteElements.delete(safeId);
    this.noteMeta.delete(safeId);
  }

  clearAllNotes() {
    this.noteElements.forEach((el) => {
      if (el?.parentNode) {
        el.parentNode.removeChild(el);
      }
    });

    this.noteElements.clear();
    this.noteMeta.clear();
  }

  renderNotes(notes = []) {
    const incoming = Array.isArray(notes) ? notes : [];
    const incomingIds = new Set();

    incoming.forEach((note) => {
      const safeId = String(note?.id ?? "");
      if (!safeId) return;

      incomingIds.add(safeId);

      if (!this.noteElements.has(safeId)) {
        this.createNote(note);
      } else {
        this.updateNote(note);
      }
    });

    [...this.noteElements.keys()].forEach((existingId) => {
      if (!incomingIds.has(existingId)) {
        this.removeNote(existingId);
      }
    });
  }

  /* =========================
     EFECTOS VISUALES
  ========================= */

  createFloatingText({
    text = "Bien",
    key = "",
    className = "",
    duration = 420
  } = {}) {
    const fxLayer = this.ensureFXLayer();
    const metrics = this.getLaneMetrics(key);

    if (!fxLayer || !metrics) return null;

    const bubble = document.createElement("div");
    bubble.className = `fx-badge ${className}`.trim();
    bubble.textContent = text;
    bubble.setAttribute("aria-hidden", "true");

    const laneRect = metrics.lane.getBoundingClientRect();
    const areaRect = this.gameArea.getBoundingClientRect();

    const left = laneRect.left - areaRect.left + laneRect.width / 2;
    const top = metrics.hitTopY - 18;

    bubble.style.position = "absolute";
    bubble.style.left = `${Math.round(left)}px`;
    bubble.style.top = `${Math.round(top)}px`;
    bubble.style.transform = "translate(-50%, 0)";
    bubble.style.padding = "6px 10px";
    bubble.style.borderRadius = "999px";
    bubble.style.fontWeight = "800";
    bubble.style.fontSize = "0.78rem";
    bubble.style.zIndex = "12";
    bubble.style.pointerEvents = "none";
    bubble.style.whiteSpace = "nowrap";
    bubble.style.boxShadow = "0 10px 22px rgba(20, 35, 70, 0.14)";
    bubble.style.border = "1px solid rgba(255,255,255,0.75)";
    bubble.style.background = "#ffffff";
    bubble.style.color = "#1f2a44";
    bubble.style.opacity = "1";
    bubble.style.transition = `transform ${duration}ms ease, opacity ${duration}ms ease`;

    fxLayer.appendChild(bubble);

    requestAnimationFrame(() => {
      bubble.style.transform = "translate(-50%, -20px)";
      bubble.style.opacity = "0";
    });

    window.setTimeout(() => {
      bubble.remove();
    }, duration + 40);

    return bubble;
  }

  showHitFeedback(key, result = "good") {
    const config = {
      perfect: { text: "¡Preciso!", className: "fx-perfect" },
      good: { text: "Bien", className: "fx-good" },
      bad: { text: "Tarde", className: "fx-bad" },
      miss: { text: "Fallo", className: "fx-miss" }
    };

    const selected = config[result] || config.good;

    const bubble = this.createFloatingText({
      text: selected.text,
      key,
      className: selected.className
    });

    if (bubble) {
      if (result === "perfect") {
        bubble.style.background = "#edf9f0";
        bubble.style.color = "#1d7a38";
      } else if (result === "good") {
        bubble.style.background = "#eef3ff";
        bubble.style.color = "#2440a8";
      } else if (result === "bad") {
        bubble.style.background = "#fff9e9";
        bubble.style.color = "#8a6500";
      } else if (result === "miss") {
        bubble.style.background = "#fff0ef";
        bubble.style.color = "#b3261e";
      }
    }
  }

  showLaneFlash(key, result = "good") {
    const lane = this.getLane(key);
    if (!lane) return;

    const className = `flash-${result}`;
    lane.classList.add(className);

    window.setTimeout(() => {
      lane.classList.remove(className);
    }, 180);
  }

  burstOnHit(key, result = "good") {
    const fxLayer = this.ensureFXLayer();
    const metrics = this.getLaneMetrics(key);
    if (!fxLayer || !metrics) return;

    const laneRect = metrics.lane.getBoundingClientRect();
    const areaRect = this.gameArea.getBoundingClientRect();

    const centerX = laneRect.left - areaRect.left + laneRect.width / 2;
    const centerY = metrics.hitTopY + 18;

    const colors = {
      perfect: "rgba(107, 203, 119, 0.35)",
      good: "rgba(77, 150, 255, 0.28)",
      bad: "rgba(255, 217, 61, 0.28)",
      miss: "rgba(255, 107, 107, 0.24)"
    };

    const ring = document.createElement("div");
    ring.setAttribute("aria-hidden", "true");
    ring.style.position = "absolute";
    ring.style.left = `${Math.round(centerX)}px`;
    ring.style.top = `${Math.round(centerY)}px`;
    ring.style.width = "18px";
    ring.style.height = "18px";
    ring.style.borderRadius = "999px";
    ring.style.border = `3px solid ${colors[result] || colors.good}`;
    ring.style.transform = "translate(-50%, -50%) scale(0.6)";
    ring.style.opacity = "1";
    ring.style.pointerEvents = "none";
    ring.style.zIndex = "11";
    ring.style.transition = "transform 220ms ease, opacity 220ms ease";

    fxLayer.appendChild(ring);

    requestAnimationFrame(() => {
      ring.style.transform = "translate(-50%, -50%) scale(2.4)";
      ring.style.opacity = "0";
    });

    window.setTimeout(() => {
      ring.remove();
    }, 260);
  }

  playHitFX(key, result = "good") {
    this.showLaneFlash(key, result);
    this.burstOnHit(key, result);
    this.showHitFeedback(key, result);
  }

  clearFX() {
    const fxLayer = this.ensureFXLayer();
    if (!fxLayer) return;
    fxLayer.innerHTML = "";
  }

  /* =========================
     UTILIDAD
  ========================= */

  hasNote(noteId) {
    return this.noteElements.has(String(noteId));
  }

  getRenderedNoteIds() {
    return [...this.noteElements.keys()];
  }

  getRenderedCount() {
    return this.noteElements.size;
  }
}

const noteRenderer = new NoteRenderer();

export { NoteRenderer };
export default noteRenderer;