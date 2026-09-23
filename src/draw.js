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
        group: g.number,
      }));
    }
    return students.map((s, i) => ({ id: 'p' + i, label: s.name, detail: P.groupLabel(s.group), group: s.group }));
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

  // One result per task, filled one ball at a time. shortfall is finalised by nextTask.
  function createSession(tasks, pool) {
    return {
      tasks: tasks.slice(),
      remaining: pool.slice(),
      results: tasks.map(task => ({ task, winners: [], shortfall: 0 })),
      index: 0,
    };
  }

  function currentTask(s) {
    return s.index < s.tasks.length ? s.tasks[s.index] : null;
  }

  function currentResult(s) {
    return s.index < s.results.length ? s.results[s.index] : null;
  }

  function isFinished(s) {
    return s.index >= s.tasks.length;
  }

  // How many more the current task asks for (0 when full or finished).
  function needed(s) {
    const r = currentResult(s);
    return r ? r.task.count - r.winners.length : 0;
  }

  function isCurrentComplete(s) {
    return needed(s) === 0 || s.remaining.length === 0;
  }

  function withCurrentResult(s, result) {
    return { ...s, results: s.results.map((r, i) => (i === s.index ? result : r)) };
  }

  function drawOne(s, rng = Math.random) {
    const r = currentResult(s);
    if (!r) throw new Error('所有任務都抽完了');
    if (isCurrentComplete(s)) throw new Error('這個任務已經抽滿了');
    const [winner] = pickRandom(s.remaining, 1, rng);
    const next = withCurrentResult(s, { ...r, winners: [...r.winners, winner] });
    return { ...next, remaining: s.remaining.filter(p => p.id !== winner.id) };
  }

  function nextTask(s) {
    if (!isCurrentComplete(s)) throw new Error('請先抽完這個任務');
    const r = currentResult(s);
    return { ...withCurrentResult(s, { ...r, shortfall: needed(s) }), index: s.index + 1 };
  }

  const api = {
    pickRandom, buildPool, validateSetup, createSession, currentTask, currentResult,
    isFinished, needed, isCurrentComplete, drawOne, nextTask,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DrawLots = Object.assign(root.DrawLots || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
