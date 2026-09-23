(function (root) {
  'use strict';

  // The teacher as a 24×31 pixel sprite. Every frame starts from the same standing body
  // (20 cells wide, padded by 2 on each side so raised or reaching arms fit) and swaps
  // in arm and leg poses.
  // K outline, H hair, h comb lines, p parting, G grey hair, g light grey, S skin, s skin shade,
  // L lens glint, E eye, M mouth, N jacket, n jacket shade, b lapel, B shirt, P trousers, O shoes.
  const BODY = [
    '......KKKKKKK.......',
    '....KKHHhHHhHKK.....',
    '....KHhHHhHHhphK....',
    '...KhHHhHHhHHpHHK...',
    '..KGHhHHhHHhHpHhGK..',
    '.KGgHHhHHhHHhphHgGK.',
    '.KGgHHHHHHHHHpHHgGK.',
    '.KGgHSSSSSSSSSSHgGK.',
    '.KGSSHHHSSSSHHHSSGK.',
    '.KGSSSSSSSSSSSSSSGK.',
    '.KGSSKKKSSSSKKKSSGK.',
    '.KGSKLSSKKKKLSSKSGK.',
    '.KsSKSESKSSKSESKSsK.',
    '.KsSSKKKSSSSKKKSSsK.',
    '.KsSSSSSSssSSSSSSsK.',
    '.KSSSSSSMMMMSSSSSSK.',
    '..KsSSSSSSSSSSSSsK..',
    '...KKsSSSSSSSSsKK...',
    '....KNNKsSSsKNNK....',
    '..KNNNbKBBBBKbNNNK..',
    '..KNNNbbKBBKbbNNNK..',
    '.KNNNNNbKBBKbNNNNNK.',
    '.KNnNNNNKBBKNNNNnNK.',
    '.KSnNNNNNKKNNNNNnSK.',
    '.KSnNNNNNKNNNNNNnSK.',
    '..KnNNNNNNNNNNNNnK..',
    '..KKKKKKKKKKKKKKKK..',
    '...KPPPPPKKPPPPPK...',
    '...KPPPPK..KPPPPK...',
    '..KOOOOOK..KOOOOOK..',
    '..KKKKKKK..KKKKKKK..',
  ];

  const LEGS = {
    stand: BODY.slice(27),
    walkA: ['...KPPPPPKKPPPPPK...', '...KPPPPK.KOOOOOK...', '..KOOOOOK.KKKKKKK...', '..KKKKKKK...........'],
    walkB: ['...KPPPPPKKPPPPPK...', '...KOOOOOK.KPPPPK...', '...KKKKKKK.KOOOOOK..', '...........KKKKKKK..'],
    tuck: ['...KPPPPPKKPPPPPK...', '...KOOOOOKKOOOOOK...', '...KKKKKKKKKKKKKK...', '....................'],
  };

  // [row, col, cells] overwrites on the padded 24-wide frame.
  const ARMS_UP = [
    [11, 1, 'KKK'], [11, 20, 'KKK'],
    [12, 1, 'KSK'], [12, 20, 'KSK'],
    [13, 1, 'KSK'], [13, 20, 'KSK'],
    ...[14, 15, 16, 17, 18].flatMap(r => [[r, 1, 'KNK'], [r, 20, 'KNK']]),
    [19, 1, 'KNNN'], [19, 19, 'NNNK'],
    [23, 4, 'N'], [23, 19, 'N'], [24, 4, 'N'], [24, 19, 'N'],
  ];
  const REACH_LOW = [
    [18, 19, 'KKKKK'], [19, 19, 'NNNSK'], [20, 19, 'NNNSK'], [21, 20, 'KKKK'],
    [23, 19, 'N'], [24, 19, 'N'],
  ];
  const REACH_HIGH = [
    [17, 19, 'KKKKK'], [18, 18, 'KNNNSK'], [19, 19, 'NNNSK'], [20, 20, 'KKKK'],
    [23, 19, 'N'], [24, 19, 'N'],
  ];

  function frame(legs = 'stand', overlays = [], edits = []) {
    const rows = [...BODY.slice(0, 27), ...LEGS[legs]].map(r => '..' + r + '..');
    for (const [r, c, cells] of [...overlays, ...edits]) {
      rows[r] = rows[r].slice(0, c) + cells + rows[r].slice(c + cells.length);
    }
    return rows;
  }

  // Blink: the eye row with the pupils turned into closed lids.
  const EYE_ROW = 12;
  const CLOSED_EYES = [[EYE_ROW, 2, BODY[EYE_ROW].replace(/E/g, 's')]];

  const FRAMES = {
    idle: frame(),
    blink: frame('stand', [], CLOSED_EYES),
    walkA: frame('walkA'),
    walkB: frame('walkB'),
    jump: frame('tuck', ARMS_UP),
    climbA: frame('walkA', ARMS_UP),
    climbB: frame('walkB', ARMS_UP),
    crankA: frame('stand', REACH_LOW),
    crankB: frame('stand', REACH_HIGH),
  };
  const FRAME_W = 24;
  const FRAME_H = 31;

  const PALETTE = {
    K: '#1a1c2c', H: '#34343c', h: '#5a5a66', p: '#202026', G: '#7d7d86', g: '#b4b4bc',
    S: '#f2c7a5', s: '#d9a584', L: '#ffffff', E: '#1a1c2c', M: '#c28372',
    N: '#2b3a67', n: '#1e2a4d', b: '#40548e', B: '#16171d', P: '#26272f', O: '#0f1014',
  };

  function drawFrame(ctx, name, scale) {
    ctx.clearRect(0, 0, FRAME_W * scale, FRAME_H * scale);
    FRAMES[name].forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        ctx.fillStyle = PALETTE[ch];
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    });
  }

  const SCALE = 4;
  // Where the reaching hand sits inside the sprite, in CSS px (crankA, column 22, rows 19–20).
  const HAND_X = 22 * SCALE + SCALE / 2;
  const HAND_Y = 20 * SCALE;
  const SPRITE_W = FRAME_W * SCALE;
  const SPRITE_H = FRAME_H * SCALE;

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  function prefersReducedMotion() {
    return typeof root.matchMedia === 'function' &&
      root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Puts the teacher (plus the ledge and ladder he climbs) into the gacha machine built by
  // createMachine. Returns the actor hooks the machine calls while dispensing.
  function createTeacher(gachaEl) {
    const machine = gachaEl.querySelector('.gacha-machine');
    const body = gachaEl.querySelector('.gacha-body');
    const knob = gachaEl.querySelector('.gacha-knob');
    const ledge = document.createElement('div');
    ledge.className = 'gacha-ledge';
    const ladder = document.createElement('div');
    ladder.className = 'gacha-ladder';
    const el = document.createElement('div');
    el.className = 'teacher';
    el.innerHTML = '<canvas></canvas><div class="teacher-bubble" hidden>！</div>';
    machine.append(ladder, ledge, el);
    const canvas = el.querySelector('canvas');
    canvas.width = SPRITE_W;
    canvas.height = SPRITE_H;
    const ctx = canvas.getContext('2d');
    const bubble = el.querySelector('.teacher-bubble');

    let spot = 'off'; // off | floor | ledge
    let pos = { x: 0, y: 0 };
    let pose = 'idle';
    let looping = null;
    let blinkTimer = null;

    function show(name) {
      pose = name;
      drawFrame(ctx, name, SCALE);
    }

    // Alternates frames until stopped.
    function cycle(names, every) {
      stopCycle();
      let i = 0;
      show(names[0]);
      looping = setInterval(() => show(names[++i % names.length]), every);
    }

    function stopCycle() {
      if (looping) clearInterval(looping);
      looping = null;
    }

    function rel(target) {
      const box = machine.getBoundingClientRect();
      const r = target.getBoundingClientRect();
      return { left: r.left - box.left, right: r.right - box.left, top: r.top - box.top, bottom: r.bottom - box.top,
        cx: r.left - box.left + r.width / 2, cy: r.top - box.top + r.height / 2 };
    }

    // Everything is placed relative to the knob, so the hand meets it at any screen size.
    function layout() {
      const k = rel(knob);
      const b = rel(body);
      const onLedgeX = k.cx - HAND_X;
      const ledgeTop = k.cy - HAND_Y + SPRITE_H;
      const ledgeLeft = onLedgeX + 4 * SCALE;
      const ledgeWidth = 14 * SCALE;
      Object.assign(ledge.style, { left: ledgeLeft + 'px', top: ledgeTop + 'px', width: ledgeWidth + 'px' });
      const ladderLeft = ledgeLeft + SCALE * 2;
      Object.assign(ladder.style, { left: ladderLeft + 'px', top: ledgeTop + 'px', height: (b.bottom - ledgeTop) + 'px' });
      return {
        floorY: b.bottom - SPRITE_H,
        ledge: { x: onLedgeX, y: ledgeTop - SPRITE_H },
        ladderX: ladderLeft + 7 * SCALE - SPRITE_W / 2,
        stand: { x: ladderLeft - SPRITE_W + 2 * SCALE, y: b.bottom - SPRITE_H },
        offstage: { x: -SPRITE_W - 24, y: b.bottom - SPRITE_H },
      };
    }

    function place(p) {
      pos = p;
      el.style.transform = `translate(${p.x}px, ${p.y}px)`;
    }

    async function move(to, ms, easing = 'linear') {
      const from = pos;
      await el.animate(
        [{ transform: `translate(${from.x}px, ${from.y}px)` }, { transform: `translate(${to.x}px, ${to.y}px)` }],
        { duration: ms, easing },
      ).finished;
      place(to);
    }

    function startBlinking() {
      stopBlinking();
      const tick = () => {
        blinkTimer = setTimeout(async () => {
          if (pose === 'idle' && !looping) {
            show('blink');
            await wait(140);
            if (pose === 'blink') show('idle');
          }
          tick();
        }, 2500 + Math.random() * 2000);
      };
      tick();
    }

    function stopBlinking() {
      if (blinkTimer) clearTimeout(blinkTimer);
      blinkTimer = null;
    }

    function idle() {
      stopCycle();
      show('idle');
    }

    // Off stage again, ready to walk in on the first draw.
    function reset() {
      stopCycle();
      bubble.hidden = true;
      const L = layout();
      spot = prefersReducedMotion() ? 'floor' : 'off';
      place(spot === 'floor' ? L.stand : L.offstage);
      el.style.opacity = spot === 'floor' ? '1' : '0';
      show('idle');
      startBlinking();
    }

    // Walks in on the first draw, then jumps onto the ledge by the knob.
    async function climbUp() {
      const L = layout();
      bubble.hidden = true;
      if (spot === 'off') {
        el.style.opacity = '1';
        cycle(['walkA', 'idle', 'walkB', 'idle'], 110);
        await move(L.stand, 1000);
        idle();
        await wait(150);
        spot = 'floor';
      }
      if (spot === 'floor') {
        show('jump');
        const peak = { x: (pos.x + L.ledge.x) / 2, y: Math.min(pos.y, L.ledge.y) - 10 * SCALE };
        await el.animate([
          { transform: `translate(${pos.x}px, ${pos.y}px)` },
          { transform: `translate(${peak.x}px, ${peak.y}px)`, easing: 'ease-in' },
          { transform: `translate(${L.ledge.x}px, ${L.ledge.y}px)` },
        ], { duration: 520, easing: 'ease-out' }).finished;
        place(L.ledge);
        spot = 'ledge';
        show('crankA');
      }
    }

    async function crank(ms) {
      cycle(['crankA', 'crankB'], 170);
      await wait(ms);
      stopCycle();
      show('crankA');
    }

    // Climbs down the ladder and steps back beside the machine.
    async function climbDown() {
      if (spot !== 'ledge') return;
      const L = layout();
      show('climbA');
      await move({ x: L.ladderX, y: pos.y }, 160);
      cycle(['climbA', 'climbB'], 120);
      await move({ x: L.ladderX, y: L.floorY }, 700);
      cycle(['walkA', 'idle', 'walkB', 'idle'], 100);
      await move(L.stand, 300);
      spot = 'floor';
      idle();
    }

    async function celebrate() {
      bubble.hidden = false;
      show('jump');
      await el.animate(
        [{ transform: `translate(${pos.x}px, ${pos.y}px)` },
          { transform: `translate(${pos.x}px, ${pos.y - 6 * SCALE}px)` },
          { transform: `translate(${pos.x}px, ${pos.y}px)` }],
        { duration: 380, easing: 'ease-out' },
      ).finished;
      idle();
      await wait(700);
      bubble.hidden = true;
    }

    function relayout() {
      if (spot === 'off') return;
      const L = layout();
      if (!looping) place(spot === 'ledge' ? L.ledge : L.stand);
    }

    new ResizeObserver(relayout).observe(machine);
    reset();
    return { reset, climbUp, crank, climbDown, celebrate };
  }

  const api = { FRAMES, PALETTE, FRAME_W, FRAME_H, drawFrame, createTeacher };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DrawLots = Object.assign(root.DrawLots || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
