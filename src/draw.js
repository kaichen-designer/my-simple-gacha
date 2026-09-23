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
    // Names are unique after parsing, so they identify a person across roster edits.
    return students.map(s => ({ id: 'p:' + s.name, label: s.name, detail: P.groupLabel(s.group), group: s.group }));
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

  // Applies edited tasks and pool to a session in progress: assignments carry over by task name
  // (in order, up to the new count) as long as the winner is still in the pool; everyone else
  // is back in the pool; drawing resumes at the first task that still needs someone.
  function reconcileSession(old, tasks, pool) {
    const byId = new Map(pool.map(p => [p.id, p]));
    const previous = old.results.map(r => ({ name: r.task.name, winners: r.winners }));
    const taken = new Set();
    const results = tasks.map(task => {
      const i = previous.findIndex(p => p && p.name === task.name);
      let winners = [];
      if (i >= 0) {
        winners = previous[i].winners
          .filter(w => byId.has(w.id) && !taken.has(w.id))
          .slice(0, task.count)
          .map(w => byId.get(w.id));
        previous[i] = null;
      }
      winners.forEach(w => taken.add(w.id));
      return { task, winners, shortfall: 0 };
    });
    const index = results.findIndex(r => r.winners.length < r.task.count);
    return {
      tasks: tasks.slice(),
      remaining: pool.filter(p => !taken.has(p.id)),
      results,
      index: index < 0 ? tasks.length : index,
    };
  }

  const api = {
    reconcileSession,
    pickRandom, buildPool, validateSetup, createSession, currentTask, currentResult,
    isFinished, needed, isCurrentComplete, drawOne, nextTask,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DrawLots = Object.assign(root.DrawLots || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
