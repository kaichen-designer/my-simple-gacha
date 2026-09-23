(function (root) {
  'use strict';

  const note = midi => 440 * Math.pow(2, (midi - 69) / 12);

  // 8-bit style sound effects, synthesised with Web Audio (no audio files, works offline).
  // A sound is a list of voices. Tone voice: { type, from, to?, start?, dur, gain }.
  // Noise voice: { noise: true, freq, toFreq?, start?, dur, gain } (band-passed white noise).
  const SOUNDS = {
    step: [{ noise: true, freq: 1400, dur: 0.04, gain: 0.35 }],
    jump: [{ type: 'square', from: 260, to: 900, dur: 0.18, gain: 0.12 }],
    crank: [
      { noise: true, freq: 3200, dur: 0.025, gain: 0.35 },
      { type: 'square', from: 240, to: 170, dur: 0.035, gain: 0.07 },
    ],
    blow: [{ noise: true, freq: 700, toFreq: 2600, dur: 0.8, gain: 0.22 }],
    drop: [{ type: 'triangle', from: 260, to: 55, dur: 0.25, gain: 0.4 }],
    roll: [0, 1, 2, 3, 4, 5, 6].map(i => ({
      type: 'triangle', from: i % 2 ? 150 : 120, to: 90, start: i * 0.11, dur: 0.07, gain: 0.3 - i * 0.03,
    })),
    pop: [
      { type: 'square', from: 500, to: 1500, dur: 0.08, gain: 0.12 },
      { noise: true, freq: 4200, dur: 0.06, gain: 0.25 },
    ],
    fanfare: [
      ...[[72, 0, 0.1], [76, 0.1, 0.1], [79, 0.2, 0.1], [84, 0.3, 0.12], [79, 0.42, 0.08], [84, 0.5, 0.45]]
        .map(([n, start, dur]) => ({ type: 'square', from: note(n), start, dur, gain: 0.09 })),
      ...[[48, 0, 0.3], [55, 0.3, 0.2], [48, 0.5, 0.45]]
        .map(([n, start, dur]) => ({ type: 'triangle', from: note(n), start, dur, gain: 0.25 })),
    ],
    blip: [{ type: 'square', from: 988, dur: 0.04, gain: 0.07 }],
    cheer: [[79, 0, 0.07], [83, 0.07, 0.07], [86, 0.14, 0.14]]
      .map(([n, start, dur]) => ({ type: 'square', from: note(n), start, dur, gain: 0.08 })),
  };

  const STORAGE_KEY = 'draw-lots:muted';

  function readMuted(storage) {
    try {
      return storage.getItem(STORAGE_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  // createContext and storage are injectable for tests.
  function createSfx({
    createContext = () => new (root.AudioContext || root.webkitAudioContext)(),
    storage = root.localStorage,
  } = {}) {
    let muted = storage ? readMuted(storage) : false;
    let ctx = null;
    let master = null;
    let noiseBuffer = null;
    let broken = false;

    function ensureContext() {
      if (ctx || broken) return ctx;
      try {
        ctx = createContext();
        master = ctx.createGain();
        master.gain.setValueAtTime(0.6, ctx.currentTime);
        master.connect(ctx.destination);
        const len = Math.floor(ctx.sampleRate);
        noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      } catch (e) {
        broken = true;
        ctx = null;
      }
      return ctx;
    }

    function envelope(t, v) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(v.gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + v.dur);
      g.connect(master);
      return g;
    }

    function tone(t, v) {
      const osc = ctx.createOscillator();
      osc.type = v.type;
      osc.frequency.setValueAtTime(v.from, t);
      if (v.to) osc.frequency.exponentialRampToValueAtTime(v.to, t + v.dur);
      osc.connect(envelope(t, v));
      osc.start(t);
      osc.stop(t + v.dur + 0.02);
    }

    function noise(t, v) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(v.freq, t);
      if (v.toFreq) filter.frequency.exponentialRampToValueAtTime(v.toFreq, t + v.dur);
      src.connect(filter);
      filter.connect(envelope(t, v));
      src.start(t);
      src.stop(t + v.dur + 0.02);
    }

    function play(name) {
      const voices = SOUNDS[name];
      if (muted || !voices || !ensureContext()) return;
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime + 0.01;
      for (const v of voices) (v.noise ? noise : tone)(now + (v.start || 0), v);
    }

    function setMuted(value) {
      muted = !!value;
      try {
        if (storage) storage.setItem(STORAGE_KEY, muted ? '1' : '0');
      } catch (e) {
        // Storage can be blocked (private mode); the choice then lasts for this page only.
      }
    }

    return {
      play,
      setMuted,
      get muted() { return muted; },
    };
  }

  const api = { SOUNDS, createSfx };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DrawLots = Object.assign(root.DrawLots || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
