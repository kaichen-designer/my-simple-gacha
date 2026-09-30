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
    { id: 'p:王小明', label: '王小明', detail: '第1組', group: 1 },
    { id: 'p:李大華', label: '李大華', detail: '第1組', group: 1 },
    { id: 'p:陳美美', label: '陳美美', detail: '第2組', group: 2 },
    { id: 'p:自由人', label: '自由人', detail: '未分組', group: null },
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

// A session that drew g1 for 擦黑板 and g2 for 打掃 (count 2, one still to go).
function midSession() {
  const pool = D.buildPool('group', [
    { name: 'A', group: 1 }, { name: 'B', group: 2 }, { name: 'C', group: 3 }, { name: 'D', group: 4 },
  ]);
  let s = D.createSession([{ name: '擦黑板', count: 1 }, { name: '打掃', count: 2 }, { name: '倒垃圾', count: 1 }], pool);
  s = D.drawOne(s, zero); // g1
  s = D.nextTask(s);
  s = D.drawOne(s, zero); // g2
  return s;
}
const groups = (...numbers) => D.buildPool('group', numbers.map((n, i) => ({ name: 'S' + i, group: n })));
const labels = r => r.winners.map(w => w.label);

test('reconcileSession keeps assignments and resumes at the first unfilled task', () => {
  const s = D.reconcileSession(midSession(), [{ name: '擦黑板', count: 1 }, { name: '打掃', count: 2 }, { name: '倒垃圾', count: 1 }], groups(1, 2, 3, 4));
  assert.deepEqual(s.results.map(labels), [['第1組'], ['第2組'], []]);
  assert.deepEqual(s.remaining.map(p => p.label), ['第3組', '第4組']);
  assert.equal(s.index, 1);
  assert.equal(D.needed(s), 1);
});

test('reconcileSession adds new groups to the pool and drops removed ones with their assignments', () => {
  const s = D.reconcileSession(midSession(), [{ name: '擦黑板', count: 1 }, { name: '打掃', count: 2 }], groups(2, 3, 5));
  assert.deepEqual(s.results.map(labels), [[], ['第2組']]);
  assert.deepEqual(s.remaining.map(p => p.label), ['第3組', '第5組']);
  assert.equal(s.index, 0);
});

test('reconcileSession matches tasks by name, trims lowered counts and handles new tasks', () => {
  const s = D.reconcileSession(midSession(), [{ name: '新任務', count: 1 }, { name: '擦黑板', count: 1 }, { name: '打掃', count: 1 }], groups(1, 2, 3, 4));
  assert.deepEqual(s.results.map(labels), [[], ['第1組'], ['第2組']]);
  assert.equal(s.index, 0);
  assert.equal(s.remaining.length, 2);
});

test('reconcileSession uses the fresh pool entries so edited members show up', () => {
  const pool = D.buildPool('group', [{ name: 'A', group: 1 }, { name: 'Z', group: 1 }, { name: 'B', group: 2 }]);
  const s = D.reconcileSession(midSession(), [{ name: '擦黑板', count: 1 }], pool);
  assert.equal(s.results[0].winners[0].detail, 'A、Z');
});

test('reconcileSession reopens a short task once the pool grows, and finishes when all are full', () => {
  const pool = groups(1);
  let s = D.createSession([{ name: '打掃', count: 2 }], pool);
  s = D.drawOne(s, zero);
  assert.equal(D.isCurrentComplete(s), true); // pool ran out
  s = D.reconcileSession(s, [{ name: '打掃', count: 2 }], groups(1, 2));
  assert.equal(s.index, 0);
  assert.equal(D.isCurrentComplete(s), false);
  const done = D.reconcileSession(D.drawOne(s, zero), [{ name: '打掃', count: 2 }], groups(1, 2));
  assert.equal(D.isFinished(done), true);
});

test('reconcileSession keeps only as many winners as the lowered count and frees the rest', () => {
  let s = D.createSession([{ name: '打掃', count: 2 }], groups(1, 2, 3));
  s = D.drawOne(D.drawOne(s, zero), zero); // g1, g2
  s = D.reconcileSession(s, [{ name: '打掃', count: 1 }], groups(1, 2, 3));
  assert.deepEqual(s.results.map(labels), [['第1組']]);
  assert.deepEqual(s.remaining.map(p => p.label), ['第2組', '第3組']);
  assert.equal(D.isFinished(s), true);
});

// ---- reordering tasks during a draw ----
function sessionOf(names, pool) {
  return D.createSession(names.map(name => ({ name, count: 1 })), pool);
}
const poolOf = n => Array.from({ length: n }, (_, i) => ({ id: 'g' + (i + 1), label: '第' + (i + 1) + '組', detail: '', group: i + 1 }));
const order = s => s.tasks.map(t => t.name).join('');

test('firstMovable is the current task until it has a winner, then the one after', () => {
  let s = sessionOf(['A', 'B', 'C'], poolOf(5));
  assert.equal(D.firstMovable(s), 0);
  s = D.drawOne(s, zero);
  assert.equal(D.firstMovable(s), 1);
  s = D.nextTask(s);
  assert.equal(D.firstMovable(s), 1); // B has no winner yet
  s = D.drawOne(s, zero);
  assert.equal(D.firstMovable(s), 2);
});

test('moveTask reorders upcoming tasks together with their results', () => {
  let s = D.drawOne(sessionOf(['A', 'B', 'C', 'D'], poolOf(6)), zero);
  const moved = D.moveTask(s, 3, 1);
  assert.equal(order(moved), 'ADBC');
  assert.deepEqual(moved.results.map(r => r.task.name), ['A', 'D', 'B', 'C']);
  assert.equal(moved.index, 0);
  assert.equal(moved.results[0].winners.length, 1);
  assert.deepEqual(moved.remaining, s.remaining);
  assert.equal(order(D.moveTask(s, 1, 3)), 'ACDB');
});

test('moveTask does not touch the original session', () => {
  const s = D.drawOne(sessionOf(['A', 'B', 'C'], poolOf(4)), zero);
  D.moveTask(s, 2, 1);
  assert.equal(order(s), 'ABC');
});

test('moveTask refuses to move or pass tasks that are drawn or under way', () => {
  let s = D.nextTask(D.drawOne(sessionOf(['A', 'B', 'C', 'D'], poolOf(6)), zero)); // B is current, no winner yet
  assert.equal(order(D.moveTask(s, 0, 2)), 'ABCD'); // A is drawn
  assert.equal(order(D.moveTask(s, 2, 0)), 'ABCD'); // cannot land in front of drawn A
  assert.equal(order(D.moveTask(s, 3, 1)), 'ADBC');  // B has no winner: it may still be pushed back
  s = D.drawOne(s, zero); // B now has a winner
  assert.equal(order(D.moveTask(s, 1, 3)), 'ABCD');
  assert.equal(order(D.moveTask(s, 3, 1)), 'ABCD');
  assert.equal(order(D.moveTask(s, 3, 2)), 'ABDC');
});

test('moveTask ignores out-of-range or no-op moves and finished sessions', () => {
  const s = sessionOf(['A', 'B', 'C'], poolOf(3));
  assert.equal(D.moveTask(s, 0, 0), s);
  assert.equal(D.moveTask(s, 0, 5), s);
  assert.equal(D.moveTask(s, -1, 1), s);
  let done = s;
  while (!D.isFinished(done)) done = D.nextTask(D.drawOne(done, zero));
  assert.equal(D.moveTask(done, 0, 1), done);
});

test('after moving the current, untouched task the session keeps drawing the new first task', () => {
  const s = sessionOf(['A', 'B', 'C'], poolOf(3));
  const moved = D.moveTask(s, 2, 0);
  assert.equal(D.currentTask(moved).name, 'C');
  const drawn = D.drawOne(moved, zero);
  assert.equal(D.currentResult(drawn).task.name, 'C');
  assert.equal(D.currentResult(drawn).winners.length, 1);
});
