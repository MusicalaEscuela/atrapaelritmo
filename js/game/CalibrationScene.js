import { audioEngine } from "../audio/audioEngine.js";
import { saveCalibrationOffset } from "../storage/scores.js";
import { estimateCalibration } from "../rhythm/calibration.js";
import { usesTouchControls } from "../ui/device.js";

const BEAT = 60 / 90;
const WARMUP = 4;
const TOTAL = 16;

export default class CalibrationScene extends Phaser.Scene {
  constructor() { super("CalibrationScene"); }

  create(data) {
    this.difficulty = data.difficulty || "normal";
    this.level = data.level || 1;
    this.phase = "idle";
    this.session = 0;
    this.samples = [];
    this.tappedBeats = new Set();
    this.cameras.main.setBackgroundColor("#f6fbff");
    this.game.events.emit("playing-state", false);
    this.render();
    const redraw = () => this.render();
    const keydown = event => {
      if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat) this.tap(event.timeStamp);
      }
    };
    this.scale.on("resize", redraw);
    this.input.keyboard.on("keydown", keydown);
    this.events.once("shutdown", () => {
      this.session += 1;
      audioEngine.stop();
      this.scale.off("resize", redraw);
      this.input.keyboard.off("keydown", keydown);
    });
  }

  async begin() {
    if (this.phase === "starting" || this.phase === "running") return;
    if (audioEngine.volume === 0) {
      this.message = "Sube el volumen de arriba para escuchar los golpes.";
      this.render();
      return;
    }
    this.message = "";
    const session = ++this.session;
    this.phase = "starting";
    this.render();
    try {
      await audioEngine.init();
      if (session !== this.session) return;
      audioEngine.stop();
      this.samples = [];
      this.tappedBeats = new Set();
      this.firstBeat = audioEngine.now() + 0.6;
      for (let i = 0; i < TOTAL; i += 1) {
        audioEngine.scheduleBell(this.firstBeat + i * BEAT, 880, 1);
      }
      this.phase = "running";
      this.render();
    } catch {
      this.phase = "idle";
      this.message = "No se pudo iniciar el sonido. Toca Empezar para intentarlo de nuevo.";
      this.render();
    }
  }

  tap(at) {
    if (this.phase !== "running") return;
    const relative = audioEngine.audibleNow(at) - this.firstBeat;
    const index = Math.round(relative / BEAT);
    if (index < WARMUP || index >= TOTAL || this.tappedBeats.has(index)) return;
    const delta = (relative - index * BEAT) * 1000;
    if (Math.abs(delta) > 260) return;
    this.tappedBeats.add(index);
    this.samples.push(delta);
    this.pad.setFillStyle(0xff6f91);
    this.time.delayedCall(100, () => {
      if (this.phase === "running") this.pad.setFillStyle(0x7b61ff);
    });
  }

  update() {
    if (this.phase !== "running") return;
    const elapsed = audioEngine.audibleNow() - this.firstBeat;
    if (elapsed > (TOTAL - 1) * BEAT + 0.3) {
      audioEngine.stop();
      this.result = estimateCalibration(this.samples);
      this.phase = "result";
      this.render();
      return;
    }
    const beat = Math.floor(elapsed / BEAT);
    this.status.setText(beat < 0 ? "Prepárate…" : beat < WARMUP
      ? `Solo escucha · ${beat + 1} de 4`
      : `¡Ahora toca! · ${this.samples.length} de 12`);
  }

  render() {
    this.children.removeAll(true);
    const { width: w, height: h } = this.scale;
    const cx = w / 2;
    const text = (y, label, size = 18, color = "#253053") => this.add.text(cx, h * y, label, {
      fontFamily: "Segoe UI, sans-serif", fontSize: `${size}px`, color,
      align: "center", wordWrap: { width: Math.min(540, w - 36) }
    }).setOrigin(0.5);
    text(0.15, "Encuentra tu ritmo", Math.min(36, w * 0.085));
    const running = this.phase === "running" || this.phase === "starting";
    if (this.phase === "result") {
      text(0.31, this.result.ok ? "¡Listo! Ya tenemos tu ajuste." : "Vamos a repetirlo", 23, "#7b61ff");
      text(0.46, this.result.ok
        ? "Se usará en este dispositivo. Si cambias de audífonos o altavoz, puedes repetirlo."
        : this.result.reason, 18, "#64708f");
      if (this.result.ok) this.button(0.66, "Aplicar y jugar", () => {
        saveCalibrationOffset(this.result.offset);
        this.scene.start("GameScene", { difficulty: this.difficulty, level: this.level });
      }, true);
      this.button(0.80, "Volver a intentarlo", () => this.begin(), !this.result.ok);
    } else {
      text(0.29, "1. Escucha cuatro golpes sin tocar.\n2. Sigue los siguientes doce con tus toques.", 17, "#64708f");
      const r = Math.min(62, h * 0.105);
      this.pad = this.add.circle(cx, h * 0.49, r, 0x7b61ff);
      this.pad.setInteractive({ useHandCursor: true }).on("pointerdown", pointer => this.tap(pointer.event?.timeStamp));
      text(0.49, "TOCA", 24, "#ffffff");
      this.status = text(0.64, this.message || (running ? "Prepárate…" : usesTouchControls()
        ? "Toca el círculo al escuchar cada golpe." : "Toca el círculo o usa la barra espaciadora."), 16, "#64708f");
      if (!running) this.button(0.79, "Empezar", () => this.begin(), true);
    }
    this.button(0.93, running ? "Cancelar" : "Volver al menú", () => this.scene.start("MenuScene", { difficulty: this.difficulty, level: this.level }));
  }

  button(y, label, action, primary = false) {
    const { width, height } = this.scale;
    const w = Math.min(300, width - 40);
    const c = this.add.container(width / 2, height * y);
    const bg = this.add.graphics();
    bg.fillStyle(primary ? 0xff6f91 : 0xffffff).fillRoundedRect(-w / 2, -23, w, 46, 16);
    c.add([bg, this.add.text(0, 0, label, { fontSize: "17px", color: primary ? "#ffffff" : "#253053" }).setOrigin(0.5)]);
    c.setSize(w, 46).setInteractive({ useHandCursor: true }).on("pointerdown", action);
  }
}
