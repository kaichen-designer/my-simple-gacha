const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore, KEY } = require('../src/store.js');

function memoryStorage(initial) {
  const data = new Map(initial ? [[KEY, initial]] : []);
  return {
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: k => { data.delete(k); },
    data,
  };
}

const brokenStorage = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
  removeItem() { throw new Error('denied'); },
};

const roster = [{ name: '王小明', group: '1' }, { name: '李大華', group: '2' }];
const tasks = [{ name: '掃地', count: '2' }];

test('draft is empty until saved, then round-trips', () => {
  const store = createStore(memoryStorage());
  assert.equal(store.loadDraft(), null);
  assert.equal(store.saveDraft({ roster, tasks }), true);
  assert.deepEqual(store.loadDraft(), { roster, tasks });
});

test('clearDraft removes only the draft, not named saves', () => {
  const store = createStore(memoryStorage());
  store.saveDraft({ roster, tasks });
  store.putSave('roster', '三年二班', roster);
  store.clearDraft();
  assert.equal(store.loadDraft(), null);
  assert.deepEqual(store.getSave('roster', '三年二班'), roster);
});

test('named saves are listed sorted, per kind', () => {
  const store = createStore(memoryStorage());
  store.putSave('roster', '乙班', roster);
  store.putSave('roster', '甲班', roster);
  store.putSave('tasks', '大掃除', tasks);
  assert.deepEqual(store.listSaves('roster'), ['乙班', '甲班'].sort((a, b) => a.localeCompare(b, 'zh-Hant')));
  assert.deepEqual(store.listSaves('tasks'), ['大掃除']);
  assert.deepEqual(store.getSave('tasks', '大掃除'), tasks);
  assert.equal(store.getSave('tasks', '不存在'), null);
});

test('putSave overwrites a same-named save and trims the name', () => {
  const store = createStore(memoryStorage());
  store.putSave('tasks', ' 大掃除 ', tasks);
  store.putSave('tasks', '大掃除', [{ name: '倒垃圾', count: '1' }]);
  assert.deepEqual(store.listSaves('tasks'), ['大掃除']);
  assert.deepEqual(store.getSave('tasks', '大掃除'), [{ name: '倒垃圾', count: '1' }]);
  assert.equal(store.hasSave('tasks', ' 大掃除 '), true);
});

test('putSave rejects a blank name or unknown kind', () => {
  const store = createStore(memoryStorage());
  assert.equal(store.putSave('roster', '   ', roster), false);
  assert.equal(store.putSave('other', 'x', roster), false);
  assert.deepEqual(store.listSaves('roster'), []);
});

test('removeSave deletes one save', () => {
  const store = createStore(memoryStorage());
  store.putSave('roster', 'A', roster);
  store.putSave('roster', 'B', roster);
  store.removeSave('roster', 'A');
  assert.deepEqual(store.listSaves('roster'), ['B']);
});

test('saved rows are copied, not shared with the caller', () => {
  const store = createStore(memoryStorage());
  const rows = [{ name: 'a', group: '1' }];
  store.putSave('roster', 'X', rows);
  rows[0].name = 'changed';
  assert.equal(store.getSave('roster', 'X')[0].name, 'a');
});

test('corrupt or malformed storage is treated as empty', () => {
  for (const raw of ['not json', '[]', '{"saves":5}', '{"saves":{"roster":{"A":"oops"}}}']) {
    const store = createStore(memoryStorage(raw));
    assert.equal(store.loadDraft(), null);
    assert.deepEqual(store.listSaves('roster'), []);
  }
});

test('malformed rows are dropped, well-formed ones kept', () => {
  const raw = JSON.stringify({
    draft: { roster: [{ name: 'ok', group: '1' }, 7, { name: 5 }], tasks: 'bad' },
    saves: { roster: { Good: [{ name: 'ok', group: '' }], Bad: 'x' } },
  });
  const store = createStore(memoryStorage(raw));
  assert.deepEqual(store.loadDraft(), { roster: [{ name: 'ok', group: '1' }], tasks: [] });
  assert.deepEqual(store.listSaves('roster'), ['Good']);
});

test('unavailable storage never throws and reports failure', () => {
  const store = createStore(brokenStorage);
  assert.equal(store.loadDraft(), null);
  assert.equal(store.saveDraft({ roster, tasks }), false);
  assert.equal(store.putSave('roster', 'A', roster), false);
  assert.deepEqual(store.listSaves('roster'), []);
  assert.doesNotThrow(() => store.clearDraft());
  assert.doesNotThrow(() => store.removeSave('roster', 'A'));
  assert.equal(createStore(null).saveDraft({ roster, tasks }), false);
});

// ---- a draw in progress survives a reload ----
const pool = [
  { id: 'g1', label: '第1組', detail: '王小明', group: 1 },
  { id: 'g2', label: '第2組', detail: '李大華', group: 2 },
  { id: 'g3', label: '第3組', detail: '陳美美', group: 3 },
];
function inProgress() {
  return {
    mode: 'group',
    session: {
      tasks: [{ name: '掃地', count: 2 }, { name: '倒垃圾', count: 1 }],
      remaining: [pool[2]],
      results: [
        { task: { name: '掃地', count: 2 }, winners: [pool[0], pool[1]], shortfall: 0 },
        { task: { name: '倒垃圾', count: 1 }, winners: [], shortfall: 0 },
      ],
      index: 1,
    },
  };
}

test('session round-trips and is independent of draft and named saves', () => {
  const store = createStore(memoryStorage());
  assert.equal(store.loadSession(), null);
  assert.equal(store.saveSession(inProgress()), true);
  store.saveDraft({ roster, tasks });
  store.putSave('roster', 'A', roster);
  assert.deepEqual(store.loadSession(), inProgress());
  assert.deepEqual(store.loadDraft(), { roster, tasks });
  store.saveDraft({ roster: [], tasks: [] });
  assert.deepEqual(store.loadSession(), inProgress());
});

test('clearSession removes only the session', () => {
  const store = createStore(memoryStorage());
  store.saveSession(inProgress());
  store.saveDraft({ roster, tasks });
  store.clearSession();
  assert.equal(store.loadSession(), null);
  assert.deepEqual(store.loadDraft(), { roster, tasks });
});

test('a finished session (index past the last task) is kept', () => {
  const store = createStore(memoryStorage());
  const done = inProgress();
  done.session.index = 2;
  store.saveSession(done);
  assert.equal(store.loadSession().session.index, 2);
});

test('malformed sessions are dropped', () => {
  const broken = [
    { mode: 'other' },
    { ...inProgress(), mode: 'sideways' },
    (() => { const x = inProgress(); x.session.index = 9; return x; })(),
    (() => { const x = inProgress(); x.session.results.pop(); return x; })(),
    (() => { const x = inProgress(); x.session.tasks[0].count = 0; return x; })(),
    (() => { const x = inProgress(); x.session.remaining = [{ id: 5 }]; return x; })(),
    (() => { const x = inProgress(); x.session.results[0].winners = 'oops'; return x; })(),
  ];
  for (const b of broken) {
    const store = createStore(memoryStorage(JSON.stringify({ session: b })));
    assert.equal(store.loadSession(), null, JSON.stringify(b).slice(0, 60));
  }
});

test('session storage failures never throw', () => {
  const store = createStore(brokenStorage);
  assert.equal(store.saveSession(inProgress()), false);
  assert.equal(store.loadSession(), null);
  assert.doesNotThrow(() => store.clearSession());
});
