import { getCalibrationOffset, saveCalibrationOffset } from "../storage/scores.js";

export default class CalibrationScene extends Phaser.Scene {
  constructor() {
    super("CalibrationScene");
  }

  create(data) {
    this.difficulty = data.difficulty || "normal";
    this.offset = getCalibrationOffset();
    this.cameras.main.setBackgroundColor("#f6fbff");
    this.render();
  }

  render() {
    this.children.removeAll();
    const { width, height } = this.scale;
    this.add.text(width / 2, height * 0.2, "Calibración", {
      fontSize: "46px",
      color: "#253053",
      fontStyle: "900"
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.33, "Ajusta el offset si sientes que debes tocar antes o después del golpe.", {
      fontSize: "19px",
      color: "#64708f",
      align: "center",
      wordWrap: { width: Math.min(620, width - 40) }
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.48, `${this.offset} ms`, {
      fontSize: "64px",
      color: "#7b61ff",
      fontStyle: "900"
    }).setOrigin(0.5);

    this.button(width / 2 - 180, height * 0.62, "-10 ms", () => this.change(-10));
    this.button(width / 2, height * 0.62, "0 ms", () => this.setZero());
    this.button(width / 2 + 180, height * 0.62, "+10 ms", () => this.change(10));
    this.button(width / 2, height * 0.78, "Guardar y volver", () => {
      saveCalibrationOffset(this.offset);
      this.scene.start("MenuScene", { difficulty: this.difficulty });
    }, 240, 0xff6f91, "#ffffff");
  }

  change(delta) {
    this.offset = Phaser.Math.Clamp(this.offset + delta, -220, 220);
    this.render();
  }

  setZero() {
    this.offset = 0;
    this.render();
  }

  button(x, y, label, onClick, w = 138, fill = 0xffffff, color = "#253053") {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(fill, 1).fillRoundedRect(-w / 2, -28, w, 56, 8);
    g.lineStyle(2, 0x7b61ff, 0.18).strokeRoundedRect(-w / 2, -28, w, 56, 8);
    c.add([g, this.add.text(0, 0, label, { fontSize: "18px", color, fontStyle: "900" }).setOrigin(0.5)]);
    c.setSize(w, 56).setInteractive({ useHandCursor: true }).on("pointerdown", onClick);
  }
}
