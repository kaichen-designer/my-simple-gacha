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

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mix(hex, toward, t) {
    return `rgb(${hexToRgb(hex).map(v => Math.round(v + (toward - v) * t)).join(',')})`;
  }

  // Base colour plus the highlight and shadow shades used for 3D shading.
  function tones(hex) {
    return { c: hex, light: mix(hex, 255, 0.45), dark: mix(hex, 0, 0.35) };
  }

  // Air jet from the bottom of the globe: strongest on the lowest balls, with some swirl.
  function applyBlow(balls, R, dt, rand = Math.random) {
    for (const b of balls) {
      if (b.exiting) continue;
      const depth = (b.y + R) / (2 * R);
      b.vy -= 5200 * (0.35 + 0.65 * depth) * (0.6 + 0.8 * rand()) * dt;
      b.vx += (rand() - 0.5) * 4000 * dt;
    }
  }

  // Globe coordinates: centre (0, 0), radius R, y grows downwards.
  // opts.hole is the half-width of the exit hole at the bottom; only balls marked
  // `exiting` may pass through it, and they are steered towards it.
  function stepPhysics(balls, R, dt, opts = {}) {
    const hole = opts.hole || 0;
    for (const b of balls) {
      b.vy += GRAVITY * dt;
      if (b.dropping) {
        // Funnel a dropping ball straight down the middle of the hole.
        b.x *= 0.85;
        b.vx = 0;
      } else if (b.exiting) {
        // Steer towards the hole, damped so it settles there instead of swinging past it.
        b.vx -= b.x * 60 * dt;
        b.vx *= 0.9;
      }
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
      for (const b of balls) keepInside(b, R, hole);
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
    // An exiting ball acts as if infinitely heavy, so it shoves its way to the hole.
    const wa = a.exiting ? 0 : b.exiting ? 1 : 0.5;
    const wb = 1 - wa;
    a.x -= nx * (min - d) * wa; a.y -= ny * (min - d) * wa;
    b.x += nx * (min - d) * wb; b.y += ny * (min - d) * wb;
    const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rv < 0) {
      const j = -(1 + 0.3) * rv;
      a.vx -= j * nx * wa; a.vy -= j * ny * wa;
      b.vx += j * nx * wb; b.vy += j * ny * wb;
    }
  }

  function keepInside(b, R, hole) {
    if (b.dropping) return;
    if (b.exiting && hole && b.y > 0 && Math.abs(b.x) < hole - b.r * 0.9) {
      // Lined up with the hole: from now on it falls out and is never pushed back in.
      b.dropping = true;
      return;
    }
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
      <div class="gacha-collar" aria-hidden="true"></div>
      <div class="gacha-body">
        <div class="gacha-knob" aria-hidden="true"></div>
        <div class="gacha-chute" aria-hidden="true"></div>
      </div>
      <div class="gacha-floor" aria-hidden="true"></div>
      <p class="gacha-count" aria-live="polite"></p>
    </div>
    <div class="gacha-reveal" aria-live="polite">
      <p class="reveal-hint">按「抽！」轉動扭蛋機</p>
      <div class="capsule" hidden>
        <div class="cap-top"></div><div class="cap-bottom"></div>
      </div>
      <div class="reveal-card" hidden><div class="reveal-label"></div><div class="reveal-detail"></div></div>
    </div>`;

  const BLOW_MS = 800;
  const SETTLE_MS = 600;
  const EXIT_TIMEOUT_MS = 2500;

  const PIX = 4; // CSS px per "pixel"
  const PIXEL_INK = '#1a1c2c';

  // Pixel-art capsule: hard outline, lighter top half, dark seam row and a white glint.
  // `clip` ({ c, R }) hides cells outside the globe so an exiting ball vanishes into the hole.
  function drawPixelBall(ctx, x, y, r, color, clip, pix = PIX) {
    const t = tones(color);
    const x0 = Math.floor((x - r) / pix) * pix;
    const y0 = Math.floor((y - r) / pix) * pix;
    for (let py = y0; py < y + r; py += pix) {
      for (let px = x0; px < x + r; px += pix) {
        const dx = px + pix / 2 - x;
        const dy = py + pix / 2 - y;
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        if (clip && Math.hypot(px + pix / 2 - clip.c, py + pix / 2 - clip.c) > clip.R) continue;
        let fill;
        if (d > r - pix) fill = PIXEL_INK;
        else if (Math.abs(dy) < pix / 2) fill = t.dark;
        else if (dx > -r * 0.6 && dx < -r * 0.15 && dy > -r * 0.65 && dy < -r * 0.3) fill = '#ffffff';
        else fill = dy < 0 ? t.light : t.c;
        ctx.fillStyle = fill;
        ctx.fillRect(px, py, pix, pix);
      }
    }
  }

  const RIM = PIX * 2; // thickness of the globe's outline

  // Pixel globe, back layer: dark glass fill and the black exit hole in the rim.
  // R is the inner radius the balls live in; the rim sits just outside it.
  function drawPixelGlobe(ctx, c, R, hole) {
    const outer = R + RIM;
    for (let py = 0; py < c * 2; py += PIX) {
      for (let px = 0; px < c * 2; px += PIX) {
        const dx = px + PIX / 2 - c;
        const dy = py + PIX / 2 - c;
        const d = Math.hypot(dx, dy);
        if (d > outer) continue;
        ctx.fillStyle = dy > 0 && Math.abs(dx) < hole && d > R - PIX ? '#000000' : '#29366f';
        ctx.fillRect(px, py, PIX, PIX);
      }
    }
  }

  // Front layer, drawn over the balls: the rim (open at the hole) and a glass glint, so no
  // ball ever appears to poke out of the globe.
  function drawPixelRim(ctx, c, R, hole) {
    const outer = R + RIM;
    for (let py = 0; py < c * 2; py += PIX) {
      for (let px = 0; px < c * 2; px += PIX) {
        const dx = px + PIX / 2 - c;
        const dy = py + PIX / 2 - c;
        const d = Math.hypot(dx, dy);
        if (d > outer) continue;
        const inHole = dy > 0 && Math.abs(dx) < hole;
        const a = Math.atan2(dy, dx);
        if (d > R && !inHole) ctx.fillStyle = '#f4f4f4';
        else if (d > R - PIX * 3 && d < R - PIX && a > -2.7 && a < -2.0) ctx.fillStyle = '#ffffff';
        else continue;
        ctx.fillRect(px, py, PIX, PIX);
      }
    }
  }

  // A small pixel sprite of the capsule, used for the rolling ball and the opened capsule.
  function pixelSprite(color) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 16;
    drawPixelBall(cv.getContext('2d'), 8, 8, 8, color, null, 1);
    return `url(${cv.toDataURL()})`;
  }

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
    const body = q('.gacha-body');
    const count = q('.gacha-count');
    const reveal = q('.gacha-reveal');
    const hint = q('.reveal-hint');
    const capsule = q('.capsule');
    const card = q('.reveal-card');

    let balls = [];
    let R = 0;
    let size = 0;
    let hole = 0;
    let blowUntil = 0;
    let exit = null; // { ball, resolve } while a ball is on its way out
    let last = performance.now();
    let running = true;
    let actor = null; // optional { reset, climbUp, crank, climbDown, celebrate }

    function resize() {
      const newSize = globe.clientWidth;
      if (!newSize || newSize === size) return;
      const dpr = root.devicePixelRatio || 1;
      canvas.width = Math.round(newSize * dpr);
      canvas.height = Math.round(newSize * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const newR = newSize / 2 - 4 - RIM;
      const scale = R ? newR / R : 1;
      for (const b of balls) { b.x *= scale; b.y *= scale; b.r *= scale; }
      size = newSize;
      R = newR;
      setHole(balls.length ? balls[0].r : ballRadius(1, R));
    }

    // The hole is sized for the current balls so one can just pass through.
    function setHole(r) {
      hole = r * 1.35;
    }

    function updateCount() {
      count.textContent = `球池剩 ${balls.length} 顆`;
    }

    function draw() {
      ctx.clearRect(0, 0, size, size);
      const c = size / 2;
      drawPixelGlobe(ctx, c, R, hole);
      const clip = { c, R };
      // Back to front, so lower balls overlap the ones behind them.
      for (const b of [...balls].sort((a, b2) => a.y - b2.y)) drawPixelBall(ctx, c + b.x, c + b.y, b.r, b.color, clip);
      drawPixelRim(ctx, c, R, hole);
    }

    function frame(now) {
      if (!running) return;
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      if (container.offsetParent !== null) {
        resize();
        if (now < blowUntil) applyBlow(balls, R, dt);
        stepPhysics(balls, R, dt / 2, { hole });
        stepPhysics(balls, R, dt / 2, { hole });
        if (exit && exit.ball.y - exit.ball.r > R) exit.resolve();
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
      setHole(r);
      updateCount();
      showHint();
      if (actor) actor.reset();
    }

    function relRect(el) {
      const box = container.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      return {
        x: rect.left - box.left + rect.width / 2,
        y: rect.top - box.top + rect.height / 2,
        top: rect.top - box.top,
        bottom: rect.bottom - box.top,
      };
    }

    // Lets the chosen ball roll through the bottom hole; resolves once it has left the globe.
    function rollOut(ball) {
      return new Promise(resolve => {
        const done = () => { clearTimeout(timer); exit = null; resolve(); };
        const timer = setTimeout(done, EXIT_TIMEOUT_MS);
        ball.exiting = true;
        exit = { ball, resolve: done };
      });
    }

    // The ball drops out of the chute, rolls along the floor and lifts into the reveal area.
    async function chuteToReveal(color, d) {
      const from = relRect(chute);
      const floorY = relRect(body).bottom - d / 2;
      const to = relRect(reveal);
      const endSize = capsule.offsetWidth || 160;
      const el = document.createElement('div');
      el.className = 'fly-ball';
      setSprite(el, color);
      el.style.width = el.style.height = d + 'px';
      container.append(el);
      const rollTurns = Math.abs(to.x - from.x) / (Math.PI * d);
      const at = (x, y, turns = 0, s = 1) =>
        `translate(${x - d / 2}px, ${y - d / 2}px) rotate(${turns * 360}deg) scale(${s})`;
      await el.animate([
        { transform: at(from.x, from.top + d / 2), opacity: 0 },
        { transform: at(from.x, from.y), opacity: 1, offset: 0.15 },
        { transform: at(from.x, floorY), offset: 0.25, easing: 'ease-out' },
        { transform: at(to.x, floorY, rollTurns), offset: 0.7, easing: 'ease-in-out' },
        { transform: at(to.x, to.y, rollTurns, endSize / d) },
      ], { duration: 1600, fill: 'forwards' }).finished;
      el.remove();
    }

    function setSprite(el, color) {
      el.style.setProperty('--sprite', pixelSprite(color));
    }

    async function openCapsule(item, color, reduce) {
      q('.reveal-label').textContent = item.label;
      q('.reveal-detail').textContent = item.detail;
      hint.hidden = true;
      if (reduce) {
        card.hidden = false;
        return;
      }
      setSprite(capsule, color);
      capsule.hidden = false;
      await capsule.animate(
        [{ transform: 'rotate(0)' }, { transform: 'rotate(-10deg)' }, { transform: 'rotate(8deg)' }, { transform: 'rotate(0)' }],
        { duration: 450, easing: 'ease-in-out' },
      ).finished;
      const opts = { duration: 600, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' };
      const parts = [
        q('.cap-top').animate([
          { transform: 'none', opacity: 1 },
          { transform: 'translate(-20px, -70px) rotate(-28deg)', opacity: 1, offset: 0.5 },
          { transform: 'translate(-40px, -110px) rotate(-40deg)', opacity: 0 },
        ], opts),
        q('.cap-bottom').animate([
          { transform: 'none', opacity: 1 },
          { transform: 'translateY(20px)', opacity: 1, offset: 0.5 },
          { transform: 'translateY(70px)', opacity: 0 },
        ], opts),
      ];
      card.hidden = false;
      const pop = card.animate([
        { transform: 'translateY(30px) scale(0.2)', opacity: 0 },
        { transform: 'translateY(-6px) scale(1.06)', opacity: 1, offset: 0.7 },
        { transform: 'none', opacity: 1 },
      ], { duration: 600, delay: 150, easing: 'cubic-bezier(.34,1.4,.64,1)', fill: 'backwards' });
      await Promise.all([...parts.map(a => a.finished), pop.finished]);
      parts.forEach(a => a.cancel());
      capsule.hidden = true;
    }

    // Blows the balls up, lets them settle, rolls `item`'s ball out through the bottom hole and
    // the chute, then opens it. Resolves when the card is shown.
    async function dispense(item) {
      const reduce = prefersReducedMotion();
      const color = ballColor(item.group);
      showHint();
      hint.hidden = true;
      const ball = balls.find(b => b.id === item.id);
      const d = Math.max(20, ball ? ball.r * 2 : 24);
      let down = null;
      if (!reduce && ball) {
        if (actor) await actor.climbUp();
        knob.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }],
          { duration: BLOW_MS + SETTLE_MS, easing: 'ease-in-out' });
        if (actor) actor.crank(BLOW_MS + SETTLE_MS);
        blowUntil = performance.now() + BLOW_MS;
        await wait(BLOW_MS + SETTLE_MS);
        // The teacher climbs down while the ball rolls out.
        if (actor) down = actor.climbDown();
        await rollOut(ball);
      }
      balls = balls.filter(b => b.id !== item.id);
      updateCount();
      if (!reduce) await chuteToReveal(color, d);
      if (down) await down;
      await openCapsule(item, color, reduce);
      if (actor && !reduce) actor.celebrate();
    }

    function setActor(a) {
      actor = a;
    }

    const observer = new ResizeObserver(resize);
    observer.observe(globe);
    root.requestAnimationFrame(frame);

    function destroy() {
      running = false;
      observer.disconnect();
      container.replaceChildren();
    }

    return { setBalls, dispense, showHint, setActor, destroy };
  }

  const api = { PALETTE, UNGROUPED_COLOR, ballColor, ballRadius, tones, applyBlow, stepPhysics, createMachine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DrawLots = Object.assign(root.DrawLots || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
