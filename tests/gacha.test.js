const test = require('node:test');
const assert = require('node:assert/strict');
const { ballRadius, stepPhysics, ballColor, PALETTE, UNGROUPED_COLOR } = require('../src/gacha.js');

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
