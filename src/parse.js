(function (root) {
  'use strict';

  const CN_DIGITS = { 零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const NUM = '[0-9一二三四五六七八九十兩]+';
  // Tried in order; the first pattern yielding a valid number wins.
  const GROUP_PATTERNS = [
    new RegExp('第\\s*(' + NUM + ')\\s*[組组]'),
    new RegExp('(' + NUM + ')\\s*[組组]'),
    /^(\d{1,2})[\s.、,，:：\-]+/,
    /[\s,，:：\-]+(\d{1,2})$/,
  ];
  const DATE_RE = /\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}/g;
  const TIME_RE = /(?:上午|下午)?\s*\d{1,2}:\d{2}(?::\d{2})?/g;
  const EDGE_RE = /^[\s:：,，、.。\-—_|｜()（）\[\]【】]+|[\s:：,，、.。\-—_|｜()（）\[\]【】]+$/g;

  function toHalfWidthDigits(s) {
    return s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  }

  function cnToInt(s) {
    if (/^\d+$/.test(s)) return Number(s);
    const i = s.indexOf('十');
    if (i === -1) return s.length === 1 && s in CN_DIGITS ? CN_DIGITS[s] : NaN;
    const tens = i === 0 ? 1 : CN_DIGITS[s.slice(0, i)];
    const ones = i === s.length - 1 ? 0 : CN_DIGITS[s.slice(i + 1)];
    if (tens === undefined || ones === undefined) return NaN;
    return tens * 10 + ones;
  }

  function parseLine(rawLine) {
    let line = toHalfWidthDigits(rawLine).replace(DATE_RE, ' ').replace(TIME_RE, ' ').trim();
    let group = null;
    for (const re of GROUP_PATTERNS) {
      const m = line.match(re);
      if (!m) continue;
      const n = cnToInt(m[1]);
      if (!Number.isInteger(n) || n < 1) continue;
      group = n;
      line = line.slice(0, m.index) + ' ' + line.slice(m.index + m[0].length);
      break;
    }
    const name = line.replace(EDGE_RE, '').replace(/\s+/g, ' ');
    return { name, group };
  }

  // ---- Pasted from Excel: cells separated by tabs ----
  const HEADER_NAME = /^(姓名|名字|名稱|學生|name)$/i;
  const HEADER_GROUP = /^(組別|組|group)$/i;
  const HEADER_OTHER = /^(學號|座號|編號|號碼|號|序號|no\.?|id)$/i;
  const GROUP_CELL_RE = new RegExp('^(?:第\\s*(' + NUM + ')\\s*[組组]|(' + NUM + ')\\s*[組组]|(\\d{1,2}))$');
  const DIGITS_RE = /^[A-Za-z]{0,2}[\d\s\-._]+$/;

  function looksTabular(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    return lines.length > 0 && lines.filter(l => l.includes('\t')).length * 2 >= lines.length;
  }

  // Group number from a cell such as 3, 第3組 or 三組; null when the cell is anything else.
  function cellGroup(cell) {
    const m = toHalfWidthDigits(cell).trim().match(GROUP_CELL_RE);
    if (!m) return null;
    const n = cnToInt(m[1] || m[2] || m[3]);
    return Number.isInteger(n) && n >= 1 ? n : null;
  }

  function isHeaderRow(cells) {
    const filled = cells.filter(c => c);
    return filled.length > 0
      && filled.some(c => HEADER_NAME.test(c) || HEADER_GROUP.test(c))
      && filled.every(c => HEADER_NAME.test(c) || HEADER_GROUP.test(c) || HEADER_OTHER.test(c));
  }

  // Decides which column holds names and which holds groups (-1 when there is none).
  function detectColumns(rows, header) {
    const width = Math.max(...rows.map(r => r.length));
    let name = header ? header.findIndex(c => HEADER_NAME.test(c)) : -1;
    let group = header ? header.findIndex(c => HEADER_GROUP.test(c)) : -1;
    const kinds = [];
    for (let c = 0; c < width; c++) {
      const cells = rows.map(r => r[c] || '').filter(x => x);
      const isGroup = cells.length > 0 && cells.every(x => cellGroup(x) !== null);
      const isDigits = cells.length > 0 && cells.every(x => DIGITS_RE.test(x));
      kinds.push({ cells, kind: isGroup ? 'group' : isDigits ? 'digits' : 'text' });
    }
    if (name === -1) {
      let best = -1;
      kinds.forEach((k, c) => {
        if (k.kind === 'text' && c !== group && (best === -1 || k.cells.length > kinds[best].cells.length)) best = c;
      });
      name = best;
    }
    if (group === -1) {
      const candidates = kinds.map((k, c) => c).filter(c => kinds[c].kind === 'group' && c !== name);
      // A group number repeats across a group's members; seat and id numbers do not.
      group = candidates.reduce((best, c) => {
        const distinct = new Set(kinds[c].cells.map(cellGroup)).size;
        return best === -1 || distinct <= new Set(kinds[best].cells.map(cellGroup)).size ? c : best;
      }, -1);
    }
    const ignored = [];
    for (let c = 0; c < width; c++) if (c !== name && c !== group && kinds[c].cells.length) ignored.push(c);
    return { name, group, ignored, header: header !== null };
  }

  function describeColumns(cols) {
    const parts = ['姓名＝第' + (cols.name + 1) + '欄'];
    parts.push(cols.group === -1 ? '沒有找到組別欄' : '組別＝第' + (cols.group + 1) + '欄');
    if (cols.ignored.length) parts.push('已忽略第' + cols.ignored.map(c => c + 1).join('、') + '欄');
    return '偵測到 Excel 表格：' + parts.join('、');
  }

  function parseTable(text) {
    let rows = text.split(/\r?\n/).filter(l => l.trim()).map(l => l.split('\t').map(c => c.trim()));
    const header = isHeaderRow(rows[0]) ? rows[0] : null;
    if (header) rows = rows.slice(1);
    const columns = rows.length ? detectColumns(rows, header) : { name: -1, group: -1, ignored: [], header: header !== null };
    const students = [];
    const duplicates = [];
    const invalidLines = [];
    const seen = new Set();
    for (const cells of rows) {
      const name = columns.name === -1 ? '' : (cells[columns.name] || '').replace(/\s+/g, ' ');
      if (!name) { invalidLines.push(cells.join(' ').trim()); continue; }
      if (seen.has(name)) { duplicates.push(name); continue; }
      seen.add(name);
      students.push({ name, group: columns.group === -1 ? null : cellGroup(cells[columns.group] || '') });
    }
    const note = columns.name === -1 ? '' : describeColumns(columns);
    return { students, duplicates, invalidLines, columns, note };
  }

  function parseRoster(text) {
    if (looksTabular(String(text))) return parseTable(String(text));
    const students = [];
    const duplicates = [];
    const invalidLines = [];
    const seen = new Set();
    for (const raw of String(text).split(/\r?\n/)) {
      if (!raw.trim()) continue;
      const { name, group } = parseLine(raw);
      if (!name) { invalidLines.push(raw.trim()); continue; }
      if (seen.has(name)) { duplicates.push(name); continue; }
      seen.add(name);
      students.push({ name, group });
    }
    return { students, duplicates, invalidLines };
  }

  function groupLabel(n) {
    return n === null ? '未分組' : '第' + n + '組';
  }

  function groupStudents(students) {
    const byGroup = new Map();
    for (const s of students) {
      if (s.group === null) continue;
      if (!byGroup.has(s.group)) byGroup.set(s.group, []);
      byGroup.get(s.group).push(s.name);
    }
    return [...byGroup.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([number, members]) => ({ number, members }));
  }

  // Positive integer from a table cell, or null.
  function positiveInt(value) {
    const s = toHalfWidthDigits(String(value)).trim();
    return /^\d+$/.test(s) && Number(s) >= 1 ? Number(s) : null;
  }

  function rowsToStudents(rows) {
    const students = [];
    const duplicates = [];
    const seen = new Set();
    for (const row of rows) {
      const name = String(row.name).trim();
      if (!name) continue;
      if (seen.has(name)) { duplicates.push(name); continue; }
      seen.add(name);
      students.push({ name, group: positiveInt(row.group) });
    }
    return { students, duplicates };
  }

  function rowsToTasks(rows) {
    return rows
      .map(row => ({ name: String(row.name).trim(), count: positiveInt(row.count) ?? 1 }))
      .filter(t => t.name);
  }

  const api = {
    cnToInt, parseLine, parseRoster, positiveInt, rowsToStudents, rowsToTasks,
    groupLabel, groupStudents, toHalfWidthDigits,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DrawLots = Object.assign(root.DrawLots || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
