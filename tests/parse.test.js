const test = require('node:test');
const assert = require('node:assert/strict');
const { cnToInt, parseLine, parseRoster, groupLabel, groupStudents } = require('../src/parse.js');

test('cnToInt handles arabic and chinese numerals', () => {
  assert.equal(cnToInt('7'), 7);
  assert.equal(cnToInt('三'), 3);
  assert.equal(cnToInt('兩'), 2);
  assert.equal(cnToInt('十'), 10);
  assert.equal(cnToInt('十二'), 12);
  assert.equal(cnToInt('二十'), 20);
  assert.equal(cnToInt('二十三'), 23);
  assert.ok(Number.isNaN(cnToInt('一二')));
});

test('parseLine recognises common LINE group formats', () => {
  const cases = [
    ['第3組 王小明', { name: '王小明', group: 3 }],
    ['王小明 第三組', { name: '王小明', group: 3 }],
    ['李大華3組', { name: '李大華', group: 3 }],
    ['3組 李大華', { name: '李大華', group: 3 }],
    ['12 陳美美', { name: '陳美美', group: 12 }],
    ['5. 陳美美', { name: '陳美美', group: 5 }],
    ['陳美美 4', { name: '陳美美', group: 4 }],
    ['14:02 林小華 第2組', { name: '林小華', group: 2 }],
    ['2026/09/23 下午2:05 林小華：第2組', { name: '林小華', group: 2 }],
    ['第十二組 張三', { name: '張三', group: 12 }],
    ['第1组 简体', { name: '简体', group: 1 }],
    ['３組 全形', { name: '全形', group: 3 }],
    ['只有名字', { name: '只有名字', group: null }],
    ['  王  小明  ', { name: '王 小明', group: null }],
  ];
  for (const [input, expected] of cases) {
    assert.deepEqual(parseLine(input), expected, input);
  }
});

test('parseRoster skips blanks, reports duplicates and nameless lines', () => {
  const text = '第1組 王小明\n\n李大華 1組\r\n第4組\n王小明 第2組\n自由人';
  assert.deepEqual(parseRoster(text), {
    students: [
      { name: '王小明', group: 1 },
      { name: '李大華', group: 1 },
      { name: '自由人', group: null },
    ],
    duplicates: ['王小明'],
    invalidLines: ['第4組'],
  });
});

test('groupLabel', () => {
  assert.equal(groupLabel(3), '第3組');
  assert.equal(groupLabel(null), '未分組');
});

test('groupStudents sorts by number and drops ungrouped', () => {
  const students = [
    { name: 'A', group: 10 },
    { name: 'B', group: 2 },
    { name: 'C', group: null },
    { name: 'D', group: 2 },
  ];
  assert.deepEqual(groupStudents(students), [
    { number: 2, members: ['B', 'D'] },
    { number: 10, members: ['A'] },
  ]);
});
