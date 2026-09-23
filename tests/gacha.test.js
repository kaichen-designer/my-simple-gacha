const test = require('node:test');
const assert = require('node:assert/strict');
const { ballRadius, stepPhysics, applyBlow, ballColor, tones, PALETTE, UNGROUPED_COLOR } = require('../src/gacha.js');

test('ballRadius shrinks as the pool grows and always fits the globe', () => {
  const R = 100;
  assert.ok(ballRadius(1, R) <= R * 0.2);
  assert.ok(ballRadius(10, R) > ballRadius(40, R));
  for (const n of [1, 5, 12, 40, 80]) {
    const r = ballRadius(n, R);
    // Total ball area stays at or under half the globe area.
    assert.ok(n * r * r <= 0.5 * R * R + 1e-9, `n=${n} r=${r}`);
  }
});

test('stepPhysics keeps every ball inside the globe', () => {
  const R = 100;
  const r = ballRadius(40, R);
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const balls = Array.from({ length: 40 }, () => ({
    x: (rand() - 0.5) * R, y: (rand() - 0.5) * R, vx: (rand() - 0.5) * 900, vy: (rand() - 0.5) * 900, r,
  }));
  for (let i = 0; i < 600; i++) stepPhysics(balls, R, 1 / 60);
  for (const b of balls) {
    assert.ok(Math.hypot(b.x, b.y) + b.r <= R + 0.5, `ball escaped at ${b.x},${b.y}`);
    assert.ok(Number.isFinite(b.vx) && Number.isFinite(b.vy));
  }
});

test('stepPhysics lets balls settle towards the bottom', () => {
  const R = 100;
  const balls = [{ x: 0, y: -50, vx: 0, vy: 0, r: 10 }];
  for (let i = 0; i < 600; i++) stepPhysics(balls, R, 1 / 60);
  assert.ok(balls[0].y > 80, `y=${balls[0].y}`);
});

test('ballColor picks a palette color per group and grey for ungrouped', () => {
  assert.equal(ballColor(1), PALETTE[1 % PALETTE.length]);
  assert.equal(ballColor(1 + PALETTE.length), ballColor(1));
  assert.equal(ballColor(null), UNGROUPED_COLOR);
});

function seededRand(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function pile(n, R, rand) {
  const r = ballRadius(n, R);
  return Array.from({ length: n }, (_, i) => ({
    id: i, x: (rand() - 0.5) * R, y: (rand() - 0.5) * R, vx: 0, vy: 0, r,
  }));
}

test('non-exiting balls never fall through the exit hole', () => {
  const R = 100;
  const rand = seededRand(7);
  const balls = pile(30, R, rand);
  const hole = balls[0].r * 1.3;
  for (let i = 0; i < 600; i++) stepPhysics(balls, R, 1 / 60, { hole });
  for (const b of balls) assert.ok(Math.hypot(b.x, b.y) + b.r <= R + 0.5);
});

test('the exiting ball rolls to the bottom hole and leaves the globe', () => {
  const R = 100;
  const rand = seededRand(3);
  const balls = pile(30, R, rand);
  for (let i = 0; i < 300; i++) stepPhysics(balls, R, 1 / 60);
  const hole = balls[0].r * 1.3;
  // Pick the ball sitting highest up, so it has to push through the pile.
  const target = balls.reduce((a, b) => (b.y < a.y ? b : a));
  target.exiting = true;
  let steps = 0;
  while (target.y - target.r <= R && steps < 600) {
    stepPhysics(balls, R, 1 / 60, { hole });
    steps++;
  }
  assert.ok(target.y - target.r > R, `still inside after ${steps} steps at ${target.x},${target.y}`);
  for (const b of balls) if (b !== target) assert.ok(Math.hypot(b.x, b.y) + b.r <= R + 0.5);
});

test('applyBlow pushes balls upwards on average', () => {
  const R = 100;
  const balls = pile(20, R, seededRand(11));
  applyBlow(balls, R, 1 / 60, seededRand(5));
  const avgVy = balls.reduce((s, b) => s + b.vy, 0) / balls.length;
  assert.ok(avgVy < 0, `avg vy ${avgVy}`);
});

test('tones returns lighter and darker shades of a colour', () => {
  assert.deepEqual(tones('#808080'), { c: '#808080', light: 'rgb(185,185,185)', dark: 'rgb(83,83,83)' });
});

test('with only a few large balls the exiting ball still drops out promptly', () => {
  const R = 150;
  for (const seed of [1, 2, 3, 4, 5]) {
    const balls = pile(4, R, seededRand(seed));
    for (let i = 0; i < 300; i++) stepPhysics(balls, R, 1 / 60);
    const hole = balls[0].r * 1.35;
    const target = balls[seed % 4];
    target.exiting = true;
    let steps = 0;
    while (target.y - target.r <= R && steps < 600) {
      stepPhysics(balls, R, 1 / 60, { hole });
      steps++;
    }
    // Under 1.5 s of simulated time.
    assert.ok(steps < 90, `seed ${seed}: took ${steps} steps`);
  }
});
