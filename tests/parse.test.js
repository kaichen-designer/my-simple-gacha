const test = require('node:test');
const assert = require('node:assert/strict');
const { cnToInt, parseLine, parseRoster, rowsToStudents, rowsToTasks, groupLabel, groupStudents } = require('../src/parse.js');

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
test('rowsToStudents trims, skips blanks, parses groups and reports duplicates', () => {
  const rows = [
    { name: ' 王小明 ', group: '1' },
    { name: '', group: '2' },
    { name: '李大華', group: '' },
    { name: '陳美美', group: '０３' },
    { name: '林小華', group: '0' },
    { name: '張三', group: 'abc' },
    { name: '王小明', group: '2' },
  ];
  assert.deepEqual(rowsToStudents(rows), {
    students: [
      { name: '王小明', group: 1 },
      { name: '李大華', group: null },
      { name: '陳美美', group: 3 },
      { name: '林小華', group: null },
      { name: '張三', group: null },
    ],
    duplicates: ['王小明'],
  });
});

test('rowsToTasks skips blank names and defaults invalid counts to 1', () => {
  const rows = [
    { name: '擦黑板', count: '' },
    { name: ' 打掃 ', count: '2' },
    { name: '', count: '3' },
    { name: '倒垃圾', count: '0' },
    { name: '搬椅子', count: '1.5' },
  ];
  assert.deepEqual(rowsToTasks(rows), [
    { name: '擦黑板', count: 1 },
    { name: '打掃', count: 2 },
    { name: '倒垃圾', count: 1 },
    { name: '搬椅子', count: 1 },
  ]);
});

// Excel copies cells separated by tabs.
const xl = (...rows) => rows.map(r => r.join('\t')).join('\r\n');

test('table paste: name and group columns, either order', () => {
  const expected = [{ name: '王小明', group: 1 }, { name: '李大華', group: 2 }];
  assert.deepEqual(parseRoster(xl(['王小明', '1'], ['李大華', '2'])).students, expected);
  assert.deepEqual(parseRoster(xl(['1', '王小明'], ['2', '李大華'])).students, expected);
});

test('table paste: a header row is skipped and used for the columns', () => {
  const r = parseRoster(xl(['姓名', '組別'], ['王小明', '1'], ['李大華', '2']));
  assert.deepEqual(r.students, [{ name: '王小明', group: 1 }, { name: '李大華', group: 2 }]);
  assert.deepEqual(r.invalidLines, []);
  assert.deepEqual(r.columns, { name: 0, group: 1, ignored: [], header: true });
});

test('table paste: header decides which numeric column is the group', () => {
  // 座號 values repeat nothing here, but the header says 組別 is the last column.
  const r = parseRoster(xl(['座號', '姓名', '組別'], ['1', '王小明', '2'], ['2', '李大華', '1'], ['3', '陳美美', '2']));
  assert.deepEqual(r.students, [
    { name: '王小明', group: 2 }, { name: '李大華', group: 1 }, { name: '陳美美', group: 2 },
  ]);
  assert.deepEqual(r.columns, { name: 1, group: 2, ignored: [0], header: true });
});

test('table paste: without a header the repeating numeric column is the group', () => {
  const r = parseRoster(xl(['01', '王小明', '1'], ['02', '李大華', '1'], ['03', '陳美美', '2'], ['04', '林小華', '2']));
  assert.deepEqual(r.students, [
    { name: '王小明', group: 1 }, { name: '李大華', group: 1 },
    { name: '陳美美', group: 2 }, { name: '林小華', group: 2 },
  ]);
  assert.deepEqual(r.columns, { name: 1, group: 2, ignored: [0], header: false });
});

test('table paste: long student ids are ignored, not taken as the name', () => {
  const r = parseRoster(xl(['1120345', '王小明', '1'], ['1120346', '李大華', '1']));
  assert.deepEqual(r.students, [{ name: '王小明', group: 1 }, { name: '李大華', group: 1 }]);
  assert.deepEqual(r.columns.ignored, [0]);
});

test('table paste: cells like 第3組 and 3組 count as groups', () => {
  const r = parseRoster(xl(['王小明', '第3組'], ['李大華', '３組'], ['陳美美', '第二組']));
  assert.deepEqual(r.students.map(s => s.group), [3, 3, 2]);
});

test('table paste: missing group cells leave the student ungrouped, blanks and duplicates are reported', () => {
  const r = parseRoster(xl(['王小明', '1'], ['李大華', ''], ['', '2'], ['王小明', '3']));
  assert.deepEqual(r.students, [{ name: '王小明', group: 1 }, { name: '李大華', group: null }]);
  assert.deepEqual(r.duplicates, ['王小明']);
  assert.equal(r.invalidLines.length, 1);
});

test('table paste: names only in one column of a tabbed paste', () => {
  const r = parseRoster(xl(['王小明', ''], ['李大華', '']));
  assert.deepEqual(r.students, [{ name: '王小明', group: null }, { name: '李大華', group: null }]);
});

test('table paste reports what it detected', () => {
  const r = parseRoster(xl(['01', '王小明', '1'], ['02', '李大華', '2']));
  assert.match(r.note, /姓名＝第2欄/);
  assert.match(r.note, /組別＝第3欄/);
  assert.match(r.note, /忽略第1欄/);
});

test('LINE-style text without tabs still uses the line parser and adds no table fields', () => {
  const r = parseRoster('第1組 王小明\n李大華 1組');
  assert.equal('columns' in r, false);
  assert.equal('note' in r, false);
});
