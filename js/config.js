const CONFIG = {
  title: "Atrapa el Ritmo",
  subtitle: "Musicala",
  lanes: [
    { key: "A", code: "KeyA", color: 0xff6f91, label: "Pulso 1" },
    { key: "S", code: "KeyS", color: 0xffd166, label: "Pulso 2" },
    { key: "D", code: "KeyD", color: 0x54d6a2, label: "Pulso 3" },
    { key: "F", code: "KeyF", color: 0x55a7ff, label: "Pulso 4" }
  ],
  difficulties: {
    easy: { label: "Fácil", bpm: 78, bars: 8, density: 0.55, maxFails: 12, fallDuration: 1.9 },
    normal: { label: "Normal", bpm: 92, bars: 10, density: 0.72, maxFails: 10, fallDuration: 1.65 },
    hard: { label: "Difícil", bpm: 112, bars: 12, density: 0.86, maxFails: 8, fallDuration: 1.42 }
  },
  countInBeats: 4,
  judgeWindowsMs: {
    perfect: 60,
    good: 120,
    bad: 180
  },
  score: {
    perfect: 100,
    good: 70,
    bad: 35
  },
  storageKeys: {
    best: "atrapa_el_ritmo_musicala_best",
    calibration: "atrapa_el_ritmo_musicala_offset_ms"
  },
  game: {
    width: 960,
    height: 640,
    background: "#fff8e8"
  }
};

export default CONFIG;
