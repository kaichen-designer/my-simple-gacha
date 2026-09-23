const test = require('node:test');
const assert = require('node:assert/strict');
const { FRAMES, PALETTE, FRAME_W, FRAME_H } = require('../src/teacher.js');

const NAMES = ['idle', 'blink', 'walkA', 'walkB', 'jump', 'climbA', 'climbB', 'crankA', 'crankB'];

test('every frame exists with the same size', () => {
  for (const name of NAMES) {
    const f = FRAMES[name];
    assert.ok(f, `missing frame ${name}`);
    assert.equal(f.length, FRAME_H, `${name} height`);
    f.forEach((row, y) => assert.equal(row.length, FRAME_W, `${name} row ${y}`));
  }
});

test('every colour used is defined in the palette', () => {
  for (const name of NAMES) {
    for (const row of FRAMES[name]) {
      for (const ch of row) assert.ok(ch === '.' || ch in PALETTE, `${name} uses undefined "${ch}"`);
    }
  }
});

test('standing frames keep the side margins empty for the arm poses', () => {
  for (const name of ['idle', 'blink', 'walkA', 'walkB']) {
    for (const row of FRAMES[name]) {
      assert.equal(row.slice(0, 2), '..', name);
      assert.equal(row.slice(-2), '..', name);
    }
  }
});

test('arms-up and crank poses reach beyond the body', () => {
  const handAt = (frame, fromCol, toCol) => frame.some(row => row.slice(fromCol, toCol).includes('S'));
  for (const name of ['jump', 'climbA', 'climbB']) {
    assert.ok(handAt(FRAMES[name].slice(0, 16), 0, 3), `${name} left hand raised`);
    assert.ok(handAt(FRAMES[name].slice(0, 16), 21, 24), `${name} right hand raised`);
  }
  for (const name of ['crankA', 'crankB']) {
    assert.ok(handAt(FRAMES[name], 21, 24), `${name} reaches right`);
  }
  assert.notDeepEqual(FRAMES.crankA, FRAMES.crankB);
});

test('blink only changes the eyes', () => {
  const diff = FRAMES.idle.map((row, y) => (row === FRAMES.blink[y] ? null : y)).filter(y => y !== null);
  assert.equal(diff.length, 1);
  const y = diff[0];
  assert.equal(FRAMES.blink[y], FRAMES.idle[y].replace(/E/g, 's'));
});
