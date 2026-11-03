import { audioEngine } from "./audio/audioEngine.js";
import CONFIG from "./config.js";
import BootScene from "./game/BootScene.js";
import MenuScene from "./game/MenuScene.js";
import CalibrationScene from "./game/CalibrationScene.js";
import GameScene from "./game/GameScene.js";
import ResultsScene from "./game/ResultsScene.js";
import { bindTouchControls, hud } from "./ui/hud.js";

const gameConfig = {
  type: Phaser.AUTO,
  parent: "game-root",
  width: CONFIG.game.width,
  height: CONFIG.game.height,
  backgroundColor: CONFIG.game.background,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  render: {
    antialias: true,
    pixelArt: false
  },
  scene: [BootScene, MenuScene, CalibrationScene, GameScene, ResultsScene]
};

const game = new Phaser.Game(gameConfig);

bindTouchControls((lane, at) => {
  const scene = game.scene.getScene("GameScene");
  if (scene?.scene?.isActive()) {
    scene.handleLaneInput(lane, at);
  }
});

game.events.on("playing-state", (isPlaying) => {
  document.body.classList.toggle("is-playing", isPlaying);
  hud.setVisible(isPlaying);
});

const volumeInput = document.querySelector("#music-volume");
const volumeValue = document.querySelector("#volume-value");
volumeInput.value = Math.round(audioEngine.volume * 100);
volumeValue.value = `${volumeInput.value}%`;
volumeInput.addEventListener("input", () => {
  audioEngine.setVolume(Number(volumeInput.value) / 100);
  volumeValue.value = `${volumeInput.value}%`;
});
