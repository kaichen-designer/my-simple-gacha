const test = require('node:test');
const assert = require('node:assert/strict');
const { SOUNDS, createSfx } = require('../src/sfx.js');

// Just enough of the Web Audio API to record what gets scheduled.
function fakeContext() {
  const log = { oscillators: 0, noises: 0, resumed: 0 };
  const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
  const node = extra => ({ connect(n) { return n; }, ...extra });
  const ctx = {
    log,
    state: 'suspended',
    currentTime: 0,
    sampleRate: 8000,
    destination: node(),
    resume() { log.resumed++; ctx.state = 'running'; return Promise.resolve(); },
    createGain: () => node({ gain: param() }),
    createBiquadFilter: () => node({ type: '', frequency: param(), Q: param() }),
    createOscillator: () => { log.oscillators++; return node({ type: '', frequency: param(), start() {}, stop() {} }); },
    createBufferSource: () => { log.noises++; return node({ buffer: null, start() {}, stop() {} }); },
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
  };
  return ctx;
}

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
}

test('every sound schedules at least one voice', () => {
  for (const name of Object.keys(SOUNDS)) {
    const ctx = fakeContext();
    const sfx = createSfx({ createContext: () => ctx, storage: memoryStorage() });
    sfx.play(name);
    assert.ok(ctx.log.oscillators + ctx.log.noises > 0, name);
  }
});

test('the sounds the machine and teacher use all exist', () => {
  for (const name of ['step', 'jump', 'crank', 'blow', 'drop', 'roll', 'pop', 'fanfare', 'blip', 'cheer']) {
    assert.ok(SOUNDS[name], name);
  }
});

test('sound is on by default and resumes a suspended context', () => {
  const ctx = fakeContext();
  const sfx = createSfx({ createContext: () => ctx, storage: memoryStorage() });
  assert.equal(sfx.muted, false);
  sfx.play('blip');
  assert.equal(ctx.log.resumed, 1);
});

test('muted: nothing is created or played, and the choice is remembered', () => {
  let created = 0;
  const storage = memoryStorage();
  const sfx = createSfx({ createContext: () => { created++; return fakeContext(); }, storage });
  sfx.setMuted(true);
  sfx.play('fanfare');
  assert.equal(created, 0);
  const again = createSfx({ createContext: () => fakeContext(), storage });
  assert.equal(again.muted, true);
});

test('unknown sounds, missing audio support and broken storage are harmless', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const sfx = createSfx({ createContext: () => { throw new Error('no audio'); }, storage: broken });
  assert.equal(sfx.muted, false);
  sfx.play('nope');
  sfx.play('blip');
  sfx.setMuted(true);
  assert.equal(sfx.muted, true);
});
