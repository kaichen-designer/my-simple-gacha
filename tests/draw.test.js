const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/draw.js');

const zero = () => 0;
const almostOne = () => 0.99;
const students = [
  { name: '王小明', group: 1 },
  { name: '李大華', group: 1 },
  { name: '陳美美', group: 2 },
  { name: '自由人', group: null },
];

test('pickRandom is a partial Fisher-Yates driven by rng', () => {
  assert.deepEqual(D.pickRandom(['a', 'b', 'c'], 2, zero), ['a', 'b']);
  assert.deepEqual(D.pickRandom(['a', 'b', 'c'], 2, almostOne), ['c', 'a']);
  assert.deepEqual(D.pickRandom(['a'], 5, zero), ['a']);
  assert.deepEqual(D.pickRandom([], 1, zero), []);
});

test('buildPool group mode lists groups with members', () => {
  assert.deepEqual(D.buildPool('group', students), [
    { id: 'g1', label: '第1組', detail: '王小明、李大華', group: 1 },
    { id: 'g2', label: '第2組', detail: '陳美美', group: 2 },
  ]);
});

test('buildPool person mode lists everyone with their group', () => {
  assert.deepEqual(D.buildPool('person', students), [
    { id: 'p0', label: '王小明', detail: '第1組', group: 1 },
    { id: 'p1', label: '李大華', detail: '第1組', group: 1 },
    { id: 'p2', label: '陳美美', detail: '第2組', group: 2 },
    { id: 'p3', label: '自由人', detail: '未分組', group: null },
  ]);
});

test('validateSetup errors and warnings', () => {
  assert.deepEqual(D.validateSetup('group', [], []), {
    errors: ['沒有辨識到任何組別', '請至少輸入一個任務'],
    warnings: [],
  });
  assert.deepEqual(D.validateSetup('person', [], [{ name: 'x', count: 1 }]).errors, ['名單是空的']);
  const pool = D.buildPool('group', students);
  assert.deepEqual(D.validateSetup('group', pool, [{ name: '打掃', count: 3 }]), {
    errors: [],
    warnings: ['任務共需要 3 組，但只有 2 組，後面的任務會不足額'],
  });
});

test('session draws one ball at a time without repeats', () => {
  const pool = D.buildPool('person', students);
  const tasks = [{ name: '打掃', count: 2 }, { name: '倒垃圾', count: 1 }];
  let s = D.createSession(tasks, pool);
  assert.equal(D.currentTask(s).name, '打掃');
  assert.equal(D.needed(s), 2);
  assert.equal(D.isCurrentComplete(s), false);
  assert.throws(() => D.nextTask(s), /請先抽完這個任務/);

  s = D.drawOne(s, zero);
  assert.deepEqual(D.currentResult(s).winners.map(w => w.label), ['王小明']);
  assert.equal(D.needed(s), 1);
  assert.equal(D.isCurrentComplete(s), false);
  assert.throws(() => D.nextTask(s), /請先抽完這個任務/);

  s = D.drawOne(s, zero);
  assert.deepEqual(D.currentResult(s).winners.map(w => w.label), ['王小明', '李大華']);
  assert.equal(D.isCurrentComplete(s), true);
  assert.deepEqual(s.remaining.map(p => p.label), ['陳美美', '自由人']);
  assert.throws(() => D.drawOne(s, zero), /這個任務已經抽滿了/);

  s = D.nextTask(s);
  assert.equal(D.currentTask(s).name, '倒垃圾');
  s = D.drawOne(s, zero);
  assert.deepEqual(D.currentResult(s).winners.map(w => w.label), ['陳美美']);
  s = D.nextTask(s);
  assert.equal(D.isFinished(s), true);
  assert.equal(D.currentTask(s), null);
  assert.equal(D.currentResult(s), null);
  assert.throws(() => D.drawOne(s, zero), /所有任務都抽完了/);
  assert.deepEqual(s.results.map(r => r.shortfall), [0, 0]);
});

test('task is complete with a shortfall once the pool runs out', () => {
  const pool = D.buildPool('group', students);
  let s = D.createSession([{ name: '打掃', count: 3 }, { name: '倒垃圾', count: 1 }], pool);
  s = D.drawOne(s, zero);
  s = D.drawOne(s, zero);
  assert.equal(D.isCurrentComplete(s), true);
  assert.equal(D.needed(s), 1);
  assert.deepEqual(s.remaining, []);
  s = D.nextTask(s);
  // Nothing left: the next task is complete immediately with nobody drawn.
  assert.equal(D.isCurrentComplete(s), true);
  s = D.nextTask(s);
  assert.deepEqual(s.results.map(r => r.shortfall), [1, 1]);
  assert.deepEqual(s.results[1].winners, []);
});

test('drawOne does not mutate the previous session', () => {
  const pool = D.buildPool('group', students);
  const s0 = D.createSession([{ name: '打掃', count: 1 }], pool);
  D.drawOne(s0, zero);
  assert.equal(s0.remaining.length, 2);
  assert.deepEqual(s0.results[0].winners, []);
});
