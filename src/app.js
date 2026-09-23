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

  // Column config per editable table: first input is the text column, second the number column.
  const TABLES = {
    'roster-body': { name: '姓名', num: '組別', numKey: 'group', numPlaceholder: '未分組' },
    'tasks-body': { name: '任務', num: '數量', numKey: 'count', numPlaceholder: '1' },
  };

  function input(className, label, value, placeholder) {
    const e = el('input', undefined, className);
    e.type = 'text';
    e.value = value;
    e.setAttribute('aria-label', label);
    if (placeholder) e.placeholder = placeholder;
    return e;
  }

  function addRow(bodyId, name = '', num = '') {
    const cfg = TABLES[bodyId];
    const tr = el('tr');
    const nameCell = el('td');
    nameCell.append(input('c-name', cfg.name, name));
    const numCell = el('td', undefined, 'num');
    const numInput = input('c-num', cfg.num, num, cfg.numPlaceholder);
    numInput.inputMode = 'numeric';
    numCell.append(numInput);
    const delCell = el('td', undefined, 'del');
    const del = el('button', '✕', 'row-del');
    del.type = 'button';
    del.setAttribute('aria-label', '刪除這一列');
    delCell.append(del);
    tr.append(nameCell, numCell, delCell);
    $(bodyId).append(tr);
    return tr;
  }

  function readRows(bodyId) {
    const key = TABLES[bodyId].numKey;
    return [...$(bodyId).rows].map(tr => ({
      name: tr.querySelector('.c-name').value,
      [key]: tr.querySelector('.c-num').value,
    }));
  }

  function onTableClick(e) {
    const del = e.target.closest('.row-del');
    if (!del) return;
    const body = e.currentTarget;
    del.closest('tr').remove();
    if (body.rows.length === 0) addRow(body.id);
    refreshSetup();
  }

  // Enter moves to the next row's name cell, adding a row at the end.
  function onTableKeydown(e) {
    if (e.key !== 'Enter' || !e.target.matches('input')) return;
    e.preventDefault();
    const tr = e.target.closest('tr');
    const next = tr.nextElementSibling || addRow(e.currentTarget.id);
    next.querySelector('.c-name').focus();
  }

  function onPasteApply() {
    const parsed = D.parseRoster($('paste-text').value);
    const body = $('roster-body');
    for (const tr of [...body.rows]) {
      if (!tr.querySelector('.c-name').value.trim() && !tr.querySelector('.c-num').value.trim()) tr.remove();
    }
    for (const s of parsed.students) addRow('roster-body', s.name, s.group === null ? '' : String(s.group));
    if (body.rows.length === 0) addRow('roster-body');
    const notes = [`已填入 ${parsed.students.length} 位，可以直接在表格裡修改`];
    if (parsed.duplicates.length) notes.push('重複的名字只填一次：' + parsed.duplicates.join('、'));
    if (parsed.invalidLines.length) notes.push('這幾行找不到姓名，已略過：' + parsed.invalidLines.join('、'));
    $('paste-result').textContent = notes.join('；');
    $('paste-text').value = '';
    refreshSetup();
  }

  function togglePaste() {
    const open = $('paste-panel').hidden;
    $('paste-panel').hidden = !open;
    $('paste-toggle').setAttribute('aria-expanded', String(open));
    if (open) $('paste-text').focus();
  }

  function markUngroupedRows() {
    for (const tr of $('roster-body').rows) {
      const named = tr.querySelector('.c-name').value.trim() !== '';
      tr.classList.toggle('ungrouped-row', named && D.positiveInt(tr.querySelector('.c-num').value) === null);
    }
  }

  function refreshSetup() {
    const mode = currentMode();
    const roster = D.rowsToStudents(readRows('roster-body'));
    const tasks = D.rowsToTasks(readRows('tasks-body'));
    const pool = D.buildPool(mode, roster.students);
    renderPreview(roster);
    markUngroupedRows();

    const { errors, warnings } = D.validateSetup(mode, pool, tasks);
    const messages = [
      ...errors.map(text => ({ text, cls: 'error' })),
      ...warnings.map(text => ({ text, cls: 'warning' })),
    ];
    const ungroupedCount = roster.students.filter(s => s.group === null).length;
    if (mode === 'group' && ungroupedCount > 0) {
      messages.push({ text: `有 ${ungroupedCount} 人沒有填組別，抽組時不會列入（組別欄黃色的列）`, cls: 'warning' });
    }
    if (roster.duplicates.length) {
      messages.push({ text: '重複的名字只算一次：' + roster.duplicates.join('、'), cls: 'warning' });
    }
    $('messages').replaceChildren(...messages.map(m => el('li', m.text, m.cls)));
    $('start').disabled = errors.length > 0;
    Object.assign(state, { mode, pool, tasks });
  }

  function showScreen(name) {
    for (const id of ['setup-screen', 'draw-screen', 'summary-screen']) {
      $(id).hidden = id !== name + '-screen';
    }
    document.body.dataset.screen = name;
  }

  function unit() {
    return state.mode === 'group' ? '組' : '人';
  }

  function winnersText(winners) {
    return winners.length ? winners.map(w => w.label).join('、') : '—';
  }

  function winnersDetail(winners) {
    return winners.map(w => `${w.label}：${w.detail}`).join('\n');
  }

  function renderSide() {
    const s = state.session;
    const drawn = s.results.filter(r => r.winners.length);
    $('results').replaceChildren(...drawn.map(r => el('li', `${r.task.name}：${winnersText(r.winners)}`)));
    $('remaining-count').textContent = String(s.remaining.length);
    $('remaining').replaceChildren(...s.remaining.map(p => el('li', p.label)));
  }

  function openedChip(item) {
    const li = el('li');
    const dot = el('span', undefined, 'dot');
    dot.style.background = D.ballColor(item.group);
    li.append(dot, item.label);
    return li;
  }

  function renderDraw() {
    const s = state.session;
    const task = D.currentTask(s);
    const result = D.currentResult(s);
    const complete = D.isCurrentComplete(s);
    const left = D.needed(s);
    $('progress').textContent = `任務 ${s.index + 1} / ${s.tasks.length}`;
    $('task-title').textContent = task.name;
    $('task-count').textContent = `抽 ${task.count} ${unit()}`;
    $('opened').replaceChildren(...result.winners.map(openedChip));
    const short = complete && left > 0;
    $('shortfall').hidden = !short;
    if (short) $('shortfall').textContent = `剩下的不夠，少了 ${left} ${unit()}`;
    $('draw').hidden = complete;
    $('draw').textContent = left < task.count ? `再抽！（還要 ${left} ${unit()}）` : '抽！';
    $('next').hidden = !complete;
    $('next').textContent = s.index === s.tasks.length - 1 ? '看結果' : '下一個任務';
    renderSide();
  }

  function renderSummary() {
    const s = state.session;
    const rows = s.results.map(r => {
      const tr = el('tr');
      tr.append(el('td', r.task.name), el('td', winnersText(r.winners)), el('td', winnersDetail(r.winners)));
      return tr;
    });
    if (s.remaining.length) {
      const tr = el('tr');
      tr.append(el('td', '未抽到'), el('td', s.remaining.map(p => p.label).join('、')), el('td', ''));
      rows.push(tr);
    }
    $('summary-body').replaceChildren(...rows);
  }

  function startSession() {
    state.session = D.createSession(state.tasks, state.pool);
    showScreen('draw');
    state.machine.setBalls(state.pool);
    renderDraw();
  }

  async function onDraw() {
    if (state.busy) return;
    state.busy = true;
    $('draw').disabled = true;
    $('next').disabled = true;
    state.session = D.drawOne(state.session);
    const winners = D.currentResult(state.session).winners;
    await state.machine.dispense(winners[winners.length - 1]);
    state.busy = false;
    $('draw').disabled = false;
    $('next').disabled = false;
    renderDraw();
  }

  function onNext() {
    if (state.busy) return;
    state.session = D.nextTask(state.session);
    if (D.isFinished(state.session)) {
      renderSummary();
      showScreen('summary');
    } else {
      state.machine.showHint();
      renderDraw();
    }
  }

  for (const bodyId of Object.keys(TABLES)) {
    const body = $(bodyId);
    body.addEventListener('input', refreshSetup);
    body.addEventListener('click', onTableClick);
    body.addEventListener('keydown', onTableKeydown);
    addRow(bodyId);
  }
  $('roster-add').addEventListener('click', () => { addRow('roster-body').querySelector('.c-name').focus(); });
  $('tasks-add').addEventListener('click', () => { addRow('tasks-body').querySelector('.c-name').focus(); });
  $('paste-toggle').addEventListener('click', togglePaste);
  $('paste-apply').addEventListener('click', onPasteApply);
  document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener('change', refreshSetup));
  $('start').addEventListener('click', startSession);
  $('draw').addEventListener('click', onDraw);
  $('next').addEventListener('click', onNext);
  $('redraw').addEventListener('click', startSession);
  $('back').addEventListener('click', () => showScreen('setup'));
  state.machine = D.createMachine($('gacha'));
  state.machine.setActor(D.createTeacher($('gacha')));
  refreshSetup();
})();
