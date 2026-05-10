import CONFIG from "../config.js";
import RhythmEngine from "../rhythm/rhythmEngine.js";
import { getCalibrationOffset } from "../storage/scores.js";
import { hud } from "../ui/hud.js";

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
    this.engine = null;
    this.noteViews = new Map();
    this.hitMarkers = [];
  }

  create(data) {
    this.difficulty = data.difficulty || "normal";
    this.engine = new RhythmEngine(this.difficulty, getCalibrationOffset());
    this.noteViews.clear();
    this.hitMarkers = [];
    this.game.events.emit("playing-state", true);
    this.cameras.main.setBackgroundColor("#fff8e8");
    this.layout = this.computeLayout();
    this.createStage();
    this.createInput();
    hud.update(this.engine.snapshot());
    this.startRun();
  }

  async startRun() {
    await this.engine.start();
  }

  computeLayout() {
    const { width, height } = this.scale;
    const top = Math.max(92, height * 0.16);
    const bottom = height - (width < 700 ? 102 : 54);
    const laneGap = Math.max(8, width * 0.012);
    const playWidth = Math.min(width - 32, 760);
    const laneWidth = (playWidth - laneGap * 3) / 4;
    const startX = (width - playWidth) / 2;
    const hitY = bottom - 72;
    const spawnY = top + 16;
    return { width, height, top, bottom, laneGap, playWidth, laneWidth, startX, hitY, spawnY };
  }

  createStage() {
    const l = this.layout;
    this.bg = this.add.graphics();
    this.bg.fillStyle(0xffffff, 0.34).fillRoundedRect(l.startX - 16, l.top - 18, l.playWidth + 32, l.bottom - l.top + 36, 8);
    this.bg.lineStyle(3, 0x7b61ff, 0.16).strokeRoundedRect(l.startX - 16, l.top - 18, l.playWidth + 32, l.bottom - l.top + 36, 8);

    this.laneGraphics = this.add.graphics();
    CONFIG.lanes.forEach((lane, index) => {
      const x = l.startX + index * (l.laneWidth + l.laneGap);
      this.laneGraphics.fillStyle(0xffffff, 0.72).fillRoundedRect(x, l.top, l.laneWidth, l.bottom - l.top, 8);
      this.laneGraphics.fillStyle(lane.color, 0.12).fillRoundedRect(x + 5, l.top + 5, l.laneWidth - 10, l.bottom - l.top - 10, 8);
      this.laneGraphics.lineStyle(3, lane.color, 0.28).strokeRoundedRect(x, l.top, l.laneWidth, l.bottom - l.top, 8);
      this.laneGraphics.fillStyle(lane.color, 0.92).fillRoundedRect(x + 10, l.hitY - 18, l.laneWidth - 20, 36, 8);

      const marker = this.add.rectangle(x + l.laneWidth / 2, l.hitY, l.laneWidth - 22, 34, lane.color, 0.18)
        .setStrokeStyle(2, 0xffffff, 0.7);
      this.hitMarkers.push(marker);

      this.add.text(x + l.laneWidth / 2, l.bottom + 18, lane.key, {
        fontSize: "28px",
        color: "#253053",
        fontStyle: "900"
      }).setOrigin(0.5);
      this.add.text(x + l.laneWidth / 2, l.top - 26, lane.label, {
        fontSize: "14px",
        color: "#64708f",
        fontStyle: "800"
      }).setOrigin(0.5);
    });

    this.feedbackText = this.add.text(l.width / 2, l.top + 28, "1, 2, 3, 4...", {
      fontSize: "34px",
      color: "#7b61ff",
      fontStyle: "900"
    }).setOrigin(0.5).setAlpha(0);

    this.comboBurst = this.add.text(l.width / 2, l.top + 72, "", {
      fontSize: "24px",
      color: "#ff6f91",
      fontStyle: "900"
    }).setOrigin(0.5);
  }

  createInput() {
    this.input.keyboard.on("keydown", (event) => {
      const lane = CONFIG.lanes.findIndex((item) => item.code === event.code);
      if (lane >= 0) this.handleLaneInput(lane);
    });
  }

  update() {
    if (!this.engine) return;
    const audioTime = this.engine.audioTime();
    this.engine.updateMisses(audioTime);
    this.renderNotes(audioTime);
    this.renderCountIn(audioTime);
    this.renderBeatPulse(audioTime);
    hud.update(this.engine.snapshot());

    if (this.engine.isFinished) {
      const results = this.engine.snapshot();
      this.engine.stop();
      this.game.events.emit("playing-state", false);
      this.scene.start("ResultsScene", { results, difficulty: this.difficulty });
    }
  }

  renderCountIn(audioTime) {
    const beat = this.engine.plan.beat;
    const countIn = this.engine.plan.countIn;
    if (audioTime < countIn) {
      const count = Math.min(4, Math.floor(audioTime / beat) + 1);
      this.feedbackText.setText(String(count)).setAlpha(1);
      this.feedbackText.setScale(1 + (1 - ((audioTime % beat) / beat)) * 0.35);
    } else if (audioTime < countIn + 0.5) {
      this.feedbackText.setText("¡Vamos!").setAlpha(1);
      this.feedbackText.setScale(1);
    } else if (!this.feedbackLock) {
      this.feedbackText.setAlpha(0);
    }
  }

  renderBeatPulse(audioTime) {
    if (!this.engine?.plan?.beat) return;
    const beat = this.engine.plan.beat;
    const pulse = 1 - ((audioTime % beat) / beat);
    const scaleY = 1 + pulse * 0.22;
    const alpha = 0.2 + pulse * 0.26;
    this.hitMarkers.forEach((marker) => {
      marker.setScale(1, scaleY);
      marker.setAlpha(alpha);
    });
  }

  renderNotes(audioTime) {
    const visible = new Set();
    for (const note of this.engine.visibleNotes(audioTime)) {
      visible.add(note.id);
      let view = this.noteViews.get(note.id);
      if (!view) {
        view = this.createNoteView(note);
        this.noteViews.set(note.id, view);
      }
      const progress = Phaser.Math.Clamp((audioTime - note.spawnTime) / this.engine.plan.fallDuration, 0, 1);
      const y = Phaser.Math.Linear(this.layout.spawnY, this.layout.hitY, progress);
      view.setY(y);
      view.setAlpha(Phaser.Math.Clamp(progress * 1.3, 0.22, 1));
      view.setScale(0.88 + progress * 0.16);
    }

    for (const [id, view] of this.noteViews.entries()) {
      if (!visible.has(id)) {
        view.destroy();
        this.noteViews.delete(id);
      }
    }
  }

  createNoteView(note) {
    const lane = CONFIG.lanes[note.lane];
    const x = this.layout.startX + note.lane * (this.layout.laneWidth + this.layout.laneGap) + this.layout.laneWidth / 2;
    const c = this.add.container(x, this.layout.spawnY);
    const g = this.add.graphics();
    g.fillStyle(lane.color, 1).fillCircle(0, 0, Math.min(34, this.layout.laneWidth * 0.28));
    g.fillStyle(0xffffff, 0.82).fillCircle(-8, -8, 9);
    g.lineStyle(4, 0xffffff, 0.75).strokeCircle(0, 0, Math.min(39, this.layout.laneWidth * 0.32));
    c.add([g, this.add.text(0, 1, lane.key, { fontSize: "22px", color: "#253053", fontStyle: "900" }).setOrigin(0.5)]);
    return c;
  }

  handleLaneInput(lane) {
    if (!this.engine || this.engine.isFinished) return;
    const result = this.engine.hitLane(lane);
    this.flashLane(lane, result.type);
    this.showFeedback(result);
    if (result.type === "miss") {
      this.cameras.main.shake(90, 0.004);
    }
  }

  flashLane(lane, type) {
    const l = this.layout;
    const laneConfig = CONFIG.lanes[lane];
    const x = l.startX + lane * (l.laneWidth + l.laneGap) + l.laneWidth / 2;
    const color = type === "miss" ? 0xff4d6d : laneConfig.color;
    const isPerfect = type === "perfect";
    const isGood = type === "good";
    const ring = this.add.circle(x, l.hitY, Math.min(isPerfect ? 62 : 52, l.laneWidth * 0.5), color, isGood ? 0.18 : 0.3);
    this.tweens.add({
      targets: ring,
      scale: isPerfect ? 2.3 : 1.7,
      alpha: 0,
      duration: isPerfect ? 360 : 240,
      ease: "Quad.easeOut",
      onComplete: () => ring.destroy()
    });

    const particleCount = isPerfect ? 18 : isGood ? 8 : 5;
    for (let i = 0; i < particleCount; i += 1) {
      const dot = this.add.circle(x, l.hitY, isPerfect ? 5 : 4, color, isGood ? 0.65 : 0.9);
      this.tweens.add({
        targets: dot,
        x: x + Phaser.Math.Between(isPerfect ? -96 : -58, isPerfect ? 96 : 58),
        y: l.hitY + Phaser.Math.Between(isPerfect ? -96 : -48, 28),
        alpha: 0,
        duration: isPerfect ? 520 : 320,
        ease: "Sine.easeOut",
        onComplete: () => dot.destroy()
      });
    }
  }

  showFeedback(result) {
    const palette = { perfect: "#ff6f91", good: "#319b78", bad: "#c88700", miss: "#e84565" };
    const label = result.type === "bad" && result.deltaMs < 0 ? "Temprano" : result.label;
    const yOffset = result.type === "bad" ? (result.deltaMs < 0 ? -16 : 16) : 0;
    this.feedbackLock = true;
    this.feedbackText.setText(label).setColor(palette[result.type] || "#253053").setAlpha(1).setScale(1);
    this.feedbackText.setY(this.layout.top + 28 + yOffset);
    this.tweens.killTweensOf(this.feedbackText);
    this.tweens.add({
      targets: this.feedbackText,
      scale: result.type === "perfect" ? 1.42 : result.type === "good" ? 1.16 : 1.24,
      yoyo: true,
      duration: result.type === "perfect" ? 110 : 80,
      onComplete: () => {
        this.time.delayedCall(260, () => {
          this.feedbackLock = false;
          this.feedbackText.setAlpha(0);
          this.feedbackText.setY(this.layout.top + 28);
        });
      }
    });

    const snap = this.engine.snapshot();
    if (snap.combo > 0 && snap.combo % 10 === 0) {
      this.showComboCelebration(snap.combo, true);
    } else if (snap.combo > 0 && snap.combo % 5 === 0) {
      this.showComboCelebration(snap.combo, false);
    } else if (snap.combo >= 6) {
      this.comboBurst.setText(`Combo x${snap.combo}`).setAlpha(1).setScale(1).setColor("#ff6f91");
      this.tweens.add({
        targets: this.comboBurst,
        y: this.layout.top + 54,
        alpha: 0,
        duration: 420,
        onComplete: () => this.comboBurst.setY(this.layout.top + 72)
      });
    }
  }

  showComboCelebration(combo, major) {
    this.comboBurst.setText(major ? `¡Combo x${combo}!` : `Combo x${combo}`)
      .setAlpha(1)
      .setScale(major ? 1.4 : 1.15)
      .setColor(major ? "#7b61ff" : "#ff6f91");
    this.tweens.killTweensOf(this.comboBurst);
    this.tweens.add({
      targets: this.comboBurst,
      y: this.layout.top + (major ? 42 : 52),
      scale: major ? 1.72 : 1.34,
      alpha: 0,
      duration: major ? 680 : 480,
      ease: "Back.easeOut",
      onComplete: () => {
        this.comboBurst.setY(this.layout.top + 72);
      }
    });
    if (major) {
      this.cameras.main.flash(120, 255, 255, 255, false);
    }
  }
}
