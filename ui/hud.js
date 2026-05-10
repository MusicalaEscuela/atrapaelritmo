const hudRoot = document.querySelector("#hud");

function setText(name, value) {
  const el = hudRoot?.querySelector(`[data-hud="${name}"]`);
  if (el) el.textContent = value;
}

export const hud = {
  setVisible(isVisible) {
    hudRoot?.classList.toggle("hud--hidden", !isVisible);
  },
  update({ score, combo, accuracy, misses }) {
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
      onLane(Number(button.dataset.lane));
    });
  });
}
