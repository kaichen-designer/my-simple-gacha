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

  function parseRoster(text) {
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
