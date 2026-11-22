import { audioEngine } from "../audio/audioEngine.js";

const drums = new Set(["kick", "tambora", "hat", "snare", "wood", "clap", "guache"]);
const cache = new Map();

export class StudioSound {
  nodes = new Set();
  buffers = new Map();

  async prepare(events) {
    this.ctx = await audioEngine.init();
    if (!this.band) {
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -14;
      this.band = this.ctx.createGain();
      this.player = this.ctx.createGain();
      this.band.connect(limiter);
      this.player.connect(limiter);
      limiter.connect(this.ctx.destination);
    }
    const voices = new Set(events.map(note => note.voice).concat("wood"));
    await Promise.all([...voices].flatMap(voice => [0, 1].map(async velocity => {
      const key = `${voice}-${velocity}`;
      if (!cache.has(key)) {
        const loading = fetch(new URL(`../../assets/studio/${key}.wav`, import.meta.url))
          .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.arrayBuffer();
          }).then(bytes => this.ctx.decodeAudioData(bytes));
        cache.set(key, loading);
        loading.catch(() => cache.delete(key));
      }
      this.buffers.set(key, await cache.get(key));
    })));
  }

  setVolumes(band, player) {
    this.band.gain.setTargetAtTime(band * .72, this.ctx.currentTime, .025);
    this.player.gain.setTargetAtTime(player * .80, this.ctx.currentTime, .025);
  }

  play(note, when = this.ctx.currentTime, player = false) {
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = this.buffers.get(`${note.voice}-${Number(Boolean(note.accent))}`);
    if (!source.buffer) return;
    if (!drums.has(note.voice)) source.playbackRate.value = Math.pow(2, (note.midi - 60) / 12);
    gain.gain.value = note.gain ?? (drums.has(note.voice) ? .52 : .57);
    source.connect(gain).connect(player ? this.player : this.band);
    this.nodes.add(source);
    source.onended = () => {
      this.nodes.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    source.start(when);
    return () => {
      if (!this.nodes.has(source)) return;
      const now = this.ctx.currentTime;
      gain.gain.setTargetAtTime(.001, now, .018);
      source.stop(now + .10);
    };
  }

  stop() {
    this.nodes.forEach(source => source.stop());
    this.nodes.clear();
  }

  heard(at) {
    return audioEngine.audibleNow(at);
  }
}
