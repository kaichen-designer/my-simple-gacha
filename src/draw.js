(function (root) {
  'use strict';

  const P = typeof require === 'function' ? require('./parse.js') : root.DrawLots;

  function pickRandom(items, n, rng) {
    const arr = items.slice();
    const k = Math.max(0, Math.min(n, arr.length));
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(rng() * (arr.length - i));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, k);
  }

  function buildPool(mode, students) {
    if (mode === 'group') {
      return P.groupStudents(students).map(g => ({
        id: 'g' + g.number,
        label: P.groupLabel(g.number),
        detail: g.members.join('、'),
      }));
    }
    return students.map((s, i) => ({ id: 'p' + i, label: s.name, detail: P.groupLabel(s.group) }));
  }

  function validateSetup(mode, pool, tasks) {
    const unit = mode === 'group' ? '組' : '人';
    const errors = [];
    const warnings = [];
    if (pool.length === 0) errors.push(mode === 'group' ? '沒有辨識到任何組別' : '名單是空的');
    if (tasks.length === 0) errors.push('請至少輸入一個任務');
    const needed = tasks.reduce((sum, t) => sum + t.count, 0);
    if (pool.length > 0 && needed > pool.length) {
      warnings.push(`任務共需要 ${needed} ${unit}，但只有 ${pool.length} ${unit}，後面的任務會不足額`);
    }
    return { errors, warnings };
  }

  function createSession(tasks, pool) {
    return { tasks: tasks.slice(), remaining: pool.slice(), results: [], index: 0 };
  }

  function currentTask(s) {
    return s.index < s.tasks.length ? s.tasks[s.index] : null;
  }

  function hasDrawnCurrent(s) {
    return s.results.length > s.index;
  }

  function isFinished(s) {
    return s.index >= s.tasks.length;
  }

  function drawCurrent(s, rng = Math.random) {
    const task = currentTask(s);
    if (!task) throw new Error('所有任務都抽完了');
    if (hasDrawnCurrent(s)) throw new Error('這個任務已經抽過了');
    const winners = pickRandom(s.remaining, task.count, rng);
    const ids = new Set(winners.map(w => w.id));
    return {
      ...s,
      remaining: s.remaining.filter(p => !ids.has(p.id)),
      results: [...s.results, { task, winners, shortfall: task.count - winners.length }],
    };
  }

  function nextTask(s) {
    if (!hasDrawnCurrent(s)) throw new Error('請先抽這個任務');
    return { ...s, index: s.index + 1 };
  }

  const api = {
    pickRandom, buildPool, validateSetup, createSession,
    currentTask, hasDrawnCurrent, isFinished, drawCurrent, nextTask,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DrawLots = Object.assign(root.DrawLots || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
