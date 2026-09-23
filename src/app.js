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

  function showScreen(name) {
    for (const id of ['setup-screen', 'draw-screen', 'summary-screen']) {
      $(id).hidden = id !== name + '-screen';
    }
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
    $('results').replaceChildren(...s.results.map(r => el('li', `${r.task.name}：${winnersText(r.winners)}`)));
    $('remaining-count').textContent = String(s.remaining.length);
    $('remaining').replaceChildren(...s.remaining.map(p => el('li', p.label)));
  }

  function renderDraw() {
    const s = state.session;
    const task = D.currentTask(s);
    const drawn = D.hasDrawnCurrent(s);
    const result = drawn ? s.results[s.index] : null;
    $('progress').textContent = `任務 ${s.index + 1} / ${s.tasks.length}`;
    $('task-title').textContent = task.name;
    $('task-count').textContent = `抽 ${task.count} ${unit()}`;
    $('stage').textContent = result ? winnersText(result.winners) : '?';
    $('stage-detail').textContent = result ? winnersDetail(result.winners) : '';
    const short = result !== null && result.shortfall > 0;
    $('shortfall').hidden = !short;
    if (short) $('shortfall').textContent = `剩下的不夠，少了 ${result.shortfall} ${unit()}`;
    $('draw').hidden = drawn;
    $('next').hidden = !drawn;
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
    renderDraw();
  }

  async function onDraw() {
    if (state.busy) return;
    state.busy = true;
    $('draw').disabled = true;
    const candidates = state.session.remaining.map(p => p.label);
    state.session = D.drawCurrent(state.session);
    const result = state.session.results[state.session.index];
    $('stage-detail').textContent = '';
    $('shortfall').hidden = true;
    await D.play($('stage'), candidates, winnersText(result.winners));
    state.busy = false;
    $('draw').disabled = false;
    renderDraw();
  }

  function onNext() {
    state.session = D.nextTask(state.session);
    if (D.isFinished(state.session)) {
      renderSummary();
      showScreen('summary');
    } else {
      renderDraw();
    }
  }

  $('roster').addEventListener('input', refreshSetup);
  $('tasks').addEventListener('input', refreshSetup);
  document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener('change', refreshSetup));
  $('start').addEventListener('click', startSession);
  $('draw').addEventListener('click', onDraw);
  $('next').addEventListener('click', onNext);
  $('redraw').addEventListener('click', startSession);
  $('back').addEventListener('click', () => showScreen('setup'));
  refreshSetup();
})();
