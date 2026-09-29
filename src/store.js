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

  function createStore(storage) {
    function read() {
      const empty = { draft: null, saves: { roster: {}, tasks: {} } };
      try {
        const data = JSON.parse(storage.getItem(KEY));
        if (!isPlainObject(data)) return empty;
        if (isPlainObject(data.draft)) {
          empty.draft = { roster: cleanRows(data.draft.roster), tasks: cleanRows(data.draft.tasks) };
        }
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

    return { loadDraft, saveDraft, clearDraft, listSaves, hasSave, getSave, putSave, removeSave };
  }

  const api = { KEY, createStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DrawLots = Object.assign(root.DrawLots || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
