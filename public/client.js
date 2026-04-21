(() => {
  const $ = (id) => document.getElementById(id);
  const views = {
    home: $('view-home'),
    lobby: $('view-lobby'),
    game: $('view-game'),
  };

  const state = {
    me: null,
    name: null,
    code: null,
    game: null,
    pathogenData: null,
    es: null, // EventSource
    handlers: {},
  };

  function on(event, handler) { state.handlers[event] = handler; }
  function connect() {
    if (state.es) { try { state.es.close(); } catch {} }
    const es = new EventSource('/events');
    state.es = es;
    const attach = (evt) => es.addEventListener(evt, (e) => {
      const data = e.data ? JSON.parse(e.data) : null;
      const h = state.handlers[evt];
      if (h) h(data);
    });
    ['hello', 'state', 'quiz', 'quizResult', 'chat'].forEach(attach);
    es.onerror = () => { /* browser auto-retries */ };
  }

  async function post(action, body) {
    const r = await fetch('/action/' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body || {}),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) return { error: data.error || ('HTTP ' + r.status) };
    return data;
  }

  function showView(name) {
    for (const k of Object.keys(views)) views[k].classList.remove('active');
    views[name].classList.add('active');
  }

  function toast(msg, ms = 2500) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._h);
    toast._h = setTimeout(() => { t.hidden = true; }, ms);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---- HOME ----
  const nameInput = $('name-input');
  const codeInput = $('code-input');
  const homeError = $('home-error');
  codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

  function hideErr(el) { el.hidden = true; el.textContent = ''; }
  function showErr(el, msg) { el.hidden = false; el.textContent = msg; }

  function savedName() { try { return localStorage.getItem('or-name') || ''; } catch { return ''; } }
  function saveName(n) { try { localStorage.setItem('or-name', n); } catch {} }
  nameInput.value = savedName();

  $('btn-create').addEventListener('click', async () => {
    hideErr(homeError);
    const name = nameInput.value.trim();
    if (!name) return showErr(homeError, 'Enter your name first.');
    saveName(name);
    const res = await post('lobby/create', { name });
    if (res.error) return showErr(homeError, res.error);
    state.name = name; state.code = res.code;
  });

  $('btn-join').addEventListener('click', async () => {
    hideErr(homeError);
    const name = nameInput.value.trim();
    const code = codeInput.value.trim().toUpperCase();
    if (!name) return showErr(homeError, 'Enter your name first.');
    if (!code) return showErr(homeError, 'Enter a room code.');
    saveName(name);
    const res = await post('lobby/join', { name, code });
    if (res.error) return showErr(homeError, res.error);
    state.name = name; state.code = res.code;
  });

  // Load pathogen reference
  fetch('/api/pathogen-info').then(r => r.json()).then(data => {
    state.pathogenData = data;
    renderPathogenRef();
  });

  // ---- LOBBY ----
  $('btn-start').addEventListener('click', async () => {
    const res = await post('lobby/start', {});
    if (res.error) toast(res.error);
  });
  $('btn-leave-lobby').addEventListener('click', async () => {
    await post('lobby/leave', {});
    state.code = null;
    state.game = null;
    showView('home');
  });

  // ---- SSE events ----
  on('hello', (data) => { state.me = data.playerId; });
  on('state', (g) => {
    state.game = g;
    if (!state.me) return;
    if (g.phase === 'lobby') {
      showView('lobby');
      renderLobby();
    } else if (g.phase === 'playing' || g.phase === 'won' || g.phase === 'lost') {
      showView('game');
      renderGame();
      if (g.phase === 'won' || g.phase === 'lost') showEndModal();
    }
  });
  on('quiz', (q) => { openQuiz(q); });
  on('quizResult', (r) => { showQuizResult(r); });
  on('chat', ({ name, text }) => {
    const list = $('chat-list');
    const li = document.createElement('li');
    li.innerHTML = `<strong>${escapeHtml(name)}:</strong> ${escapeHtml(text)}`;
    list.appendChild(li);
    list.scrollTop = list.scrollHeight;
  });

  connect();

  // ---- LOBBY RENDER ----
  function renderLobby() {
    const g = state.game;
    $('lobby-code').textContent = g.code;
    $('lobby-count').textContent = g.players.length;
    const ul = $('lobby-players');
    ul.innerHTML = '';
    for (const p of g.players) {
      const li = document.createElement('li');
      if (p.id === g.hostId) li.classList.add('host');
      li.innerHTML = `
        <div class="avatar">${escapeHtml(p.name.slice(0,1).toUpperCase())}</div>
        <div style="flex:1;">
          <div><strong>${escapeHtml(p.name)}</strong> ${p.id === g.hostId ? '<span class="chip" style="background:#38bdf8;color:#051018;">Host</span>' : ''} ${p.id === state.me ? '<span class="subtle">(you)</span>' : ''}</div>
          <div class="subtle">${p.connected ? 'ready' : 'disconnected'}</div>
        </div>
      `;
      ul.appendChild(li);
    }
    const amHost = g.hostId === state.me;
    $('lobby-host-actions').hidden = !amHost;
    $('lobby-wait').hidden = amHost;
    $('btn-start').disabled = g.players.length < 2;
    $('lobby-share').innerHTML = `Share this code: <strong>${g.code}</strong>. Teammates on the same Wi-Fi open the same URL and enter this code.`;
    renderRolesPreview();
  }

  function renderRolesPreview() {
    const ul = $('home-roles');
    if (!ul || !state.game) return;
    ul.innerHTML = '';
    for (const r of state.game.roles) {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${r.name}</strong> &mdash; ${r.blurb}`;
      ul.appendChild(li);
    }
  }

  // ---- GAME RENDER ----
  const CATS = ['virus', 'bacteria', 'fungus', 'parasite'];
  const CAT_COLOR = { virus: '#e11d48', bacteria: '#16a34a', fungus: '#a855f7', parasite: '#f59e0b' };

  function renderGame() {
    const g = state.game;
    $('top-round').textContent = `Round ${g.round}/${g.roundLimit}`;
    $('top-outbreaks').textContent = `Outbreaks: ${g.outbreakCount}/${g.maxOutbreaks}`;
    const cp = g.players.find(p => p.id === g.currentPlayerId);
    $('top-turn').textContent = cp ? `Turn: ${cp.name}${cp.id === state.me ? ' (you)' : ''}` : 'Turn:';
    $('top-ap').textContent = `AP: ${g.actionsLeft}`;

    const rb = $('research-bar');
    rb.innerHTML = '';
    for (const cat of CATS) {
      const v = g.research[cat] || 0;
      const cured = g.eradicated.includes(cat);
      const div = document.createElement('div');
      div.className = 'research-item' + (cured ? ' cured' : '');
      div.style.color = CAT_COLOR[cat];
      let dots = '';
      for (let i = 0; i < g.researchGoal; i++) {
        dots += `<div class="research-dot ${i < v ? 'filled' : ''}"></div>`;
      }
      div.innerHTML = `
        <div class="research-item-head">
          <span style="text-transform:capitalize;font-weight:700;">${cat}</span>
          <span class="subtle">${v}/${g.researchGoal}</span>
        </div>
        <div class="research-dots">${dots}</div>
      `;
      rb.appendChild(div);
    }

    const map = $('map');
    map.innerHTML = '';
    const me = g.players.find(p => p.id === state.me);
    for (const r of g.regions) {
      const cell = document.createElement('div');
      cell.className = 'region';
      if (me && r.id === me.regionIdx) cell.classList.add('has-me');
      if (cp && r.id === cp.regionIdx) cell.classList.add('current');
      const total = r.infections.reduce((s, i) => s + i.level, 0);
      if (total >= g.maxInfection) cell.classList.add('fallen');
      const infs = r.infections.map(i => `
        <span class="infection infection-${i.category}">
          ${i.category[0].toUpperCase()}${i.category.slice(1)}
          <span class="infection-dots">${'<span></span>'.repeat(i.level)}</span>
        </span>
      `).join('');
      const shield = r.shield > 0 ? `<span class="shield">🛡 Shield ${r.shield > 1 ? '(2)' : ''}</span>` : '';
      const tokens = g.players.filter(p => p.regionIdx === r.id).map(p => `
        <span class="token ${p.id === state.me ? 'you' : ''}">${escapeHtml(p.name)}${p.id === g.currentPlayerId ? ' ▶' : ''}</span>
      `).join('');
      cell.innerHTML = `
        <div class="region-head">
          <div>
            <div class="region-name">${r.name}</div>
            <div class="region-short">${r.short}</div>
          </div>
          ${shield}
        </div>
        <div class="infections">${infs || '<span class="subtle" style="font-size:12px;">clear</span>'}</div>
        <div class="region-tokens">${tokens}</div>
      `;
      cell.style.gridColumn = `${r.col + 1}`;
      cell.style.gridRow = `${r.row + 1}`;
      map.appendChild(cell);
    }

    if (me) {
      const role = g.roles.find(r => r.id === me.role);
      $('you-name').textContent = me.name + ' (you)';
      $('you-role').textContent = role ? `${role.name} — ${role.blurb}` : '';
      const whereR = g.regions[me.regionIdx];
      $('you-where').textContent = whereR ? `You are in ${whereR.name}. Bonus AP next turn: ${me.apBonus || 0}` : '';
    } else {
      $('you-name').textContent = 'Spectator';
      $('you-role').textContent = '';
      $('you-where').textContent = '';
    }

    const banner = $('turn-banner');
    if (cp && cp.id === state.me) {
      banner.className = 'turn-banner my-turn';
      banner.textContent = g.activeQuizFor ? 'Answer the quiz to apply your action.' : `Your turn. You have ${g.actionsLeft} action points.`;
    } else {
      banner.className = 'turn-banner their-turn';
      banner.textContent = cp ? `Waiting for ${cp.name}…` : 'Waiting…';
    }

    renderActions();
    renderLog();
  }

  function renderActions() {
    const g = state.game;
    const me = g.players.find(p => p.id === state.me);
    const container = $('actions-container');
    container.innerHTML = '';
    const isMyTurn = g.currentPlayerId === state.me && !g.activeQuizFor;
    if (!me || !isMyTurn) return;

    const region = g.regions[me.regionIdx];

    {
      const group = document.createElement('div');
      group.className = 'action-group';
      const neighbors = me.role === 'logistics'
        ? g.regions.filter(r => r.id !== me.regionIdx)
        : region.neighbors.map(id => g.regions[id]);
      const btns = neighbors.map(r => {
        const total = r.infections.reduce((s,i)=>s+i.level, 0);
        return `<button data-act="move" data-rid="${r.id}" ${g.actionsLeft<1?'disabled':''}>→ ${escapeHtml(r.name)}${total? ' ('+total+')':''}</button>`;
      }).join('');
      group.innerHTML = `<h4>Move (1 AP)${me.role === 'logistics' ? ' — Logistics: any region' : ''}</h4><div class="action-btns">${btns}</div>`;
      container.appendChild(group);
    }

    {
      const cost = me.role === 'doctor' ? 1 : 2;
      const group = document.createElement('div');
      group.className = 'action-group';
      const cats = [...new Set(region.infections.map(i => i.category))];
      let btns;
      if (cats.length === 0) btns = '<span class="subtle">No infections here.</span>';
      else btns = cats.map(c => `<button class="cat-${c}" data-act="treat" data-cat="${c}" ${g.actionsLeft<cost?'disabled':''}>Treat ${c}</button>`).join('');
      group.innerHTML = `<h4>Treat (${cost} AP) — correct quiz answer removes 1 infection and earns research</h4><div class="action-btns">${btns}</div>`;
      container.appendChild(group);
    }

    {
      const cost = me.role === 'nurse' ? 1 : 2;
      const group = document.createElement('div');
      group.className = 'action-group';
      const btns = CATS.map(c => `<button class="cat-${c}" data-act="shield" data-cat="${c}" ${g.actionsLeft<cost?'disabled':''}>Prevent ${c}</button>`).join('');
      group.innerHTML = `<h4>Prevent (${cost} AP) — correct quiz answer shields this region${me.role==='nurse'?' for 2 rounds':''}</h4><div class="action-btns">${btns}</div>`;
      container.appendChild(group);
    }

    {
      const here = g.players.filter(p => p.regionIdx === me.regionIdx && p.id !== me.id);
      if (here.length > 0) {
        const group = document.createElement('div');
        group.className = 'action-group';
        const btns = here.map(p => `<button data-act="share" data-pid="${p.id}" ${g.actionsLeft<1?'disabled':''}>Share with ${escapeHtml(p.name)}</button>`).join('');
        const gain = me.role === 'educator' ? 2 : 1;
        group.innerHTML = `<h4>Share Intel (1 AP) — give teammate +${gain} AP next turn</h4><div class="action-btns">${btns}</div>`;
        container.appendChild(group);
      }
    }

    {
      const group = document.createElement('div');
      group.className = 'action-group';
      group.innerHTML = `<div class="action-btns"><button data-act="end" class="primary" style="flex:1;">End Turn</button></div>`;
      container.appendChild(group);
    }
  }

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    let res;
    if (act === 'move') res = await post('game/move', { regionIdx: parseInt(btn.dataset.rid, 10) });
    else if (act === 'treat') res = await post('game/treat', { category: btn.dataset.cat });
    else if (act === 'shield') res = await post('game/shield', { category: btn.dataset.cat });
    else if (act === 'share') res = await post('game/share', { targetId: btn.dataset.pid });
    else if (act === 'end') res = await post('game/end-turn', {});
    if (res && res.error) toast(res.error);
  });

  function renderLog() {
    const ul = $('log-list');
    ul.innerHTML = '';
    for (const entry of state.game.log) {
      const li = document.createElement('li');
      li.textContent = entry.msg;
      ul.appendChild(li);
    }
  }

  function renderPathogenRef() {
    const list = $('pathogen-list');
    if (!list || !state.pathogenData) return;
    list.innerHTML = '';
    const cats = state.pathogenData.categories;
    for (const catKey of Object.keys(cats)) {
      const cat = cats[catKey];
      const header = document.createElement('div');
      header.className = 'pathogen-card';
      header.innerHTML = `
        <h4><span class="chip chip-${catKey}">${cat.name}</span></h4>
        <p>${cat.description}</p>
        <p><span class="label">Prevention:</span> ${cat.general_prevention.join('; ')}</p>
        <p><span class="label">Treatment:</span> ${cat.general_treatment.join('; ')}</p>
      `;
      list.appendChild(header);
      for (const p of state.pathogenData.pathogens.filter(pp => pp.category === catKey)) {
        const card = document.createElement('div');
        card.className = 'pathogen-card';
        card.innerHTML = `
          <h4>${escapeHtml(p.name)}</h4>
          <p>${escapeHtml(p.fact)}</p>
          <p><span class="label">Prevention:</span> ${escapeHtml(p.prevention.join('; '))}</p>
          <p><span class="label">Treatment:</span> ${escapeHtml(p.treatment.join('; '))}</p>
        `;
        list.appendChild(card);
      }
    }
  }

  // ---- Tabs ----
  document.querySelectorAll('.panel-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.panel-tabs .tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-body').forEach(b => b.classList.remove('active'));
      tab.classList.add('active');
      $('tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  $('btn-log-toggle').addEventListener('click', () => {
    const t = document.querySelector('.panel-tabs .tab[data-tab="log"]');
    if (t) t.click();
    $('side-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ---- Chat ----
  $('chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await post('chat', { text });
  });

  // ---- Quiz modal ----
  function openQuiz(q) {
    $('quiz-modal').hidden = false;
    $('quiz-prompt').textContent = q.prompt || '';
    $('quiz-question').textContent = q.question;
    const ch = $('quiz-choices');
    ch.innerHTML = '';
    q.choices.forEach((c, i) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-choice';
      btn.textContent = c;
      btn.addEventListener('click', async () => {
        [...ch.children].forEach(b => b.disabled = true);
        btn.dataset.picked = '1';
        await post('game/quiz-answer', { choiceIdx: i });
      });
      ch.appendChild(btn);
    });
    $('quiz-result').hidden = true;
    $('quiz-result').className = 'quiz-result';
    $('quiz-close').hidden = true;
  }

  function showQuizResult(r) {
    const ch = $('quiz-choices');
    [...ch.children].forEach((b, i) => {
      b.disabled = true;
      if (i === r.answer) b.classList.add('correct');
      else if (b.dataset.picked === '1') b.classList.add('wrong');
    });
    const res = $('quiz-result');
    res.hidden = false;
    res.className = 'quiz-result ' + (r.correct ? 'correct' : 'wrong');
    let extra = '';
    if (r.pathogenInfo) {
      const p = r.pathogenInfo;
      extra = `
        <p><strong>${escapeHtml(p.name)}</strong> — ${escapeHtml(p.fact)}</p>
        <p><strong>Prevention:</strong> ${escapeHtml(p.prevention.join('; '))}</p>
        <p><strong>Treatment:</strong> ${escapeHtml(p.treatment.join('; '))}</p>
      `;
    }
    res.innerHTML = `
      <h4>${r.correct ? 'Correct!' : 'Incorrect'}</h4>
      <p>${escapeHtml(r.explain || '')}</p>
      ${extra}
    `;
    $('quiz-close').hidden = false;
  }

  $('quiz-close').addEventListener('click', () => {
    $('quiz-modal').hidden = true;
  });

  // ---- End modal ----
  function showEndModal() {
    const g = state.game;
    const modal = $('end-modal');
    modal.hidden = false;
    if (g.phase === 'won') {
      $('end-title').textContent = 'Outbreak Contained!';
      $('end-message').textContent = 'Your team cured every pathogen category. Millions saved.';
    } else {
      $('end-title').textContent = 'Outbreak Overwhelmed';
      const reason = g.outbreakCount >= g.maxOutbreaks ? `${g.outbreakCount} regions fell to the pathogens.` : 'Time ran out before the team could develop all cures.';
      $('end-message').textContent = reason;
    }
    const stats = $('end-stats');
    stats.innerHTML = `
      <p>Rounds played: ${g.round}</p>
      <p>Research points: ${CATS.map(c => `${c}: ${g.research[c]||0}/${g.researchGoal}`).join(' • ')}</p>
      <p>Cured: ${g.eradicated.length ? g.eradicated.join(', ') : 'none'}</p>
    `;
  }
  $('end-home').addEventListener('click', async () => {
    $('end-modal').hidden = true;
    await post('lobby/leave', {});
    state.code = null; state.game = null;
    showView('home');
  });

})();
