import { usesTouchControls } from "../ui/device.js";
import { levelSettings } from "../rhythm/levels.js";
import CONFIG from "../config.js";
import { getBestScore, getUnlockedLevel } from "../storage/scores.js";

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super("MenuScene");
    this.difficulty = "normal";
  }

  create(data = {}) {
    this.difficulty = data.difficulty || this.difficulty;
    const unlocked = getUnlockedLevel(this.difficulty);
    this.level = Math.max(1, Math.min(unlocked, Number.isSafeInteger(data.level) ? data.level : unlocked));
    this.game.events.emit("playing-state", false);
    this.cameras.main.setBackgroundColor("#fff8e8");
    this.drawBackground();
    this.drawMenu();
    const redraw = () => { this.children.removeAll(true); this.drawBackground(); this.drawMenu(); };
    this.scale.on("resize", redraw);
    this.events.once("shutdown", () => this.scale.off("resize", redraw));
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
    const firstChild = this.children.length;
    const cx = width / 2;
    const compact = height < 560;
    const top = Math.max(24, (height - 620) / 2);
    this.add.image(cx, top + 24, "logo").setDisplaySize(110, 55);
    this.add.text(cx, top + 78, "S I E N T E  ·  T O C A  ·  C O N E C T A", {
      fontSize: `${width < 400 ? 10 : 12}px`, color: "#7b61ff", fontStyle: "bold"
    }).setOrigin(0.5);
    this.add.text(cx, top + (compact ? 120 : 146), "Atrapa el\nritmo", {
      fontFamily: "Segoe UI, sans-serif", fontSize: `${Math.min(compact ? 42 : 62, width * 0.14)}px`,
      color: "#253053", fontStyle: "bold", align: "center", lineSpacing: -8
    }).setOrigin(0.5);
    const infoY = top + (compact ? 188 : 242);
    this.add.text(cx, infoY, usesTouchControls()
      ? "Toca el símbolo cuando la nota\nllegue a la franja de su color."
      : "Usa A · S · D · F cuando las notas\nlleguen a la franja de su color.", {
      fontSize: "16px", color: "#64708f", align: "center", lineSpacing: 5
    }).setOrigin(0.5);
    const y = infoY + 72;
    const step = Math.min(165, (width - 24) / 3);
    Object.entries(CONFIG.difficulties).forEach(([key, diff], index) => {
      this.createButton(cx + (index - 1) * step, y, diff.label, () => {
        this.difficulty = key;
        this.scene.restart({ difficulty: key });
      }, key === this.difficulty ? 0x7b61ff : 0xffffff, key === this.difficulty ? "#ffffff" : "#253053", step - 10);
    });
    const settings = levelSettings(this.difficulty, this.level);
    this.add.text(cx, y + 43, `Nivel ${this.level} · ${settings.bpm} BPM · ${settings.notesPerBar} notas/compás`, {
      fontSize: `${width < 400 ? 11 : 13}px`, color: "#64708f"
    }).setOrigin(0.5);
    this.createButton(cx, y + 96, `▶  Jugar nivel ${this.level}`, () => {
      this.scene.start("GameScene", { difficulty: this.difficulty, level: this.level });
    }, 0xff6f91, "#ffffff", Math.min(300, width - 48));
    this.createButton(cx, y + 164, "Ajustar con mis toques", () => {
      this.scene.start("CalibrationScene", { difficulty: this.difficulty, level: this.level });
    }, 0xffffff, "#253053", Math.min(300, width - 48));
    const unlocked = getUnlockedLevel(this.difficulty);
    const previous = this.createButton(cx - 118, y + 222, "‹", () => {
      this.scene.restart({ difficulty: this.difficulty, level: this.level - 1 });
    }, 0xffffff, "#253053", 48);
    const next = this.createButton(cx + 118, y + 222, "›", () => {
      this.scene.restart({ difficulty: this.difficulty, level: this.level + 1 });
    }, 0xffffff, "#253053", 48);
    if (this.level <= 1) previous.disableInteractive().setAlpha(0.35);
    if (this.level >= unlocked) next.disableInteractive().setAlpha(0.35);
    this.add.text(cx, y + 222, `${unlocked} ${unlocked === 1 ? "nivel disponible" : "niveles disponibles"}`, {
      fontSize: "13px", color: "#64708f"
    }).setOrigin(0.5);
    this.add.text(cx, y + 274, `✦ Tu récord: ${getBestScore().toLocaleString("es-CO")}`, {
      fontSize: "16px", color: "#7b61ff", fontStyle: "bold"
    }).setOrigin(0.5);
    const content = this.children.list.slice(firstChild);
    const lastY = y + 296;
    if (lastY > height) {
      const factor = (height - 16) / lastY;
      content.forEach(child => { child.setPosition(cx + (child.x - cx) * factor, child.y * factor); child.setScale(child.scaleX * factor, child.scaleY * factor); });
    }
  }

  createButton(x, y, label, onClick, fill, color, width = 160) {
    const button = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(fill, 1).fillRoundedRect(-width / 2, -27, width, 54, 18);
    bg.lineStyle(2, 0x253053, fill === 0xffffff ? 0.12 : 0).strokeRoundedRect(-width / 2, -27, width, 54, 18);
    const text = this.add.text(0, 0, label, { fontSize: "18px", color, fontStyle: "900" }).setOrigin(0.5);
    button.add([bg, text]);
    button.setSize(width, 54).setInteractive({ useHandCursor: true });
    button.on("pointerover", () => button.setAlpha(0.85));
    button.on("pointerout", () => button.setAlpha(1));
    button.on("pointerdown", onClick);
    return button;
  }
}
