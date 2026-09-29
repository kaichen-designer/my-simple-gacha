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
