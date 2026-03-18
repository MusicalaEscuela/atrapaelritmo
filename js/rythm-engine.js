// rythm-engine.js
// Motor de ritmo principal de Atrapa el Ritmo
// Gestiona: loop de juego, spawn de notas, movimiento, evaluación de timing y resolución.

import CONFIG from "./config.js";
import gameState from "./game-state.js";
import patternGenerator from "./pattern-generator.js";
import noteRenderer from "./note-renderer.js";

/* =========================
   HELPERS
========================= */

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createNoteId(prefix = "note") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/* =========================
   MODELO DE NOTA ACTIVA
   {
     id:          string   — identificador único
     key:         string   — carril (a/s/d/f)
     targetTime:  number   — ms desde inicio en que debe golpearse
     spawnTime:   number   — ms desde inicio en que aparece (targetTime - fallDuration)
     phase:       number
     figureId:    string
     hit:         boolean  — ya fue golpeada
     missed:      boolean  — pasó sin ser golpeada
     progress:    number   — 0..1 posición vertical en el carril
   }
========================= */

class RhythmEngine {
  constructor() {
    // ── Estado general ─────────────────────────────
    this.isRunning  = false;
    this.isPaused   = false;

    // ── Timing ─────────────────────────────────────
    this.bpm          = 90;
    this.stepDuration = 0;    // ms por subdivisión (corchea)
    this.fallDuration = 1400; // ms que tarda en caer una nota
    this.introDelay   = 0;    // ms de espera antes del primer golpe (se calcula)

    // ── Plan de partida ────────────────────────────
    this.runPlan       = null;
    this.allNoteEvents = []; // lista plana, ordenada por targetTime
    this.nextNoteIndex = 0;

    // ── Notas en vuelo ─────────────────────────────
    this.activeNotes = [];

    // ── Contadores ─────────────────────────────────
    this.totalNotes    = 0;
    this.resolvedCount = 0;

    // ── Clock ──────────────────────────────────────
    this.startTime      = 0;   // performance.now() al arrancar
    this.pauseStartTime = 0;   // para compensar tiempo pausado
    this.pausedMs       = 0;

    // ── rAF ────────────────────────────────────────
    this.rafId = null;

    // ── Callbacks para main.js ─────────────────────
    this.onHit      = null;  // (key, result) => void
    this.onMiss     = null;  // (key) => void
    this.onBeat     = null;  // (beatIndex) => void  (0..3)
    this.onComplete = null;  // () => void

    // ── Beat visual interno ─────────────────────────
    this.lastBeatIndex = -1;

    this._loop = this._loop.bind(this);
  }

  /* =========================
     CONFIGURACIÓN
  ========================= */

  /**
   * Calcula duraciones internas a partir de BPM y dificultad.
   * Debe llamarse antes de start().
   */
  configure({ bpm, difficulty } = {}) {
    const safeBPM  = clamp(Number(bpm)  || CONFIG.audio.defaultBPM, CONFIG.audio.minBPM, CONFIG.audio.maxBPM);
    const safeDiff = CONFIG.difficulty[difficulty] ? difficulty : "normal";

    this.bpm          = safeBPM;
    this.stepDuration = (60 / this.bpm / 2) * 1000; // corchea en ms
    this.fallDuration = CONFIG.notes.fallDuration[safeDiff] || 1400;

    // El intro delay es exactamente el fallDuration,
    // así la primera nota siempre tiene spawnTime = 0 (cae limpia desde arriba).
    this.introDelay = this.fallDuration;
  }

  /* =========================
     ARRANQUE / PARADA
  ========================= */

  start({ bpm, difficulty, phase = 1, phaseCount = 3 } = {}) {
    this.stop(); // limpieza antes de empezar

    this.configure({ bpm, difficulty });

    // Generar plan completo de la partida
    this.runPlan = patternGenerator.buildRunPlan({
      startPhase : Math.max(1, phase),
      phaseCount : Math.max(1, phaseCount),
      difficulty
    });

    // Construir lista plana de notas con tiempos absolutos
    this.allNoteEvents = this._buildTimedNoteEvents(this.runPlan);
    this.totalNotes    = this.allNoteEvents.length;
    this.nextNoteIndex = 0;
    this.activeNotes   = [];
    this.resolvedCount = 0;
    this.lastBeatIndex = -1;

    // Comunicar al estado cuántas notas hay en total
    gameState.setPatternMeta({
      totalStepsTarget: this.totalNotes
    });

    // Preparar renderer
    noteRenderer.init();
    noteRenderer.clearAllNotes();

    // Arrancar el clock
    this.isRunning      = true;
    this.isPaused       = false;
    this.pausedMs       = 0;
    this.startTime      = performance.now();

    this.rafId = requestAnimationFrame(this._loop);
  }

  stop() {
    this.isRunning = false;
    this.isPaused  = false;

    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    noteRenderer.clearAllNotes();
    this.activeNotes = [];
  }

  pause() {
    if (!this.isRunning || this.isPaused) return;

    this.isRunning      = false;
    this.isPaused       = true;
    this.pauseStartTime = performance.now();

    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  resume() {
    if (!this.isPaused) return;

    // Compensar el tiempo que estuvo pausado
    this.pausedMs  += performance.now() - this.pauseStartTime;
    this.isRunning  = true;
    this.isPaused   = false;

    this.rafId = requestAnimationFrame(this._loop);
  }

  /* =========================
     CONSTRUCCIÓN DE EVENTOS
  ========================= */

  /**
   * Convierte el runPlan en una lista plana de notas con tiempos absolutos (ms).
   * La primera nota tiene:
   *   spawnTime  = 0       (aparece en el frame 1)
   *   targetTime = fallDuration  (el jugador la golpea fallDuration ms después)
   *
   * El introDelay desplaza todos los targetTimes hacia adelante en fallDuration ms,
   * garantizando que ninguna nota nazca antes de que el loop empiece.
   */
  _buildTimedNoteEvents(runPlan) {
    const events     = [];
    let stepOffset   = 0; // pasos acumulados de fases anteriores

    runPlan.phases.forEach((phase) => {
      phase.noteEvents.forEach((noteEvent) => {
        const absoluteStep = stepOffset + noteEvent.globalStepIndex;
        const targetTime   = this.introDelay + absoluteStep * this.stepDuration;
        const spawnTime    = targetTime - this.fallDuration;

        events.push({
          id          : createNoteId("note"),
          key         : noteEvent.laneKey,
          targetTime,
          spawnTime,
          phase       : noteEvent.phase,
          figureId    : noteEvent.figureId,
          hit         : false,
          missed      : false,
          progress    : 0
        });
      });

      stepOffset += phase.totalSteps;
    });

    // Ordenar por targetTime (debería estar ya ordenado, pero por seguridad)
    events.sort((a, b) => a.targetTime - b.targetTime);
    return events;
  }

  /* =========================
     LOOP PRINCIPAL
  ========================= */

  _loop(timestamp) {
    if (!this.isRunning) return;

    // Tiempo neto de juego, sin contar pausas
    const elapsed = timestamp - this.startTime - this.pausedMs;

    this._spawnPendingNotes(elapsed);
    this._updateNotePositions(elapsed);
    this._checkMissedNotes(elapsed);
    this._tickBeatVisual(elapsed);

    // Render: pasar snapshot de notas activas al renderer
    noteRenderer.renderNotes(
      this.activeNotes.filter((n) => !n.hit && !n.missed)
    );

    // Limpiar notas ya resueltas que terminaron su fx
    this._pruneResolvedNotes(elapsed);

    if (this._checkRunComplete()) return;

    this.rafId = requestAnimationFrame(this._loop);
  }

  /* =========================
     SPAWN
  ========================= */

  _spawnPendingNotes(elapsed) {
    while (
      this.nextNoteIndex < this.allNoteEvents.length &&
      this.allNoteEvents[this.nextNoteIndex].spawnTime <= elapsed
    ) {
      const event = { ...this.allNoteEvents[this.nextNoteIndex] };
      this.activeNotes.push(event);
      this.nextNoteIndex++;
    }
  }

  /* =========================
     MOVIMIENTO
  ========================= */

  _updateNotePositions(elapsed) {
    for (const note of this.activeNotes) {
      if (note.hit || note.missed) continue;

      const age      = elapsed - note.spawnTime;
      note.progress  = clamp(age / this.fallDuration, 0, 1.05); // pequeño overshoot visual
    }
  }

  /* =========================
     AUTO-MISS
  ========================= */

  _checkMissedNotes(elapsed) {
    // Ventana de gracia: bad window + pequeño margen de latencia
    const missDeadline = CONFIG.timing.bad + 60;

    for (const note of this.activeNotes) {
      if (note.hit || note.missed) continue;

      const timeSinceTarget = elapsed - note.targetTime;

      if (timeSinceTarget > missDeadline) {
        note.missed    = true;
        note.missedAt  = elapsed;
        this._resolveNote(note, "miss");
      }
    }
  }

  /**
   * Elimina del array interno notas que ya terminaron su ciclo de vida
   * (golpeadas o perdidas y con tiempo de FX agotado).
   */
  _pruneResolvedNotes(elapsed) {
    const FX_LINGER = 350; // ms que el objeto vive después de resolverse

    this.activeNotes = this.activeNotes.filter((note) => {
      if (!note.hit && !note.missed) return true; // todavía activa

      const resolvedAt = note.resolvedAt || note.missedAt || 0;
      return elapsed - resolvedAt < FX_LINGER;
    });
  }

  /* =========================
     BEAT VISUAL
  ========================= */

  /**
   * Emite un callback por cada pulso negra que pasa,
   * para animar los puntos del beat guide en la UI.
   */
  _tickBeatVisual(elapsed) {
    if (!this.onBeat) return;

    // Pulsos desde inicio (descontando introDelay)
    const effectiveElapsed = elapsed - this.introDelay;
    if (effectiveElapsed < 0) return;

    const beatDuration = this.stepDuration * 2; // negra = 2 corcheas
    const currentBeat  = Math.floor(effectiveElapsed / beatDuration) % 4;

    if (currentBeat !== this.lastBeatIndex) {
      this.lastBeatIndex = currentBeat;
      this.onBeat(currentBeat);
    }
  }

  /* =========================
     INPUT DEL JUGADOR
  ========================= */

  /**
   * Llamar desde main.js cada vez que el jugador presiona una tecla.
   * Devuelve "perfect" | "good" | "bad" | null
   *
   * null = no había nota elegible (ni muy pronto ni muy tarde relevante)
   */
  handleInput(key) {
    if (!this.isRunning) return null;

    const elapsed       = performance.now() - this.startTime - this.pausedMs;
    const timingConfig  = CONFIG.timing;
    const earlyWindow   = timingConfig.bad; // no aceptar golpes demasiado pronto

    let bestNote  = null;
    let bestDelta = Infinity;

    for (const note of this.activeNotes) {
      if (note.key    !== key)  continue;
      if (note.hit    || note.missed) continue;

      const delta = elapsed - note.targetTime; // positivo = tarde, negativo = pronto

      // Rechazar si es demasiado pronto (más de bad window antes del target)
      if (delta < -earlyWindow) continue;

      const absDelta = Math.abs(delta);

      if (absDelta < bestDelta) {
        bestDelta = absDelta;
        bestNote  = note;
      }
    }

    // No hay nota elegible en este carril
    if (!bestNote) return null;

    // Clasificar precisión
    let result;

    if (bestDelta <= timingConfig.perfect) {
      result = "perfect";
    } else if (bestDelta <= timingConfig.good) {
      result = "good";
    } else if (bestDelta <= timingConfig.bad) {
      result = "bad";
    } else {
      // Demasiado tarde (pasó la ventana bad pero aún no fue auto-missed).
      // Ocurre raramente; tratar como bad para no frustrar.
      result = "bad";
    }

    bestNote.hit        = true;
    bestNote.resolvedAt = elapsed;

    this._resolveNote(bestNote, result);
    return result;
  }

  /* =========================
     RESOLUCIÓN DE NOTAS
  ========================= */

  _resolveNote(note, result) {
    this.resolvedCount++;

    // Feedback visual inmediato
    noteRenderer.removeNote(note.id);
    noteRenderer.playHitFX(note.key, result);

    // Avanzar progreso del patrón
    gameState.advancePatternStep(1);

    if (result === "miss") {
      gameState.registerMiss();
      if (typeof this.onMiss === "function") {
        this.onMiss(note.key);
      }
    } else {
      gameState.registerHit(result);
      if (typeof this.onHit === "function") {
        this.onHit(note.key, result);
      }
    }
  }

  /* =========================
     FIN DE PARTIDA
  ========================= */

  _checkRunComplete() {
    const state = gameState.getState();

    // El game state ya decidió terminar (por fallos o progreso >= 100)
    if (state.isFinished) {
      this._finalize();
      return true;
    }

    // Todas las notas generadas ya fueron resueltas
    const pendingActive = this.activeNotes.filter((n) => !n.hit && !n.missed).length;
    const allSpawned    = this.nextNoteIndex >= this.allNoteEvents.length;

    if (allSpawned && pendingActive === 0 && this.resolvedCount >= this.totalNotes) {
      // Pequeño delay para que los últimos FX terminen de verse
      setTimeout(() => {
        if (!gameState.getState().isFinished) {
          gameState.finishRun({ completed: true });
        }
        this._finalize();
      }, 500);

      return true;
    }

    return false;
  }

  _finalize() {
    this.stop();
    if (typeof this.onComplete === "function") {
      this.onComplete();
    }
  }

  /* =========================
     UTILIDAD PÚBLICA
  ========================= */

  /** ms netos de juego transcurridos */
  getElapsed() {
    if (!this.isRunning && !this.isPaused) return 0;
    return performance.now() - this.startTime - this.pausedMs;
  }

  /** Progreso 0..1 basado en notas resueltas */
  getProgress() {
    if (!this.totalNotes) return 0;
    return clamp(this.resolvedCount / this.totalNotes, 0, 1);
  }

  /** Cuántas notas quedan por spawnar + las activas sin resolver */
  getPendingCount() {
    const unspawned = this.allNoteEvents.length - this.nextNoteIndex;
    const active    = this.activeNotes.filter((n) => !n.hit && !n.missed).length;
    return unspawned + active;
  }
}

const rhythmEngine = new RhythmEngine();

export { RhythmEngine };
export default rhythmEngine;  