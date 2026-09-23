(function (root) {
  'use strict';

  // Delays grow linearly so the names visibly slow down before stopping.
  function rollSchedule(duration, steps = 20) {
    if (duration <= 0) return [];
    const total = (steps * (steps + 1)) / 2;
    return Array.from({ length: steps }, (_, i) => Math.round(((i + 1) / total) * duration));
  }

  function prefersReducedMotion() {
    return typeof root.matchMedia === 'function' &&
      root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function play(stageEl, labels, finalText, opts = {}) {
    const duration = prefersReducedMotion() ? 0 : (opts.duration ?? 2000);
    const delays = rollSchedule(duration);
    const rng = opts.rng || Math.random;
    return new Promise(resolve => {
      let i = 0;
      const tick = () => {
        if (i >= delays.length || labels.length === 0) {
          stageEl.textContent = finalText;
          stageEl.classList.remove('rolling');
          resolve();
          return;
        }
        stageEl.textContent = labels[Math.floor(rng() * labels.length)];
        setTimeout(tick, delays[i++]);
      };
      stageEl.classList.add('rolling');
      tick();
    });
  }

  const api = { rollSchedule, play };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DrawLots = Object.assign(root.DrawLots || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
