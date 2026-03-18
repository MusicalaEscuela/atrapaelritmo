// config.js
// Configuración central de Atrapa el Ritmo

const CONFIG = {
  /* =========================
     AUDIO
  ========================= */
  audio: {
    defaultBPM: 90,
    minBPM: 70,
    maxBPM: 140,

    // cuánto sube el tempo con dificultad
    bpmStep: {
      easy: 0,
      normal: 10,
      hard: 20
    },

    volume: 0.9
  },

  /* =========================
     TIMING / PRECISIÓN
  ========================= */
  timing: {
    // ventana de acierto (ms)
    perfect: 60,
    good: 120,
    bad: 200,

    // delay visual vs audio (ajustable)
    visualOffset: 0
  },

  /* =========================
     JUEGO BASE
  ========================= */
  gameplay: {
    maxMisses: 10,
    targetScore: 100,

    comboMultiplierStep: 10,
    maxComboMultiplier: 5
  },

  /* =========================
     DIFICULTAD
  ========================= */
  difficulty: {
    easy: {
      speed: 0.8,
      density: 0.4,
      patternLength: 4
    },
    normal: {
      speed: 1,
      density: 0.6,
      patternLength: 6
    },
    hard: {
      speed: 1.2,
      density: 0.8,
      patternLength: 8
    }
  },

  /* =========================
     PATRONES RÍTMICOS
     (aquí viven las "figuras")
  ========================= */
  rhythm: {
    // resolución base (subdivisiones por pulso)
    resolution: 8, // permite combinar figuras

    // bloques base (sin decir nombres)
    basePatterns: [
      [1, 0, 0, 0],        // largo
      [1, 0],              // medio
      [1, 1],              // corto repetido
      [1, 0, 1, 0],        // alternado
      [1, 1, 1, 1]         // continuo
    ],

    // probabilidad de usar patrones más complejos
    complexityChance: {
      easy: 0.2,
      normal: 0.5,
      hard: 0.8
    }
  },

  /* =========================
     SPAWN / NOTAS
  ========================= */
  notes: {
    // tiempo que tarda en caer una nota (ms)
    fallDuration: {
      easy: 1800,
      normal: 1400,
      hard: 1000
    },

    // separación mínima entre notas
    minSpacing: 120
  },

  /* =========================
     SCORING
  ========================= */
  scoring: {
    perfect: 100,
    good: 70,
    bad: 30,
    miss: -20,

    comboBonus: 10
  },

  /* =========================
     UI / FEEDBACK
  ========================= */
  feedback: {
    messages: {
      perfect: "Preciso",
      good: "Bien",
      bad: "Tarde",
      miss: "Fallo"
    }
  }
};

export default CONFIG;