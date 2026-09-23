(function () {
  'use strict';

  const D = window.DrawLots;
  const $ = id => document.getElementById(id);
  const state = { mode: 'group', pool: [], tasks: [], session: null, busy: false };

  function el(tag, text, className) {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (className) e.className = className;
    return e;
  }

  function currentMode() {
    return document.querySelector('input[name="mode"]:checked').value;
  }

  function renderPreview(roster) {
    const groups = D.groupStudents(roster.students);
    const ungrouped = roster.students.filter(s => s.group === null);
    const rows = groups.map(g =>
      el('li', `${D.groupLabel(g.number)}（${g.members.length}人）：${g.members.join('、')}`));
    if (ungrouped.length) {
      rows.push(el('li', `未分組：${ungrouped.map(s => s.name).join('、')}`, 'ungrouped'));
    }
    const list = el('ul');
    list.replaceChildren(...rows);
    $('preview').replaceChildren(el('p', `共 ${roster.students.length} 人、${groups.length} 組`), list);
  }

  function refreshSetup() {
    const mode = currentMode();
    const roster = D.parseRoster($('roster').value);
    const tasks = D.parseTasks($('tasks').value);
    const pool = D.buildPool(mode, roster.students);
    renderPreview(roster);

    const { errors, warnings } = D.validateSetup(mode, pool, tasks);
    const messages = [
      ...errors.map(text => ({ text, cls: 'error' })),
      ...warnings.map(text => ({ text, cls: 'warning' })),
    ];
    const ungroupedCount = roster.students.filter(s => s.group === null).length;
    if (mode === 'group' && ungroupedCount > 0) {
      messages.push({ text: `有 ${ungroupedCount} 人沒有辨識到組別，抽組時不會列入（見預覽黃色部分）`, cls: 'warning' });
    }
    if (roster.duplicates.length) {
      messages.push({ text: '重複的名字只算一次：' + roster.duplicates.join('、'), cls: 'warning' });
    }
    if (roster.invalidLines.length) {
      messages.push({ text: '這幾行找不到姓名，已略過：' + roster.invalidLines.join('、'), cls: 'warning' });
    }
    $('messages').replaceChildren(...messages.map(m => el('li', m.text, m.cls)));
    $('start').disabled = errors.length > 0;
    Object.assign(state, { mode, pool, tasks });
  }

  $('roster').addEventListener('input', refreshSetup);
  $('tasks').addEventListener('input', refreshSetup);
  document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener('change', refreshSetup));
  refreshSetup();
})();
