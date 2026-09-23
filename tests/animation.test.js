const test = require('node:test');
const assert = require('node:assert/strict');
const { rollSchedule, play } = require('../src/animation.js');

test('rollSchedule slows down and sums to about the duration', () => {
  const d = rollSchedule(2000);
  assert.equal(d.length, 20);
  for (let i = 1; i < d.length; i++) assert.ok(d[i] >= d[i - 1]);
  const sum = d.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 2000) <= 20, `sum was ${sum}`);
  assert.deepEqual(rollSchedule(0), []);
});

function fakeStage() {
  const classes = new Set();
  return {
    textContent: '',
    classes,
    classList: { add: c => classes.add(c), remove: c => classes.delete(c) },
  };
}

test('play ends on the final text and removes the rolling class', async () => {
  const stage = fakeStage();
  await play(stage, ['a', 'b'], '王小明', { duration: 20 });
  assert.equal(stage.textContent, '王小明');
  assert.equal(stage.classes.has('rolling'), false);
});

test('play with no labels resolves immediately with the final text', async () => {
  const stage = fakeStage();
  await play(stage, [], '—', { duration: 2000 });
  assert.equal(stage.textContent, '—');
});
