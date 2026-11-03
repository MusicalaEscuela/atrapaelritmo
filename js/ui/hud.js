const hudRoot = document.querySelector("#hud");

function setText(name, value) {
  const el = hudRoot?.querySelector(`[data-hud="${name}"]`);
  if (el) el.textContent = value;
}

export const hud = {
  setVisible(isVisible) {
    hudRoot?.classList.toggle("hud--hidden", !isVisible);
    document.querySelector("#level-badge")?.classList.toggle("hud--hidden", !isVisible);
  },
  update({ score, combo, accuracy, misses, level = 1, difficulty = "" }) {
    const badge = document.querySelector("#level-badge");
    if (badge) badge.textContent = `Nivel ${level} · ${difficulty}`;
    setText("score", Math.round(score).toLocaleString("es-CO"));
    setText("combo", `x${combo}`);
    setText("accuracy", `${accuracy}%`);
    setText("misses", misses);
  }
};

export function bindTouchControls(onLane) {
  document.querySelectorAll("[data-lane]").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.classList.add("is-pressed");
      button.setPointerCapture(event.pointerId);
      onLane(Number(button.dataset.lane), event.timeStamp);
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(type => {
      button.addEventListener(type, () => button.classList.remove("is-pressed"));
    });
  });
}
