(function (root) {
  'use strict';

  const KEY = 'mysimplegacha.v1';
  const KINDS = ['roster', 'tasks'];

  // Keeps rows shaped like the setup tables' rows: an object of string fields with a string `name`.
  function cleanRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows
      .filter(r => r && typeof r === 'object' && typeof r.name === 'string')
      .map(r => Object.fromEntries(Object.entries(r).filter(([, v]) => typeof v === 'string')));
  }

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  const isCount = n => Number.isInteger(n) && n >= 0;

  function cleanTask(t) {
    return isPlainObject(t) && typeof t.name === 'string' && Number.isInteger(t.count) && t.count >= 1
      ? { name: t.name, count: t.count }
      : null;
  }

  // A pool entry: a group or a person a ball stands for.
  function cleanBall(b) {
    const ok = isPlainObject(b) && typeof b.id === 'string' && typeof b.label === 'string'
      && typeof b.detail === 'string' && (b.group === null || Number.isInteger(b.group));
    return ok ? { id: b.id, label: b.label, detail: b.detail, group: b.group } : null;
  }

  // Every entry must be valid, otherwise the whole list is rejected (null).
  function cleanAll(list, clean) {
    if (!Array.isArray(list)) return null;
    const out = list.map(clean);
    return out.every(x => x !== null) ? out : null;
  }

  // A draw in progress, checked well enough that a damaged record can never crash the page.
  function cleanSession(data) {
    if (!isPlainObject(data) || !['group', 'person'].includes(data.mode) || !isPlainObject(data.session)) return null;
    const s = data.session;
    const tasks = cleanAll(s.tasks, cleanTask);
    const remaining = cleanAll(s.remaining, cleanBall);
    if (!tasks || tasks.length === 0 || !remaining) return null;
    if (!Array.isArray(s.results) || s.results.length !== tasks.length) return null;
    const results = [];
    for (const r of s.results) {
      const task = isPlainObject(r) ? cleanTask(r.task) : null;
      const winners = isPlainObject(r) ? cleanAll(r.winners, cleanBall) : null;
      if (!task || !winners || !isCount(r.shortfall)) return null;
      results.push({ task, winners, shortfall: r.shortfall });
    }
    if (!Number.isInteger(s.index) || s.index < 0 || s.index > tasks.length) return null;
    return { mode: data.mode, session: { tasks, remaining, results, index: s.index } };
  }

  function createStore(storage) {
    function read() {
      const empty = { draft: null, session: null, saves: { roster: {}, tasks: {} } };
      try {
        const data = JSON.parse(storage.getItem(KEY));
        if (!isPlainObject(data)) return empty;
        if (isPlainObject(data.draft)) {
          empty.draft = { roster: cleanRows(data.draft.roster), tasks: cleanRows(data.draft.tasks) };
        }
        empty.session = cleanSession(data.session);
        for (const kind of KINDS) {
          const group = isPlainObject(data.saves) ? data.saves[kind] : null;
          if (!isPlainObject(group)) continue;
          for (const [name, rows] of Object.entries(group)) {
            if (Array.isArray(rows)) empty.saves[kind][name] = cleanRows(rows);
          }
        }
        return empty;
      } catch {
        return empty;
      }
    }

    function write(data) {
      try {
        storage.setItem(KEY, JSON.stringify(data));
        return true;
      } catch {
        return false;
      }
    }

    function loadDraft() {
      return read().draft;
    }

    function saveDraft({ roster, tasks }) {
      const data = read();
      data.draft = { roster: cleanRows(roster), tasks: cleanRows(tasks) };
      return write(data);
    }

    function clearDraft() {
      const data = read();
      data.draft = null;
      write(data);
    }

    function loadSession() {
      return read().session;
    }

    function saveSession(data) {
      const clean = cleanSession(data);
      if (!clean) return false;
      const all = read();
      all.session = clean;
      return write(all);
    }

    function clearSession() {
      const data = read();
      data.session = null;
      write(data);
    }

    function listSaves(kind) {
      if (!KINDS.includes(kind)) return [];
      return Object.keys(read().saves[kind]).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    function hasSave(kind, name) {
      return KINDS.includes(kind) && Object.hasOwn(read().saves[kind], String(name).trim());
    }

    function getSave(kind, name) {
      return hasSave(kind, name) ? read().saves[kind][String(name).trim()] : null;
    }

    function putSave(kind, name, rows) {
      const key = String(name).trim();
      if (!KINDS.includes(kind) || !key) return false;
      const data = read();
      data.saves[kind][key] = cleanRows(rows);
      return write(data);
    }

    function removeSave(kind, name) {
      if (!KINDS.includes(kind)) return;
      const data = read();
      delete data.saves[kind][String(name).trim()];
      write(data);
    }

    return { loadDraft, saveDraft, clearDraft, loadSession, saveSession, clearSession, listSaves, hasSave, getSave, putSave, removeSave };
  }

  const api = { KEY, createStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DrawLots = Object.assign(root.DrawLots || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
