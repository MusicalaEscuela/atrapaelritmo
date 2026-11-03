import { getBestScore, saveBestScore, unlockNextLevel } from "../storage/scores.js";
import { passedLevel } from "../rhythm/levels.js";

export default class ResultsScene extends Phaser.Scene {
  constructor() { super("ResultsScene"); }

  create(data) {
    this.results = data.results;
    this.difficulty = data.difficulty || "normal";
    this.level = data.level || this.results.level || 1;
    this.passed = passedLevel(this.results);
    if (this.passed) unlockNextLevel(this.difficulty, this.level);
    const previousBest = getBestScore();
    this.isRecord = saveBestScore(this.results.score) > previousBest;
    this.game.events.emit("playing-state", false);
    this.cameras.main.setBackgroundColor("#fff8e8");
    this.draw();
    const redraw = () => { this.children.removeAll(true); this.draw(); };
    this.scale.on("resize", redraw);
    this.events.once("shutdown", () => this.scale.off("resize", redraw));
  }

  draw() {
    const { width, height } = this.scale;
    const cx = width / 2;
    // Use a fixed logical height and fit it on short screens.
    const h = Math.max(580, Math.min(720, height));
    const top = Math.max(0, (height - h) / 2);
    const label = (y, value, size, color = "#253053") => this.add.text(cx, top + y, value, {
      fontFamily: "Segoe UI, sans-serif", fontSize: `${size}px`, color, align: "center",
      wordWrap: { width: width - 32 }
    }).setOrigin(0.5);
    label(72, this.passed ? `¡Nivel ${this.level} superado!` : `Nivel ${this.level} · ¡Otra vez!`, Math.min(42, width * 0.085), "#7b61ff");
    label(120, this.passed ? `Desbloqueaste el nivel ${this.level + 1}` : "Se alcanzó el límite de fallos. ¡Sigue practicando!", 17, "#64708f");
    if (this.isRecord) label(155, "✦ ¡Nuevo récord!", 18, "#e8577f");
    const rows = [
      ["Puntaje", Math.round(this.results.score).toLocaleString("es-CO")],
      ["Precisión", `${this.results.accuracy}%`],
      ["Combo máximo", `x${this.results.maxCombo}`],
      ["Fallos", this.results.misses],
      ["Notas", `${this.results.resolved}/${this.results.totalNotes}`]
    ];
    rows.forEach(([key, value], i) => {
      const y = top + 205 + i * 36;
      this.add.text(cx - 10, y, key, { fontFamily: "Segoe UI, sans-serif", fontSize: "18px", color: "#64708f" }).setOrigin(1, 0.5);
      this.add.text(cx + 10, y, String(value), { fontFamily: "Segoe UI, sans-serif", fontSize: "22px", color: "#253053", fontStyle: "bold" }).setOrigin(0, 0.5);
    });
    this.button(cx, top + 420, this.passed ? `Seguir al nivel ${this.level + 1} →` : "Reintentar nivel", () => {
      this.scene.start("GameScene", { difficulty: this.difficulty, level: this.passed ? this.level + 1 : this.level });
    }, Math.min(320, width - 40), 0xff6f91, "#ffffff");
    if (this.passed) this.button(cx, top + 485, "Repetir este nivel", () => {
      this.scene.start("GameScene", { difficulty: this.difficulty, level: this.level });
    }, Math.min(320, width - 40), 0xffffff, "#253053");
    this.button(cx, top + (this.passed ? 550 : 485), "Volver al menú", () => {
      this.scene.start("MenuScene", { difficulty: this.difficulty, level: this.passed ? this.level + 1 : this.level });
    }, Math.min(320, width - 40), 0xffffff, "#253053");
    if (h > height) {
      const ratio = height / h;
      this.children.list.forEach(child => {
        child.setPosition(cx + (child.x - cx) * ratio, child.y * ratio);
        child.setScale(ratio);
      });
    }
  }

  button(x, y, label, onClick, width, fill, color) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(fill).fillRoundedRect(-width / 2, -26, width, 52, 18);
    c.add([g, this.add.text(0, 0, label, { fontFamily: "Segoe UI, sans-serif", fontSize: "18px", color, fontStyle: "bold" }).setOrigin(0.5)]);
    c.setSize(width, 52).setInteractive({ useHandCursor: true }).on("pointerdown", onClick);
  }
}
