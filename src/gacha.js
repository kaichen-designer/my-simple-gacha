(function (root) {
  'use strict';

  const PALETTE = ['#E07A5F', '#3D5A80', '#81B29A', '#E9B949', '#9C89B8'];
  const UNGROUPED_COLOR = '#B5B5B0';
  const GRAVITY = 1400;
  const MAX_SPEED = 2200;

  function ballColor(group) {
    return group === null ? UNGROUPED_COLOR : PALETTE[group % PALETTE.length];
  }

  // Balls fill at most half the globe's area, and never look oversized when few are left.
  function ballRadius(n, R) {
    return Math.min(R * 0.2, R * Math.sqrt(0.5 / Math.max(n, 1)));
  }

  // Globe coordinates: centre (0, 0), radius R, y grows downwards.
  function stepPhysics(balls, R, dt) {
    for (const b of balls) {
      b.vy += GRAVITY * dt;
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > MAX_SPEED) { b.vx *= MAX_SPEED / speed; b.vy *= MAX_SPEED / speed; }
      b.vx *= 0.995;
      b.vy *= 0.995;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    for (let iter = 0; iter < 4; iter++) {
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) collide(balls[i], balls[j]);
      }
      for (const b of balls) keepInside(b, R);
    }
  }

  function collide(a, b) {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let d = Math.hypot(dx, dy);
    const min = a.r + b.r;
    if (d >= min) return;
    if (d === 0) { dx = 0.01; dy = 0; d = 0.01; }
    const nx = dx / d;
    const ny = dy / d;
    const push = (min - d) / 2;
    a.x -= nx * push; a.y -= ny * push;
    b.x += nx * push; b.y += ny * push;
    const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rv < 0) {
      const j = (-(1 + 0.3) * rv) / 2;
      a.vx -= j * nx; a.vy -= j * ny;
      b.vx += j * nx; b.vy += j * ny;
    }
  }

  function keepInside(b, R) {
    const d = Math.hypot(b.x, b.y);
    const lim = R - b.r;
    if (d <= lim) return;
    const nx = d === 0 ? 0 : b.x / d;
    const ny = d === 0 ? 1 : b.y / d;
    b.x = nx * lim;
    b.y = ny * lim;
    const vn = b.vx * nx + b.vy * ny;
    if (vn > 0) {
      b.vx -= (1 + 0.4) * vn * nx;
      b.vy -= (1 + 0.4) * vn * ny;
      b.vx *= 0.98;
      b.vy *= 0.98;
    }
  }

  function prefersReducedMotion() {
    return typeof root.matchMedia === 'function' &&
      root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  const MACHINE_HTML = `
    <div class="gacha-machine">
      <div class="gacha-globe"><canvas class="gacha-canvas"></canvas></div>
      <div class="gacha-body">
        <div class="gacha-knob" aria-hidden="true"></div>
        <div class="gacha-chute" aria-hidden="true"></div>
      </div>
      <p class="gacha-count" aria-live="polite"></p>
    </div>
    <div class="gacha-reveal" aria-live="polite">
      <p class="reveal-hint">按「抽！」轉動扭蛋機</p>
      <div class="capsule" hidden><div class="cap-top"></div><div class="cap-bottom"></div></div>
      <div class="reveal-card" hidden><div class="reveal-label"></div><div class="reveal-detail"></div></div>
    </div>`;

  // Builds the machine inside `container`. The globe always shows exactly the balls given to
  // setBalls minus those dispensed since.
  function createMachine(container) {
    container.classList.add('gacha');
    container.innerHTML = MACHINE_HTML;
    const q = sel => container.querySelector(sel);
    const globe = q('.gacha-globe');
    const canvas = q('.gacha-canvas');
    const ctx = canvas.getContext('2d');
    const knob = q('.gacha-knob');
    const chute = q('.gacha-chute');
    const count = q('.gacha-count');
    const reveal = q('.gacha-reveal');
    const hint = q('.reveal-hint');
    const capsule = q('.capsule');
    const card = q('.reveal-card');

    let balls = [];
    let R = 0;
    let size = 0;
    let shakeUntil = 0;
    let last = performance.now();

    function resize() {
      const newSize = globe.clientWidth;
      if (!newSize || newSize === size) return;
      const dpr = root.devicePixelRatio || 1;
      canvas.width = Math.round(newSize * dpr);
      canvas.height = Math.round(newSize * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const newR = newSize / 2 - 4;
      const scale = R ? newR / R : 1;
      for (const b of balls) { b.x *= scale; b.y *= scale; }
      size = newSize;
      R = newR;
      fitRadii();
    }

    function fitRadii() {
      const r = ballRadius(balls.length, R);
      for (const b of balls) b.r = r;
    }

    function updateCount() {
      count.textContent = `球池剩 ${balls.length} 顆`;
    }

    function draw() {
      ctx.clearRect(0, 0, size, size);
      const c = size / 2;
      for (const b of balls) {
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(c + b.x, c + b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        // Lighter top half reads as a two-part capsule.
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.beginPath();
        ctx.arc(c + b.x, c + b.y, b.r, Math.PI, 0);
        ctx.fill();
      }
    }

    function frame(now) {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      if (container.offsetParent !== null) {
        resize();
        if (now < shakeUntil) {
          for (const b of balls) {
            b.vx += (Math.random() - 0.5) * 9000 * dt;
            b.vy -= Math.random() * 9000 * dt;
          }
        }
        stepPhysics(balls, R, dt / 2);
        stepPhysics(balls, R, dt / 2);
        draw();
      }
      root.requestAnimationFrame(frame);
    }

    function showHint() {
      hint.hidden = false;
      capsule.hidden = true;
      card.hidden = true;
    }

    function setBalls(items) {
      resize();
      const r = ballRadius(items.length, R || 100);
      balls = items.map(item => ({
        id: item.id,
        color: ballColor(item.group),
        r,
        x: (Math.random() - 0.5) * (R || 100),
        y: -Math.random() * (R || 100) * 0.6,
        vx: 0,
        vy: 0,
      }));
      updateCount();
      showHint();
    }

    function centerOf(el) {
      const box = container.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      return { x: rect.left - box.left + rect.width / 2, y: rect.top - box.top + rect.height / 2 };
    }

    async function flyToReveal(color, fromSize) {
      const from = centerOf(chute);
      const to = centerOf(reveal);
      const endSize = capsule.offsetWidth || 150;
      const ball = document.createElement('div');
      ball.className = 'fly-ball';
      ball.style.setProperty('--cap', color);
      ball.style.width = ball.style.height = fromSize + 'px';
      container.append(ball);
      const at = (p, s = 1) => `translate(${p.x - fromSize / 2}px, ${p.y - fromSize / 2}px) scale(${s})`;
      await ball.animate([
        { transform: at({ x: from.x, y: from.y - 30 }), opacity: 0 },
        { transform: at(from), opacity: 1, offset: 0.3 },
        { transform: at({ x: from.x, y: from.y + 10 }), offset: 0.45 },
        { transform: at(to, endSize / fromSize) },
      ], { duration: 1000, easing: 'ease-in-out', fill: 'forwards' }).finished;
      ball.remove();
    }

    async function openCapsule(item, color, reduce) {
      q('.reveal-label').textContent = item.label;
      q('.reveal-detail').textContent = item.detail;
      hint.hidden = true;
      if (reduce) {
        card.hidden = false;
        return;
      }
      capsule.style.setProperty('--cap', color);
      capsule.hidden = false;
      await capsule.animate(
        [{ transform: 'rotate(0)' }, { transform: 'rotate(-10deg)' }, { transform: 'rotate(8deg)' }, { transform: 'rotate(0)' }],
        { duration: 450, easing: 'ease-in-out' },
      ).finished;
      const opts = { duration: 500, easing: 'ease-out', fill: 'forwards' };
      const top = q('.cap-top').animate(
        [{ transform: 'none', opacity: 1 }, { transform: 'translate(-30px, -90px) rotate(-35deg)', opacity: 0 }], opts);
      const bottom = q('.cap-bottom').animate(
        [{ transform: 'none', opacity: 1 }, { transform: 'translateY(60px)', opacity: 0 }], opts);
      card.hidden = false;
      const pop = card.animate(
        [{ transform: 'scale(0.2)', opacity: 0 }, { transform: 'scale(1.06)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }],
        { duration: 550, easing: 'cubic-bezier(.34, 1.4, .64, 1)' });
      await Promise.all([top.finished, bottom.finished, pop.finished]);
      top.cancel();
      bottom.cancel();
      capsule.hidden = true;
    }

    // Spins, shakes, drops `item`'s ball out of the globe and opens it. Resolves when the card is shown.
    async function dispense(item) {
      const reduce = prefersReducedMotion();
      const color = ballColor(item.group);
      showHint();
      hint.hidden = true;
      const ball = balls.find(b => b.id === item.id);
      const fromSize = Math.max(18, ball ? ball.r * 2 : 24);
      if (!reduce) {
        knob.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 800, easing: 'ease-in-out' });
        shakeUntil = performance.now() + 1000;
        await wait(1100);
      }
      balls = balls.filter(b => b.id !== item.id);
      updateCount();
      if (!reduce) await flyToReveal(color, fromSize);
      await openCapsule(item, color, reduce);
    }

    new ResizeObserver(resize).observe(globe);
    root.requestAnimationFrame(frame);
    return { setBalls, dispense, showHint };
  }

  const api = { PALETTE, UNGROUPED_COLOR, ballColor, ballRadius, stepPhysics, createMachine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DrawLots = Object.assign(root.DrawLots || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
