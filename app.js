// ═══════════════════════════════════════════════════════════════════
// RAFA DASHBOARD v2 — Google Calendar como fonte de tasks
// Tasks criadas via Claude aparecem aqui automaticamente
// ═══════════════════════════════════════════════════════════════════

// ─── CONFIG ─────────────────────────────────────────────────────────
// Client ID do Google OAuth — substitua pelo seu
const GOOGLE_CLIENT_ID = '174221986303-tk3fupgbspcp9dm4cj2mvjoige99tvtv.apps.googleusercontent.com';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';

// Calendários para buscar tasks (rmuccello lê os 3)
const TASK_CALENDARS = [
  { id: 'rafaella2302@gmail.com',  sphere: 'rosa'  },
  { id: 'rmuccello@gmail.com',     sphere: 'verde' },
  // roxo tasks ficam em rmuccello com prefixo [TASK-ROXO]
];

// Prefixos que identificam tasks no Google Calendar
const TASK_PREFIX = '[TASK-';
const SPHERES = ['rosa', 'roxo', 'verde'];
const SPHERE_LABELS = { rosa: 'Pessoal', roxo: 'Supernova', verde: 'Leo Foguete' };
const SPHERE_COLOR = { rosa: '#F472B6', roxo: '#A78BFA', verde: '#34D399' };

// ─── CALENDAR DATA (estático — atualizado semanalmente via Claude) ──
const CAL_DATA = {
  "2026-04-23": {
    rosa: [{time:"07:30",name:"🏋️ Treino anterior"},{time:"09:00",name:"📞 Ligar oculista"},{time:"16:30",name:"🖨️ Imprimir pedido médico"}],
    roxo: [{time:"12:00",name:"🔒 Reunião privada"},{time:"16:00",name:"🔒 Reunião privada"},{time:"18:00",name:"🔒 Reunião privada"}],
    verde: [{time:"10:00",name:"📄 Enviar NF"}]
  },
  "2026-04-24": {
    rosa: [{time:"06:45",name:"🩸 Exame de sangue (em casa)"},{time:"08:00",name:"🏋️ Cardio + abdômen"}],
    roxo: [{time:"21:00",name:"🔒 Reunião privada"}],
    verde: [{time:"11:30",name:"📊 B+CA: Apresentação planejamento visual SJ"}]
  },
  "2026-04-25": {
    rosa: [{time:"13:00",name:"🍽️ Almoço Les Lobaralhas"},{time:"16:00",name:"🌳 Chácara"}],
    roxo: [],
    verde: [{time:"22:00",name:"🎶 Maracutaia"}]
  },
  "2026-04-27": {
    rosa: [],
    roxo: [{time:"19:00",name:"🔒 Reunião privada"}],
    verde: [
      {time:"10:00",name:"📊 [LF] Apresentação planejamento Single+Album (B+ca)"},
      {time:"16:00",name:"📊 [LF] Apresentação planejamento — equipe completa"}
    ]
  }
};

function getWeekDays() {
  const dayNames = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const result = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < 8; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const key = d.toISOString().split('T')[0];
    const label = `${dayNames[d.getDay()]} ${d.getDate()}`;
    result.push({ label, key });
  }
  return result;
}

const DEFAULT_REMINDERS = [
  { id: 'rem1', sphere: 'roxo', text: 'Cobrar Alyni do YouTube — retorno projeto DVD', date: '2026-04-27', time: '14:00' },
];

const DEFAULT_PRIORITIES = [
  { sphere: 'rosa',  text: 'Endocrinologista 9h (quarta) — imprimir pedido antes' },
  { sphere: 'verde', text: 'Enviar mensagem B+ca e Universal logo pela manhã' },
  { sphere: 'rosa',  text: 'Áudios pra Gabi sobre contrato — quarta 10h' },
  { sphere: 'roxo',  text: 'Vitinho (Amazon) · Yago (YouTube + Alyni) · EP do G.A' },
];

// ─── STATE ──────────────────────────────────────────────────────────
const LS_KEY = 'rafa-v2';
let state = loadState();
let googleToken = null;
let calendarTasks = { rosa: [], roxo: [], verde: [] }; // from Google Calendar
let selSph = 'rosa';
let selType = 'task';
let isPrio = false;
let selectedDay = new Date().toISOString().split('T')[0];
let isSyncing = false;

function loadState() {
  try {
    const s = localStorage.getItem(LS_KEY);
    if (s) return JSON.parse(s);
  } catch(e) {}
  return {
    doneTasks: { rosa: [], roxo: [], verde: [] },
    manualTasks: { rosa: [], roxo: [], verde: [] }, // tasks added manually in app
    pautaItems: [],
    reminders: [...DEFAULT_REMINDERS],
    priorities: [...DEFAULT_PRIORITIES],
    lastMidnightCheck: null,
    doneCalendarIds: [], // calendar event IDs marked as done
  };
}

function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch(e) {}
}

// ─── GOOGLE AUTH ────────────────────────────────────────────────────
function initGoogleAuth() {
  if (GOOGLE_CLIENT_ID === 'PLACEHOLDER_NEVER_MATCH') {
    showAuthBanner('config');
    return;
  }
  if (typeof google === 'undefined') {
    showAuthBanner('offline');
    return;
  }
  const tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: GOOGLE_SCOPES,
    callback: (resp) => {
      if (resp.error) { showAuthBanner('error'); return; }
      googleToken = resp.access_token;
      hideAuthBanner();
      syncCalendarTasks();
    },
  });
  window._tokenClient = tokenClient;
  // Try silent login first
  tokenClient.requestAccessToken({ prompt: '' });
}

function requestGoogleAuth() {
  if (window._tokenClient) window._tokenClient.requestAccessToken({ prompt: 'consent' });
}

function showAuthBanner(type) {
  const el = document.getElementById('auth-banner');
  if (!el) return;
  if (type === 'config') {
    el.innerHTML = `<div class="auth-banner warn">⚙️ Configure o <strong>GOOGLE_CLIENT_ID</strong> em app.js para ativar a sincronização automática de tasks.</div>`;
  } else if (type === 'offline') {
    el.innerHTML = `<div class="auth-banner info">📶 Modo offline — tasks do Google Calendar não disponíveis. Conecte à internet e recarregue.</div>`;
  } else {
    el.innerHTML = `<div class="auth-banner warn">🔑 <button onclick="requestGoogleAuth()" class="auth-link">Conectar Google Calendar</button> para sincronizar tasks automaticamente.</div>`;
  }
}

function hideAuthBanner() {
  const el = document.getElementById('auth-banner');
  if (el) el.innerHTML = '';
}

// ─── SYNC CALENDAR TASKS ────────────────────────────────────────────
async function syncCalendarTasks() {
  if (!googleToken || isSyncing) return;
  isSyncing = true;
  setSyncStatus('syncing');

  const newTasks = { rosa: [], roxo: [], verde: [] };
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(); // last month
  const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 1).toISOString(); // 3 months ahead

  try {
    // Fetch from both writable calendars
    for (const cal of TASK_CALENDARS) {
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?` +
        `timeMin=${timeMin}&timeMax=${timeMax}&q=${encodeURIComponent('[TASK-')}&singleEvents=true&maxResults=200`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${googleToken}` }
      });

      if (res.status === 401) { googleToken = null; requestGoogleAuth(); return; }
      if (!res.ok) continue;

      const data = await res.json();
      const items = data.items || [];

      for (const item of items) {
        const title = item.summary || '';
        const match = title.match(/^\[TASK-(ROSA|ROXO|VERDE)\]\s*(.+)/i);
        if (!match) continue;

        const sphere = match[1].toLowerCase();
        const text = match[2].trim();
        const isDone = state.doneCalendarIds.includes(item.id);

        // Parse metadata from description if present
        let meta = {};
        try { meta = JSON.parse(item.description || '{}'); } catch(e) {}

        if (!isDone) {
          newTasks[sphere].push({
            id: item.id,
            text,
            tag: meta.tag || '',
            tagType: meta.tagType || 'f',
            done: false,
            fromCalendar: true,
          });
        }
      }
    }

    calendarTasks = newTasks;
    setSyncStatus('ok');
    renderTasks();
    renderProgress();
  } catch(e) {
    setSyncStatus('error');
  } finally {
    isSyncing = false;
  }
}

function setSyncStatus(status) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  const now = new Date();
  const t = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  if (status === 'syncing') {
    el.innerHTML = `<span class="sync-dot syncing"></span>Sincronizando…`;
  } else if (status === 'ok') {
    el.innerHTML = `<span class="sync-dot ok"></span>Atualizado às ${t}`;
  } else {
    el.innerHTML = `<span class="sync-dot error"></span>Erro ao sincronizar`;
  }
}

// ─── CLOCK ──────────────────────────────────────────────────────────
function tick() {
  const n = new Date();
  const days = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  document.getElementById('dt').textContent = `${days[n.getDay()]}, ${n.getDate()} ${months[n.getMonth()]} ${n.getFullYear()}`;
  document.getElementById('tm').textContent = String(n.getHours()).padStart(2,'0') + ':' + String(n.getMinutes()).padStart(2,'0');
  // Midnight check
  const today = n.toISOString().split('T')[0];
  if (n.getHours() === 0 && state.lastMidnightCheck !== today) {
    state.lastMidnightCheck = today;
    moveDoneTasks();
    save();
    // Re-sync at midnight
    syncCalendarTasks();
  }
}

// ─── PAGES ──────────────────────────────────────────────────────────
function showPage(p) {
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.ntab').forEach(el => el.classList.remove('active'));
  document.getElementById('page-' + p).classList.add('active');
  const idx = { main: 0, done: 1, astro: 2, pauta: 3 }[p];
  if (idx !== undefined) document.querySelectorAll('.ntab')[idx].classList.add('active');
  if (p === 'done') renderDone();
  if (p === 'pauta') renderPauta();
}

// ─── PRIORITIES ─────────────────────────────────────────────────────
function renderPriorities() {
  const el = document.getElementById('prio-list');
  el.innerHTML = state.priorities.map(p =>
    `<div class="prio-row"><span class="badge ${p.sphere}">${SPHERE_LABELS[p.sphere]}</span><span>${esc(p.text)}</span></div>`
  ).join('');
}

// ─── DAY PILLS ──────────────────────────────────────────────────────
function renderDayPills() {
  document.getElementById('day-pills').innerHTML = getWeekDays().map(d =>
    `<button class="dp ${selectedDay === d.key ? 'active' : ''}" onclick="selDay('${d.key}')">${d.label}</button>`
  ).join('');
}

function selDay(key) {
  selectedDay = key;
  renderDayPills();
  renderCals();
}

// ─── CALENDAR ───────────────────────────────────────────────────────
function renderCals() {
  SPHERES.forEach(s => {
    const el = document.getElementById('cal-' + s);
    const events = ((CAL_DATA[selectedDay] || {})[s]) || [];
    const dayRems = state.reminders.filter(r => r.date === selectedDay && r.sphere === s);
    const all = [
      ...events,
      ...dayRems.map(r => ({ time: r.time || '—', name: `🔔 ${r.text}`, isRem: true }))
    ].sort((a, b) => (a.time||'').localeCompare(b.time||''));

    if (!all.length) { el.innerHTML = '<div class="cempty">Sem eventos.</div>'; return; }
    el.innerHTML = all.map(e =>
      `<div class="cev">
        <span class="ctime">${e.time}</span>
        <div class="cdot" style="${e.isRem ? 'background:var(--astro)' : ''}"></div>
        <span class="cname" style="${e.isRem ? 'color:var(--astro)' : ''}">${esc(e.name)}</span>
      </div>`
    ).join('');
  });
}

// ─── TASKS ──────────────────────────────────────────────────────────
function allTasksForSphere(s) {
  // Merge calendar tasks + manual tasks, deduplicate by id
  const cal = calendarTasks[s] || [];
  const manual = state.manualTasks[s] || [];
  return [...cal, ...manual];
}

function renderTasks() {
  SPHERES.forEach(s => {
    const el = document.getElementById('tb-' + s);
    const tasks = allTasksForSphere(s);
    const pending = tasks.filter(t => !t.done);

    if (!pending.length) {
      el.innerHTML = '<div class="task-empty">Sem tasks pendentes 🎉</div>';
    } else {
      el.innerHTML = pending.map(t => `
        <div class="task" onclick="toggleTask('${s}','${t.id}','${t.fromCalendar ? 'cal' : 'manual'}')">
          <div class="tck"><span class="chkico">✓</span></div>
          <div class="ti">
            <div class="ttxt">${esc(t.text)}</div>
            ${t.tag ? `<span class="ttag tag-${t.tagType||'f'}">${t.tag}</span>` : ''}
            ${t.fromCalendar ? '<span class="cal-tag">cal</span>' : ''}
          </div>
        </div>
      `).join('');
    }
  });
  renderProgress();
}

function toggleTask(sphere, id, source) {
  if (source === 'cal') {
    // Mark as done locally (can't edit Google Calendar events from here)
    if (!state.doneCalendarIds.includes(id)) {
      state.doneCalendarIds.push(id);
      // Move to done
      const task = (calendarTasks[sphere] || []).find(t => t.id === id);
      if (task) {
        state.doneTasks[sphere].unshift({ ...task, done: true, completedAt: nowTime(), completedDate: todayISO() });
        calendarTasks[sphere] = calendarTasks[sphere].filter(t => t.id !== id);
      }
    }
  } else {
    const t = (state.manualTasks[sphere] || []).find(x => x.id === id);
    if (t) {
      t.done = true;
      state.doneTasks[sphere].unshift({ ...t, completedAt: nowTime(), completedDate: todayISO() });
      state.manualTasks[sphere] = state.manualTasks[sphere].filter(x => x.id !== id);
      if (t.isPriority) {
        state.priorities = (state.priorities || []).filter(p => p.id !== id);
        renderPriorities();
      }
    }
  }
  save();
  renderTasks();
}

function renderProgress() {
  SPHERES.forEach(s => {
    const all = allTasksForSphere(s);
    const total = all.length + (state.doneTasks[s] || []).filter(d => d.completedDate === todayISO()).length;
    const done = (state.doneTasks[s] || []).filter(d => d.completedDate === todayISO()).length;
    const pct = total ? Math.round(done / total * 100) : 0;
    document.getElementById('pf-' + s).style.width = pct + '%';
    document.getElementById('pt-' + s).textContent = `${done}/${total}`;
    document.getElementById('ct-' + s).textContent = `${all.filter(t=>!t.done).length} tasks`;
  });
}

// ─── ADD MANUAL UPDATE ──────────────────────────────────────────────
function selSphere(s) {
  selSph = s;
  SPHERES.forEach(x => {
    const b = document.getElementById('btn-' + x);
    b.className = 'sbtn ' + x;
  });
  document.getElementById('btn-' + s).classList.add('active');
}

function selTypeBtn(t) {
  selType = t;
  document.getElementById('type-task').classList.toggle('active', t === 'task');
  document.getElementById('type-pauta').classList.toggle('active', t === 'pauta');
  const prioBtn = document.getElementById('type-prio');
  if (prioBtn) {
    prioBtn.style.display = t === 'task' ? '' : 'none';
    if (t !== 'task') { isPrio = false; prioBtn.classList.remove('active'); }
  }
}

function togglePrio() {
  isPrio = !isPrio;
  document.getElementById('type-prio').classList.toggle('active', isPrio);
}

function addUpdate() {
  const input = document.getElementById('uinput');
  const txt = input.value.trim();
  if (!txt) return;
  input.value = '';

  if (selType === 'task') {
    if (!state.manualTasks[selSph]) state.manualTasks[selSph] = [];
    const taskId = `m${Date.now()}`;
    state.manualTasks[selSph].push({
      id: taskId,
      text: txt,
      tag: 'novo',
      tagType: 'new',
      done: false,
      fromCalendar: false,
      isPriority: isPrio,
    });
    if (isPrio) {
      if (!state.priorities) state.priorities = [];
      state.priorities.push({ id: taskId, sphere: selSph, text: txt, fromTask: true });
      renderPriorities();
    }
    isPrio = false;
    const prioBtn = document.getElementById('type-prio');
    if (prioBtn) prioBtn.classList.remove('active');
    renderTasks();
  } else {
    if (!state.pautaItems) state.pautaItems = [];
    state.pautaItems.push({
      id: `p${Date.now()}`,
      sphere: selSph,
      text: txt,
      time: nowTime(),
      date: todayISO(),
    });
    renderPauta();
  }
  save();
}

// ─── REMINDERS ──────────────────────────────────────────────────────
function renderReminders() {
  const el = document.getElementById('rem-list-el');
  const rems = state.reminders || [];
  if (!rems.length) {
    el.innerHTML = '<div class="rem-empty">Nenhum lembrete futuro.</div>';
    return;
  }
  el.innerHTML = '<div class="rem-list">' + rems.map(r => `
    <div class="rem-item">
      <div class="rem-dot ${r.sphere}"></div>
      <div class="rem-info">
        <div class="rem-text">${esc(r.text)}</div>
        <div class="rem-meta">${fmtDate(r.date)}${r.time ? ` às ${r.time}` : ''}
          <span class="rem-badge" style="background:${SPHERE_COLOR[r.sphere]}22;color:${SPHERE_COLOR[r.sphere]}">${SPHERE_LABELS[r.sphere]}</span>
        </div>
      </div>
      <button class="rem-del" onclick="deleteReminder('${r.id}')">×</button>
    </div>
  `).join('') + '</div>';
}

function toggleRemForm() {
  const f = document.getElementById('rem-form');
  f.classList.toggle('open');
  if (f.classList.contains('open') && !document.getElementById('rem-date').value) {
    document.getElementById('rem-date').value = todayISO();
  }
}

function saveReminder() {
  const txt = document.getElementById('rem-txt').value.trim();
  const sphere = document.getElementById('rem-sphere').value;
  const date = document.getElementById('rem-date').value;
  const time = document.getElementById('rem-time').value;
  if (!txt || !date) return;
  if (!state.reminders) state.reminders = [];
  state.reminders.push({ id: `rem${Date.now()}`, sphere, text: txt, date, time });
  state.reminders.sort((a, b) => a.date.localeCompare(b.date));
  document.getElementById('rem-txt').value = '';
  document.getElementById('rem-time').value = '';
  document.getElementById('rem-form').classList.remove('open');
  save();
  renderReminders();
  renderCals();
}

function deleteReminder(id) {
  state.reminders = (state.reminders || []).filter(r => r.id !== id);
  save();
  renderReminders();
  renderCals();
}

// ─── PAUTA ──────────────────────────────────────────────────────────
function renderPauta() {
  const el = document.getElementById('pauta-list-el');
  const items = (state.pautaItems || []).filter(p => p.sphere === 'verde').reverse();
  if (!items.length) {
    el.innerHTML = '<div class="pauta-empty">Nenhuma pauta registrada. Use o campo abaixo e escolha "Pauta".</div>';
    return;
  }
  el.innerHTML = '<div class="pauta-list">' + items.map(p => `
    <div class="pauta-item">
      <div class="pauta-time">${p.time || '—'}</div>
      <div class="pauta-info">
        <div class="pauta-sphere ${p.sphere}">${SPHERE_LABELS[p.sphere]} · ${fmtDate(p.date || todayISO())}</div>
        <div class="pauta-text">${esc(p.text)}</div>
      </div>
      <button class="pauta-del" onclick="deletePauta('${p.id}')">×</button>
    </div>
  `).join('') + '</div>';
}

function deletePauta(id) {
  state.pautaItems = (state.pautaItems || []).filter(p => p.id !== id);
  save();
  renderPauta();
}

// ─── DONE ───────────────────────────────────────────────────────────
function moveDoneTasks() {
  SPHERES.forEach(s => {
    const manual = (state.manualTasks[s] || []).filter(t => t.done);
    manual.forEach(t => state.doneTasks[s].unshift({ ...t, completedAt: nowTime(), completedDate: todayISO() }));
    state.manualTasks[s] = (state.manualTasks[s] || []).filter(t => !t.done);
  });
  renderTasks();
  renderDone();
}

function renderDone() {
  SPHERES.forEach(s => {
    const el = document.getElementById('done-' + s);
    const items = state.doneTasks[s] || [];
    if (!items.length) {
      el.innerHTML = '<div class="done-empty">Nenhuma task concluída ainda.</div>';
      return;
    }
    el.innerHTML = '<div class="done-list">' + items.map(t => `
      <div class="done-item">
        <div class="done-check"><span class="done-chkico">✓</span></div>
        <div class="done-txt">${esc(t.text)}</div>
        ${t.completedAt ? `<span class="done-time">${t.completedAt}</span>` : ''}
      </div>
    `).join('') + '</div>';
  });
}

// ─── UTILS ──────────────────────────────────────────────────────────
function esc(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function nowTime() { const n = new Date(); return String(n.getHours()).padStart(2,'0') + ':' + String(n.getMinutes()).padStart(2,'0'); }
function todayISO() { return new Date().toISOString().split('T')[0]; }
function fmtDate(d) { const [y,m,day] = d.split('-'); const ms = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']; return `${day}/${ms[parseInt(m)-1]}/${y}`; }

// ─── INIT ────────────────────────────────────────────────────────────
tick();
setInterval(tick, 20000);
// Re-sync every 5 minutes if token available
setInterval(() => { if (googleToken) syncCalendarTasks(); }, 5 * 60 * 1000);

renderPriorities();
renderDayPills();
renderCals();
renderTasks();
renderReminders();
renderDone();
selSphere('rosa');
selTypeBtn('task');

// Keyboard shortcut
document.getElementById('uinput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addUpdate(); }
});

// Google Auth — runs after GSI script loads
window.addEventListener('load', () => {
  setTimeout(initGoogleAuth, 500);
});

// Expose globals
window.showPage = showPage; window.selDay = selDay;
window.toggleTask = toggleTask; window.selSphere = selSphere;
window.selTypeBtn = selTypeBtn; window.addUpdate = addUpdate;
window.togglePrio = togglePrio;
window.toggleRemForm = toggleRemForm; window.saveReminder = saveReminder;
window.deleteReminder = deleteReminder; window.deletePauta = deletePauta;
window.requestGoogleAuth = requestGoogleAuth;
window.syncCalendarTasks = syncCalendarTasks;
