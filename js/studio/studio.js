import { SONGS, PARTS } from "./songs.js";
import { StudioSound } from "./sound.js";
import { MODES, makeSession, closestNote, HIT_WINDOW, PERFECT_WINDOW, measure } from "./session.js";
import { getCalibrationOffset } from "../storage/scores.js";

const studio = document.querySelector("#studio");
const classic = document.querySelector(".app-shell");
const ui = Object.fromEntries([...studio.querySelectorAll("[data-studio]")]
  .map(element => [element.dataset.studio, element]));
const sound = new StudioSound();
const keys = ["KeyA", "KeyS", "KeyD", "KeyF"];
const symbols = ["●", "◆", "▲", "✦"];
const held = new Map();
let request = 0;
let run;
let mode = "band";
let frame;
let timer;

function option(value, label) {
  return new Option(label, value);
}

function show(which) {
  [ui.setup, ui.play, ui.results].forEach(panel => { panel.hidden = panel !== ui[which]; });
}

function updateOptions() {
  const song = SONGS.find(item => item.id === ui.song.value);
  ui.songInfo.textContent = `${song.style} · ${song.bpm} BPM · ${song.signature}`;
  ui.partLabel.hidden = mode === "pulse";
  ui.blindLabel.hidden = mode !== "echo";
  ui.barsLabel.hidden = mode !== "practice";
  ui.help.textContent = MODES[mode].description;
  ui.modes.querySelectorAll("button").forEach(button => {
    button.setAttribute("aria-pressed", button.dataset.mode === mode);
  });
}

function mix() {
  if (sound.ctx && sound.band) sound.setVolumes(Number(ui.band.value), Number(ui.player.value));
}

function stop() {
  request++;
  run = undefined;
  cancelAnimationFrame(frame);
  clearInterval(timer);
  sound.stop();
  held.clear();
  ui.pads.querySelectorAll("button").forEach(button => button.classList.remove("pressed"));
  ui.start.disabled = false;
}

function format(result, isPulse) {
  const offset = result.average === null ? "Sin suficientes aciertos para medir el desfase"
    : Math.abs(result.average) < .01 ? "A tiempo en promedio"
    : `${Math.round(Math.abs(result.average) * 1000)} ms ${result.average < 0 ? "antes" : "después"} del pulso en promedio`;
  const tempo = isPulse && result.tempo ? ` · ${Math.round(result.tempo)} BPM sin guía` : "";
  return `${result.hits}/${result.total} aciertos · ${result.perfect} precisos · ${offset}${tempo}`;
}

function setFeedback(label) {
  ui.feedback.textContent = label;
}

function buildBoard(pulse) {
  ui.track.replaceChildren();
  ui.pads.replaceChildren();
  ui.track.classList.toggle("single", pulse);
  ui.pads.classList.toggle("single", pulse);
  return symbols.slice(0, pulse ? 1 : 4).map((symbol, lane) => {
    const column = document.createElement("div");
    column.className = `studio-lane lane-${lane}`;
    ui.track.append(column);

    const pad = document.createElement("button");
    pad.type = "button";
    pad.textContent = pulse ? "Marcar pulso" : `${symbol}  ${"ASDF"[lane]}`;
    pad.className = `studio-pad lane-${lane}`;
    pad.setAttribute("aria-label", pulse ? "Marcar pulso" : `Pad ${"ASDF"[lane]}`);
    pad.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      event.preventDefault();
      pad.setPointerCapture(event.pointerId);
      press(lane, event.timeStamp);
    });
    pad.addEventListener("pointerup", event => release(lane, event.timeStamp));
    pad.addEventListener("pointercancel", () => drop(lane));
    pad.addEventListener("lostpointercapture", () => drop(lane));
    pad.addEventListener("click", event => {
      if (event.detail !== 0) return;
      press(lane, event.timeStamp);
      release(lane, event.timeStamp);
    });
    ui.pads.append(pad);
    return { column, pad };
  });
}

function beginRound(start) {
  run.start = start;
  run.index = 0;
  run.columns.forEach(({ column }) => column.replaceChildren());
  run.notes = run.plan.targets.map(note => {
    const marker = document.createElement("div");
    marker.className = `studio-note${note.duration ? " held" : ""}${note.accent ? " accent" : ""}`;
    marker.textContent = symbols[note.lane];
    marker.hidden = true;
    if (note.duration) marker.style.setProperty("--tail", `${note.duration / 1.65 * 75}cqh`);
    run.columns[note.lane].column.append(marker);
    return { ...note, marker };
  });
}

async function start() {
  stop();
  show("setup");
  const token = request;
  const song = SONGS.find(item => item.id === ui.song.value);
  const selectedMode = mode;
  const part = ui.part.value;
  const plan = makeSession(song, {
    mode: selectedMode, part, speed: Number(ui.speed.value),
    firstBar: selectedMode === "practice" ? Number(ui.bars.value) : 0,
    blind: ui.blind.checked
  });

  ui.start.disabled = true;
  ui.notice.textContent = "Cargando instrumentos…";
  try {
    await sound.prepare([...plan.backing, ...plan.targets]);
    if (request !== token) return;
    if (sound.ctx.state !== "running") throw new Error("Audio suspendido");
    mix();
    const columns = buildBoard(selectedMode === "pulse");
    run = { plan, columns, mode: selectedMode, offset: getCalibrationOffset() / 1000, cycles: 0 };
    beginRound(sound.ctx.currentTime + plan.meter * plan.beatSeconds + .12);
    ui.notice.textContent = "";
    ui.track.classList.toggle("pulse-track", selectedMode === "pulse");
    ui.title.textContent = `${song.name} · ${MODES[selectedMode].name}`;
    ui.roundInfo.textContent = `${Math.round(plan.bpm)} BPM · ${song.signature}${selectedMode === "pulse" ? "" : " · " + PARTS[part]}`;
    ui.loopResult.textContent = "";
    setFeedback("");
    show("play");
    timer = setInterval(schedule, 25);
    schedule();
    draw();
  } catch (error) {
    if (request !== token) return;
    ui.notice.textContent = "No se pudo abrir el audio. Toca Jugar para reintentar.";
    ui.start.disabled = false;
    console.error(error);
  }
}

function schedule() {
  if (!run) return;
  const now = sound.ctx.currentTime;
  const { backing } = run.plan;
  while (run.index < backing.length) {
    const note = backing[run.index];
    const time = run.start + note.at;
    if (time > now + .12) break;
    if (time >= now - .03) sound.play(note, time);
    run.index++;
  }
}

function draw() {
  if (!run) return;
  const at = sound.heard() - run.start;
  const beat = at / run.plan.beatSeconds;
  const phase = run.plan.phases.findLast(item => beat >= item.beat);
  ui.phase.textContent = at < 0 ? `Entrada · ${Math.min(run.plan.meter, Math.ceil(-beat))}`
    : phase?.label || (run.mode === "practice" ? `Vuelta ${run.cycles + 1}` : "Toca con la banda");
  ui.track.classList.toggle("guide-off", run.mode === "pulse" && phase?.label === "Mantén el pulso");
  if (run.mode === "pulse") ui.track.classList.toggle("on-beat", beat - Math.floor(beat) < .18);

  for (const note of run.notes) {
    if (note.state === "holding" && at + run.offset >= note.at + note.duration) {
      const active = held.get(note.lane);
      if (active?.note === note) active.fade?.();
      finishNote(note, true);
    }
    if (!note.state && at + run.offset > note.at + HIT_WINDOW) finishNote(note, false, false);
    const lead = note.at - at;
    const visible = !note.hidden && (!note.state || note.state === "holding") && lead < 1.65 && lead > -.19;
    note.marker.hidden = !visible;
    if (visible) note.marker.style.top = `${80 - Math.max(0, lead / 1.65) * 75}%`;
  }

  if (at > run.plan.end + .4) {
    const result = measure(run.notes);
    if (run.mode === "practice") {
      run.cycles++;
      ui.loopResult.textContent = `Vuelta ${run.cycles} · ${format(result, false)}`;
      beginRound(sound.ctx.currentTime + run.plan.meter * run.plan.beatSeconds + .12);
    } else {
      ui.summary.textContent = format(result, run.mode === "pulse");
      stop();
      show("results");
      ui.replay.focus();
      return;
    }
  }
  frame = requestAnimationFrame(draw);
}

function finishNote(note, hit, feedback = true) {
  note.state = hit ? "hit" : "miss";
  if (!feedback || run.mode === "pulse") return;
  const ms = Math.round(note.delta * 1000);
  setFeedback(hit
    ? Math.abs(note.delta) <= PERFECT_WINDOW ? "A tiempo" : `${Math.abs(ms)} ms ${ms < 0 ? "temprano" : "tarde"}`
    : "Suelta al final de la nota");
}

function press(lane, timestamp) {
  if (!run || held.has(lane) || !run.columns[lane]) return;
  const at = sound.heard(timestamp) - run.start + run.offset;
  const note = closestNote(run.notes, lane, at);
  run.columns[lane].pad.classList.add("pressed");
  held.set(lane, { note });
  if (!note) return;
  note.delta = at - note.at;
  const fade = run.mode === "pulse" ? undefined
    : sound.play({ ...note, accent: note.accent && Math.abs(note.delta) <= PERFECT_WINDOW }, undefined, true);
  if (note.duration) {
    note.state = "holding";
    held.set(lane, { note, fade });
    setFeedback("Mantén");
  } else {
    finishNote(note, true);
  }
}

function release(lane, timestamp) {
  if (!run || !run.columns[lane]) return;
  const active = held.get(lane);
  run.columns[lane].pad.classList.remove("pressed");
  held.delete(lane);
  if (active?.note?.state !== "holding") return;
  const { note, fade } = active;
  const at = sound.heard(timestamp) - run.start + run.offset;
  fade?.();
  finishNote(note, at >= note.at + note.duration - .10);
}

function drop(lane) {
  const active = held.get(lane);
  if (active?.note?.state === "holding") {
    active.fade?.();
    finishNote(active.note, false);
  }
  held.delete(lane);
  run?.columns[lane]?.pad.classList.remove("pressed");
}

for (const [key, item] of Object.entries(MODES)) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = item.name;
  button.dataset.mode = key;
  button.addEventListener("click", () => { mode = key; updateOptions(); });
  ui.modes.append(button);
}
SONGS.forEach(song => ui.song.add(option(song.id, `${song.style} · ${song.name}`)));
Object.entries(PARTS).forEach(([key, label]) => ui.part.add(option(key, label)));
ui.start.addEventListener("click", start);
ui.replay.addEventListener("click", start);
ui.band.addEventListener("input", mix);
ui.player.addEventListener("input", mix);
ui.configure.addEventListener("click", () => show("setup"));
ui.end.addEventListener("click", () => {
  if (run?.mode === "practice" && (run.cycles || run.notes.some(note => note.state === "hit"))) {
    ui.summary.textContent = ui.loopResult.textContent || format(measure(run.notes), false);
    stop();
    show("results");
  } else {
    stop();
    show("setup");
  }
});
ui.classic.addEventListener("click", () => {
  stop();
  studio.hidden = true;
  classic.hidden = false;
  window.dispatchEvent(new Event("resize"));
});
document.querySelector("#open-studio").addEventListener("click", () => {
  document.dispatchEvent(new Event("open-rhythm-studio"));
  classic.hidden = true;
  studio.hidden = false;
  show("setup");
  ui.song.focus();
});
document.addEventListener("keydown", event => {
  if (!run || event.repeat) return;
  const lane = run.mode === "pulse" && (event.code === "Space" || event.code === "KeyA") ? 0 : keys.indexOf(event.code);
  if (lane < 0 || !run.columns[lane]) return;
  event.preventDefault();
  press(lane, event.timeStamp);
});
document.addEventListener("keyup", event => {
  if (!run) return;
  const lane = run.mode === "pulse" && event.code === "Space" ? 0 : keys.indexOf(event.code);
  if (lane >= 0) release(lane, event.timeStamp);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && run) {
    stop();
    show("setup");
    ui.notice.textContent = "Partida interrumpida. Toca Jugar para comenzar otra.";
  }
});
updateOptions();
