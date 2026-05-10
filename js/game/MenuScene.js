import CONFIG from "../config.js";
import { getBestScore, getCalibrationOffset } from "../storage/scores.js";

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super("MenuScene");
    this.difficulty = "normal";
  }

  create() {
    this.game.events.emit("playing-state", false);
    this.cameras.main.setBackgroundColor("#fff8e8");
    this.drawBackground();
    this.drawMenu();
  }

  drawBackground() {
    const { width, height } = this.scale;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.42).fillCircle(width * 0.16, height * 0.22, 150);
    g.fillStyle(0x55a7ff, 0.16).fillCircle(width * 0.82, height * 0.18, 190);
    g.fillStyle(0xff6f91, 0.13).fillCircle(width * 0.88, height * 0.82, 210);

    for (let i = 0; i < 18; i += 1) {
      const x = (i * 83) % width;
      const y = 90 + ((i * 47) % Math.max(180, height - 180));
      g.fillStyle([0xff6f91, 0xffd166, 0x54d6a2, 0x55a7ff][i % 4], 0.25);
      g.fillRoundedRect(x, y, 18, 8, 4);
    }
  }

  drawMenu() {
    const { width, height } = this.scale;
    const centerX = width / 2;
    const logo = this.add.image(centerX, Math.max(70, height * 0.15), "logo").setScale(0.28);
    logo.setAlpha(0.96);

    this.add.text(centerX, height * 0.28, CONFIG.title, {
      fontFamily: "Inter, Segoe UI, sans-serif",
      fontSize: `${Math.min(62, width * 0.08)}px`,
      color: "#253053",
      fontStyle: "900",
      align: "center"
    }).setOrigin(0.5);

    this.add.text(centerX, height * 0.36, "Musicala", {
      fontSize: "24px",
      color: "#7b61ff",
      fontStyle: "800"
    }).setOrigin(0.5);

    this.add.text(centerX, height * 0.43, "Acompaña el pulso con A S D F. Mira caer las notas y golpea justo en la zona musical.", {
      fontSize: "18px",
      color: "#64708f",
      align: "center",
      wordWrap: { width: Math.min(620, width - 48) }
    }).setOrigin(0.5);

    const y = height * 0.56;
    Object.entries(CONFIG.difficulties).forEach(([key, diff], index) => {
      this.createButton(centerX - 170 + index * 170, y, diff.label, () => {
        this.difficulty = key;
        this.scene.restart();
      }, key === this.difficulty ? 0x7b61ff : 0xffffff, key === this.difficulty ? "#ffffff" : "#253053", 132);
    });

    this.createButton(centerX, y + 94, "Jugar", () => {
      this.scene.start("GameScene", { difficulty: this.difficulty });
    }, 0xff6f91, "#ffffff", 210);

    this.createButton(centerX, y + 168, `Calibrar (${getCalibrationOffset()} ms)`, () => {
      this.scene.start("CalibrationScene", { difficulty: this.difficulty });
    }, 0xffffff, "#253053", 230);

    this.add.text(centerX, height - 38, `Mejor puntaje: ${getBestScore().toLocaleString("es-CO")}`, {
      fontSize: "18px",
      color: "#253053",
      fontStyle: "800"
    }).setOrigin(0.5);
  }

  createButton(x, y, label, onClick, fill, color, width = 160) {
    const button = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(fill, 1).fillRoundedRect(-width / 2, -27, width, 54, 8);
    bg.lineStyle(2, 0x253053, fill === 0xffffff ? 0.12 : 0).strokeRoundedRect(-width / 2, -27, width, 54, 8);
    const text = this.add.text(0, 0, label, { fontSize: "18px", color, fontStyle: "900" }).setOrigin(0.5);
    button.add([bg, text]);
    button.setSize(width, 54).setInteractive({ useHandCursor: true });
    button.on("pointerdown", onClick);
    return button;
  }
}
