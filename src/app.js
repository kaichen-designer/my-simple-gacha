(function () {
  'use strict';

  const D = window.DrawLots;
  const $ = id => document.getElementById(id);
  const state = { mode: 'group', pool: [], tasks: [], session: null, sessionMode: null, busy: false };

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
    const rows = groups.map(g => {
      const li = el('li');
      li.append(groupDot(g.number), `${D.groupLabel(g.number)}（${g.members.length}人）：${g.members.join('、')}`);
      return li;
    });
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
    if (bodyId === 'roster-body') numCell.append(el('span', undefined, 'c-dot'));
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

  // Replaces a table's rows, keeping one blank row when there is nothing to show.
  function setRows(bodyId, rows) {
    const cfg = TABLES[bodyId];
    $(bodyId).replaceChildren();
    for (const row of rows) addRow(bodyId, row.name, row[cfg.numKey] ?? '');
    if ($(bodyId).rows.length === 0) addRow(bodyId);
  }

  function hasContent(rows) {
    return rows.some(r => Object.values(r).some(v => v.trim() !== ''));
  }

  // Each saved-list kind maps to the table it fills and the noun used in messages.
  const SAVES = {
    roster: { bodyId: 'roster-body', noun: '名單' },
    tasks: { bodyId: 'tasks-body', noun: '任務' },
  };

  function refreshSaves(kind, selected = '') {
    const names = state.store.listSaves(kind);
    const select = $(kind + '-select');
    const placeholder = el('option', names.length ? `— 載入已存的${SAVES[kind].noun} —` : `（還沒有存過${SAVES[kind].noun}）`);
    placeholder.value = '';
    select.replaceChildren(placeholder, ...names.map(name => {
      const o = el('option', name);
      o.value = name;
      return o;
    }));
    select.value = names.includes(selected) ? selected : '';
    select.disabled = names.length === 0;
    $(kind + '-delete').disabled = select.value === '';
  }

  function saveNote(kind, text) {
    $(kind + '-note').textContent = text;
  }

  async function onSaveAs(kind) {
    const { bodyId, noun } = SAVES[kind];
    const rows = readRows(bodyId);
    if (!hasContent(rows)) return saveNote(kind, `${noun}是空的，先填一些再存`);
    const name = await promptPixel(`把目前的${noun}存成：`, $(kind + '-select').value);
    if (name === null) return;
    if (!name) return saveNote(kind, '請輸入名稱');
    if (state.store.hasSave(kind, name) && !(await confirmPixel(`「${name}」已經存在，要覆蓋嗎？`))) return;
    if (state.store.putSave(kind, name, rows)) {
      refreshSaves(kind, name);
      saveNote(kind, `已存成「${name}」`);
    } else {
      saveNote(kind, '這個瀏覽器無法儲存（可能是無痕模式或已停用）');
    }
  }

  async function onLoadSave(kind) {
    const select = $(kind + '-select');
    const name = select.value;
    $(kind + '-delete').disabled = name === '';
    if (name === '') return;
    const { bodyId, noun } = SAVES[kind];
    const rows = state.store.getSave(kind, name);
    if (!rows) return refreshSaves(kind);
    if (hasContent(readRows(bodyId)) && !(await confirmPixel(`要用「${name}」取代目前的${noun}嗎？`))) {
      select.value = '';
      $(kind + '-delete').disabled = true;
      return;
    }
    setRows(bodyId, rows);
    saveNote(kind, `已載入「${name}」`);
    refreshSetup();
  }

  async function onDeleteSave(kind) {
    const name = $(kind + '-select').value;
    if (!name || !(await confirmPixel(`要刪除已存的「${name}」嗎？`))) return;
    state.store.removeSave(kind, name);
    refreshSaves(kind);
    saveNote(kind, `已刪除「${name}」`);
  }

  // What is on screen is remembered automatically and restored on the next visit.
  function saveDraft() {
    const draft = { roster: readRows('roster-body'), tasks: readRows('tasks-body') };
    if (hasContent(draft.roster) || hasContent(draft.tasks)) state.store.saveDraft(draft);
    else state.store.clearDraft();
  }

  function restoreDraft() {
    const draft = state.store.loadDraft();
    if (!draft) return;
    setRows('roster-body', draft.roster);
    setRows('tasks-body', draft.tasks);
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
    if (parsed.note) notes.push(parsed.note);
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

  // Yellow group cell when a named student has no group; otherwise a capsule in the group's colour.
  function paintRosterRows() {
    for (const tr of $('roster-body').rows) {
      const named = tr.querySelector('.c-name').value.trim() !== '';
      const group = D.positiveInt(tr.querySelector('.c-num').value);
      tr.classList.toggle('ungrouped-row', named && group === null);
      const capsule = tr.querySelector('.c-dot');
      if (group === null) capsule.style.removeProperty('background');
      else capsule.style.background = D.ballColor(group);
    }
  }

  function groupDot(group) {
    const d = el('span', undefined, 'c-dot');
    d.style.background = D.ballColor(group);
    return d;
  }

  function refreshSetup() {
    const mode = currentMode();
    const roster = D.rowsToStudents(readRows('roster-body'));
    const tasks = D.rowsToTasks(readRows('tasks-body'));
    const pool = D.buildPool(mode, roster.students);
    renderPreview(roster);
    paintRosterRows();

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
    renderStartActions(errors.length > 0);
    Object.assign(state, { mode, pool, tasks });
    saveDraft();
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

  // With a draw under way the setup screen offers continue / restart instead of start.
  function renderStartActions(hasErrors) {
    const ongoing = state.session !== null;
    const sameMode = ongoing && state.sessionMode === currentMode();
    $('start').hidden = ongoing;
    $('resume').hidden = !ongoing;
    $('restart').hidden = !ongoing;
    $('resume').disabled = hasErrors || !sameMode;
    $('restart').disabled = hasErrors;
    $('resume-note').hidden = !ongoing;
    if (!ongoing) return;
    const done = state.session.results.filter(r => r.winners.length).length;
    $('resume-note').textContent = sameMode
      ? `進行中的抽籤：已指派 ${done} 項任務。修改後按「繼續抽籤」會保留已抽出的結果。`
      : '已切換抽組／抽個人，只能「重新開始」。';
  }

  function showSession() {
    if (D.isFinished(state.session)) {
      renderSummary();
      showScreen('summary');
      return;
    }
    showScreen('draw');
    state.machine.setBalls(state.session.remaining);
    renderDraw();
  }

  function startSession() {
    state.session = D.createSession(state.tasks, state.pool);
    state.sessionMode = state.mode;
    showSession();
  }

  function resumeSession() {
    state.session = D.reconcileSession(state.session, state.tasks, state.pool);
    showSession();
  }

  // A pixel-styled yes/no dialog. Resolves true on 確定.
  function confirmPixel(message) {
    const dialog = $('confirm');
    $('confirm-text').textContent = message;
    return new Promise(resolve => {
      const finish = answer => {
        $('confirm-yes').onclick = $('confirm-no').onclick = dialog.oncancel = null;
        if (dialog.open) dialog.close();
        resolve(answer);
      };
      $('confirm-yes').onclick = () => finish(true);
      $('confirm-no').onclick = () => finish(false);
      dialog.oncancel = e => { e.preventDefault(); finish(false); };
      dialog.showModal();
      $('confirm-no').focus();
    });
  }

  // A pixel-styled text prompt. Resolves the trimmed text on 存檔 (possibly empty), or null on cancel.
  function promptPixel(message, initial = '') {
    const dialog = $('name-dialog');
    const field = $('name-input');
    $('name-text').textContent = message;
    field.value = initial;
    return new Promise(resolve => {
      const finish = answer => {
        $('name-yes').onclick = $('name-no').onclick = field.onkeydown = dialog.oncancel = null;
        if (dialog.open) dialog.close();
        resolve(answer);
      };
      $('name-yes').onclick = () => finish(field.value.trim());
      $('name-no').onclick = () => finish(null);
      field.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); finish(field.value.trim()); } };
      dialog.oncancel = e => { e.preventDefault(); finish(null); };
      dialog.showModal();
      field.focus();
      field.select();
    });
  }

  async function restartSession() {
    if (await confirmPixel('重新開始會清除目前已抽出的結果，確定嗎？')) startSession();
  }

  async function clearAll() {
    if (!(await confirmPixel('要清除名單、任務和抽籤進度嗎？'))) return;
    for (const bodyId of Object.keys(TABLES)) {
      $(bodyId).replaceChildren();
      addRow(bodyId);
    }
    $('paste-text').value = '';
    $('paste-result').textContent = '';
    state.session = null;
    refreshSetup();
  }

  function goSetup() {
    if (state.busy) return;
    showScreen('setup');
    refreshSetup();
  }

  async function onDraw() {
    if (state.busy) return;
    state.busy = true;
    $('draw').disabled = true;
    $('next').disabled = true;
    state.session = D.drawOne(state.session);
    const winners = D.currentResult(state.session).winners;
    await state.machine.dispense(winners[winners.length - 1], { task: D.currentTask(state.session).name });
    state.busy = false;
    $('draw').disabled = false;
    $('next').disabled = false;
    renderDraw();
  }

  function renderMute() {
    const muted = state.sfx.muted;
    $('mute').textContent = muted ? '🔇 靜音' : '🔊 音效';
    $('mute').setAttribute('aria-pressed', String(muted));
  }

  // Moving on to the next task draws its first ball straight away, unless the pool is already empty.
  function onNext() {
    if (state.busy) return;
    state.session = D.nextTask(state.session);
    if (D.isFinished(state.session)) {
      renderSummary();
      showScreen('summary');
    } else {
      state.machine.showHint();
      renderDraw();
      if (!D.isCurrentComplete(state.session)) onDraw();
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
  for (const kind of Object.keys(SAVES)) {
    $(kind + '-select').addEventListener('change', () => onLoadSave(kind));
    $(kind + '-save').addEventListener('click', () => onSaveAs(kind));
    $(kind + '-delete').addEventListener('click', () => onDeleteSave(kind));
  }
  $('paste-toggle').addEventListener('click', togglePaste);
  $('paste-apply').addEventListener('click', onPasteApply);
  document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener('change', refreshSetup));
  $('start').addEventListener('click', startSession);
  $('draw').addEventListener('click', onDraw);
  $('next').addEventListener('click', onNext);
  $('redraw').addEventListener('click', startSession);
  $('back').addEventListener('click', goSetup);
  $('to-setup').addEventListener('click', goSetup);
  $('resume').addEventListener('click', resumeSession);
  $('restart').addEventListener('click', restartSession);
  $('clear-all').addEventListener('click', clearAll);
  // Esc on the draw or summary screen goes back to setup (once any animation has finished).
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || $('confirm').open) return;
    if (document.body.dataset.screen === 'draw' || document.body.dataset.screen === 'summary') goSetup();
  });
  $('mute').addEventListener('click', () => {
    state.sfx.setMuted(!state.sfx.muted);
    renderMute();
  });
  function setupTeacher() {
    const cv = $('setup-teacher');
    const scale = 4;
    cv.width = D.FRAME_W * scale;
    cv.height = D.FRAME_H * scale;
    const ctx = cv.getContext('2d');
    D.drawFrame(ctx, 'idle', scale);
    setInterval(() => {
      D.drawFrame(ctx, 'blink', scale);
      setTimeout(() => D.drawFrame(ctx, 'idle', scale), 140);
    }, 3200);
  }

  setupTeacher();
  try { state.store = D.createStore(window.localStorage); } catch { state.store = D.createStore(null); }
  restoreDraft();
  for (const kind of Object.keys(SAVES)) refreshSaves(kind);
  state.sfx = D.createSfx();
  state.machine = D.createMachine($('gacha'), { sfx: state.sfx });
  state.machine.setActor(D.createTeacher($('gacha'), { sfx: state.sfx }));
  renderMute();
  refreshSetup();
})();
