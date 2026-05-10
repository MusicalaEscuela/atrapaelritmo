import { getBestScore, saveBestScore } from "../storage/scores.js";

export default class ResultsScene extends Phaser.Scene {
  constructor() {
    super("ResultsScene");
  }

  create(data) {
    this.results = data.results;
    this.difficulty = data.difficulty || "normal";
    const previousBest = getBestScore();
    const best = saveBestScore(this.results.score);
    this.isRecord = best > previousBest;
    this.cameras.main.setBackgroundColor("#fff8e8");
    this.draw();
  }

  draw() {
    const { width, height } = this.scale;
    const centerX = width / 2;
    this.add.text(centerX, height * 0.18, this.isRecord ? "¡Nuevo récord!" : "Resultados", {
      fontSize: "48px",
      color: this.isRecord ? "#ff6f91" : "#253053",
      fontStyle: "900"
    }).setOrigin(0.5);

    const rows = [
      ["Puntaje", Math.round(this.results.score).toLocaleString("es-CO")],
      ["Precisión", `${this.results.accuracy}%`],
      ["Combo máximo", `x${this.results.maxCombo}`],
      ["Fallos", this.results.misses],
      ["Notas", `${this.results.resolved}/${this.results.totalNotes}`]
    ];

    rows.forEach(([label, value], index) => {
      const y = height * 0.34 + index * 44;
      this.add.text(centerX - 130, y, label, { fontSize: "20px", color: "#64708f", fontStyle: "800" }).setOrigin(1, 0.5);
      this.add.text(centerX - 96, y, String(value), { fontSize: "24px", color: "#253053", fontStyle: "900" }).setOrigin(0, 0.5);
    });

    this.button(centerX - 120, height * 0.76, "Reintentar", () => {
      this.scene.start("GameScene", { difficulty: this.difficulty });
    }, 190, 0xff6f91, "#ffffff");
    this.button(centerX + 120, height * 0.76, "Menú", () => {
      this.scene.start("MenuScene");
    }, 160, 0xffffff, "#253053");
  }

  button(x, y, label, onClick, w, fill, color) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(fill, 1).fillRoundedRect(-w / 2, -29, w, 58, 8);
    g.lineStyle(2, 0x7b61ff, fill === 0xffffff ? 0.18 : 0).strokeRoundedRect(-w / 2, -29, w, 58, 8);
    c.add([g, this.add.text(0, 0, label, { fontSize: "19px", color, fontStyle: "900" }).setOrigin(0.5)]);
    c.setSize(w, 58).setInteractive({ useHandCursor: true }).on("pointerdown", onClick);
  }
}
