export default class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    this.load.image("logo", "logo.png");
  }

  create() {
    this.scene.start("MenuScene");
  }
}
