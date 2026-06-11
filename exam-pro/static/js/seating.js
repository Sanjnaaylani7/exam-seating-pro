// ============================================================
//  seating.js  —  Frontend for multi-room CSP seating
//  Calls Flask /api/upload and /api/solve
// ============================================================

const COLORS = [
  '#00d9b8','#3d8bff','#b06fff','#ff6b6b','#ffa657',
  '#56d364','#f0883e','#79c0ff','#ff7b72','#e3b341',
  '#bc8cff','#7ee787','#d2a8ff','#58a6ff','#ffd700',
];

let students   = [];
let roomsData  = [];
let courseMap  = {};
let colorIdx   = 0;

const $ = id => document.getElementById(id);

// ── Dom refs ─────────────────────────────────────────────────
const elFile     = $('excel-file');
const elRooms    = $('input-rooms');
const elRows     = $('input-rows');
const elCols     = $('input-cols');
const elGenerate = $('btn-generate');
const elReset    = $('btn-reset');
const elGridWrap = $('grid-wrap');
const elLegend   = $('legend');
const elLog      = $('log');
const elStatus   = $('status-text');
const elSDot     = $('sdot');
const elProgFill = $('prog-fill');
const elStatCards= $('stat-cards');
const elRoomTabs = $('room-tabs');
const elTabsCard = $('tabs-card');
const elRoomBar  = $('room-info-bar');
const elGridTitle= $('grid-title');

// ── Loading overlay ───────────────────────────────────────────
const overlay = document.createElement('div');
overlay.className = 'loading-overlay';
overlay.innerHTML = '<div class="loading-spinner"></div><div class="loading-text" id="loading-text">Solving CSP…</div>';
document.body.appendChild(overlay);

function showLoading(msg='Solving CSP…') {
  $('loading-text').textContent = msg;
  overlay.classList.add('show');
}
function hideLoading() { overlay.classList.remove('show'); }

// ── Helpers ───────────────────────────────────────────────────
function setStatus(msg, type='idle') {
  elStatus.textContent = msg;
  elStatus.className   = 'stext ' + type;
  elSDot.className     = 'sdot ' + type;
}
function setProg(pct) { elProgFill.style.width = pct + '%'; }

function logMsg(msg, type='info') {
  const d = document.createElement('div');
  d.className = 'log-entry ' + type;
  d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  elLog.prepend(d);
  while (elLog.children.length > 100) elLog.removeChild(elLog.lastChild);
}

function courseColor(course) {
  if (!course) return '#4a6580';
  if (!courseMap[course]) {
    courseMap[course] = COLORS[colorIdx % COLORS.length];
    colorIdx++;
  }
  return courseMap[course];
}

function updateCapHint() {
  const r = +elRooms.value||30, ro = +elRows.value||5, c = +elCols.value||10;
  const cap = r * ro * c;
  const el  = $('cap-hint');
  el.textContent = `Capacity: ${r} × ${ro*c} = ${cap} seats`;
  el.style.color = (students.length > cap) ? '#ff4757' : '#00d9b8';
}
['input-rooms','input-rows','input-cols'].forEach(id => $(id)?.addEventListener('input', updateCapHint));

// ── Upload ────────────────────────────────────────────────────
$('upload-area').addEventListener('click', () => elFile.click());
$('upload-area').addEventListener('dragover', e => { e.preventDefault(); $('upload-area').classList.add('drag-over'); });
$('upload-area').addEventListener('dragleave', () => $('upload-area').classList.remove('drag-over'));
$('upload-area').addEventListener('drop', e => {
  e.preventDefault(); $('upload-area').classList.remove('drag-over');
  if (e.dataTransfer.files[0]) { elFile.files = e.dataTransfer.files; elFile.dispatchEvent(new Event('change')); }
});

elFile.addEventListener('change', async () => {
  const file = elFile.files[0];
  if (!file) return;
  $('file-name').textContent = file.name;
  setStatus('Parsing Excel…', 'busy');
  logMsg(`Loading: ${file.name}`);

  const fd = new FormData();
  fd.append('file', file);

  try {
    const res  = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    students = data.students;
    const s   = data.summary;
    setStatus(`✓ ${s.total} students loaded`, 'ok');
    logMsg(`${s.total} students | Courses: ${s.courses.length} | Sections: ${s.sections.length} | Depts: ${(s.depts||[]).length}`, 'ok');
    elGenerate.disabled = false;
    renderTable(students);
    updateCapHint();
  } catch (err) {
    setStatus('✗ ' + err.message, 'error');
    logMsg(err.message, 'error');
  }
});

// ── Generate ──────────────────────────────────────────────────
elGenerate.addEventListener('click', generate);

async function generate() {
  if (!students.length) return;
  const rows = +elRows.value, cols = +elCols.value, numRooms = +elRooms.value;

  if (rows<1||rows>20||cols<1||cols>20||numRooms<1||numRooms>50) {
    setStatus('Invalid config', 'error'); return;
  }
  if (students.length > numRooms * rows * cols) {
    setStatus(`✗ Not enough seats! ${students.length} students, ${numRooms*rows*cols} seats`, 'error');
    return;
  }

  elGenerate.disabled = true;
  elReset.disabled    = false;
  courseMap = {}; colorIdx = 0;

  setStatus(`Solving ${numRooms} rooms on Python backend…`, 'busy');
  setProg(10);
  logMsg(`Sending ${students.length} students to CSP solver (Python)…`, 'info');
  showLoading(`Solving ${students.length} students across ${numRooms} rooms…`);

  try {
    const res  = await fetch('/api/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ students, rows, cols, numRooms })
    });
    const data = await res.json();
    hideLoading();

    if (!res.ok) throw new Error(data.error);

    roomsData = data.rooms;
    const solved = data.rooms.filter(r => r.solved).length;
    const failed = data.rooms.filter(r => !r.solved).length;

    setProg(100);
    setStatus(`✓ ${solved}/${data.numRooms} rooms solved — ${data.totalPlaced} students seated!`, 'ok');
    logMsg(`Done! ${solved}/${data.numRooms} rooms. ${data.totalPlaced}/${data.totalStudents} seated.`, 'ok');
    if (failed > 0) logMsg(`${failed} room(s) failed — try larger hall.`, 'warn');

    buildRoomTabs(data.rooms);
    showRoom(0);

    elTabsCard.style.display = 'block';
    $('rooms-solved-label').textContent = `${solved}/${data.numRooms} solved`;
    elGenerate.disabled = false;

    // stats
    const totalBt = data.rooms.reduce((a,r) => a + (r.stats?.backtracks||0), 0);
    const totalCalls = data.rooms.reduce((a,r) => a + (r.stats?.calls||0), 0);
    elStatCards.innerHTML = [
      { l:'Rooms Solved', v:`${solved}/${data.numRooms}` },
      { l:'Students',     v:data.totalPlaced             },
      { l:'Backtracks',   v:totalBt                      },
      { l:'CSP Calls',    v:totalCalls                   },
      { l:'Rows×Cols',    v:`${rows}×${cols}`            },
      { l:'Seats/Room',   v:rows*cols                    },
    ].map(({l,v}) => `<div class="stat-card"><div class="sv">${v}</div><div class="sl">${l}</div></div>`).join('');

    buildLegend();

  } catch (err) {
    hideLoading();
    setStatus('✗ ' + err.message, 'error');
    logMsg(err.message, 'error');
    elGenerate.disabled = false;
  }
}

// ── Room tabs ─────────────────────────────────────────────────
function buildRoomTabs(rooms) {
  elRoomTabs.innerHTML = '';
  const show = Math.min(rooms.length, 15);
  for (let i = 0; i < show; i++) {
    const r   = rooms[i];
    const btn = document.createElement('button');
    btn.className = 'rtab' + (r.solved ? '' : ' fail');
    btn.dataset.room = i;
    btn.innerHTML =
      `<span class="rt-num">R${i+1}</span>` +
      `<span class="rt-cnt">${r.stats?.placed||0}/${r.stats?.total_students||0}</span>` +
      `<span class="${r.solved?'rt-ok':'rt-fail'}">${r.solved?'✓':'✗'}</span>`;
    btn.addEventListener('click', () => showRoom(i));
    elRoomTabs.appendChild(btn);
  }
  if (rooms.length > 15) {
    const m = document.createElement('span');
    m.style.cssText = 'font-size:10px;color:#4a6580;padding:6px;align-self:center';
    m.textContent = `+${rooms.length-15} more`;
    elRoomTabs.appendChild(m);
  }
}

function showRoom(ri) {
  document.querySelectorAll('.rtab').forEach((t,i) => t.classList.toggle('active', i===ri));
  const room  = roomsData[ri];
  const stats = room.stats || {};
  const rows  = +elRows.value, cols = +elCols.value;

  elGridTitle.textContent = `Room ${ri+1}`;
  elRoomBar.innerHTML =
    `<span class="rib-title">Room ${ri+1}</span>` +
    `<span class="rib-pill">${stats.placed||0} students</span>` +
    `<span class="rib-pill ${room.solved?'ok':'fail'}">${room.solved?'✓ Solved':'✗ Failed'}</span>` +
    `<span class="rib-pill">${stats.backtracks||0} backtracks</span>` +
    `<span class="rib-pill">${stats.calls||0} calls</span>`;

  renderGrid(room.grid, rows, cols);
}

// ── Grid render ───────────────────────────────────────────────
function renderGrid(grid, rows, cols) {
  elGridWrap.innerHTML = '';
  const hall = document.createElement('div');
  hall.className = 'hall-grid';
  hall.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  grid.forEach((student, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    const cell = document.createElement('div');
    cell.className = 'seat ' + (student ? 'assigned' : 'empty');

    const lbl = document.createElement('span');
    lbl.className = 's-lbl';
    lbl.textContent = `${r+1}-${c+1}`;
    cell.appendChild(lbl);

    if (student) {
      const color = courseColor(student.course);
      cell.style.background  = color + '28';
      cell.style.borderColor = color + '80';
      cell.style.boxShadow   = `0 0 6px ${color}30`;

      const info = document.createElement('div');
      info.className = 's-info';
      info.innerHTML =
        `<span class="s-name">${trunc(student.name||'',12)}</span>` +
        `<span class="s-roll">${student.rollNo||'—'}</span>` +
        `<span class="s-course" style="color:${color}">${student.course||'—'}</span>`;
      cell.appendChild(info);

      cell.title =
        `Name: ${student.name}\nRoll: ${student.rollNo}\nCourse: ${student.course}\n` +
        `Section: ${student.section}\nBatch: ${student.batch}\nDept: ${student.department||'—'}`;
    }
    hall.appendChild(cell);
  });

  elGridWrap.appendChild(hall);
}

// ── Legend ────────────────────────────────────────────────────
function buildLegend() {
  elLegend.innerHTML = '';
  for (const [course, color] of Object.entries(courseMap)) {
    const d = document.createElement('div');
    d.className = 'legend-item';
    d.innerHTML = `<span class="ldot" style="background:${color}"></span><span>${course||'Unknown'}</span>`;
    elLegend.appendChild(d);
  }
}

// ── Table preview ─────────────────────────────────────────────
function renderTable(students) {
  const el = $('student-preview');
  const show = students.slice(0, 100);
  el.innerHTML = `<table>
    <thead><tr><th>#</th><th>Name</th><th>Roll No</th><th>Course</th><th>Section</th><th>Batch</th><th>Dept</th></tr></thead>
    <tbody>
      ${show.map((s,i) => `<tr><td>${i+1}</td><td>${s.name}</td><td>${s.rollNo||'—'}</td><td>${s.course||'—'}</td><td>${s.section||'—'}</td><td>${s.batch||'—'}</td><td>${s.department||'—'}</td></tr>`).join('')}
      ${students.length>100?`<tr><td colspan="7" class="more-row">… and ${students.length-100} more</td></tr>`:''}
    </tbody></table>`;
}

// ── Reset ─────────────────────────────────────────────────────
elReset.addEventListener('click', () => {
  roomsData = []; courseMap = {}; colorIdx = 0;
  elGridWrap.innerHTML = '<div class="empty-state">Upload students → configure → click Generate Seating</div>';
  elLegend.innerHTML   = '';
  elStatCards.innerHTML= '';
  elLog.innerHTML      = '';
  elRoomTabs.innerHTML = '';
  elTabsCard.style.display = 'none';
  elRoomBar.innerHTML  = '';
  elProgFill.style.width = '0%';
  elReset.disabled     = true;
  elGenerate.disabled  = !students.length;
  setStatus('Ready', 'idle');
  logMsg('Reset.', 'info');
});

// ── Utils ─────────────────────────────────────────────────────
function trunc(s, n) { return s.length > n ? s.slice(0,n-1)+'…' : s; }

// ── Init ──────────────────────────────────────────────────────
logMsg('System ready. Upload Excel → configure → Generate.', 'info');
setStatus('Upload Excel to begin', 'idle');
elReset.disabled    = true;
elGenerate.disabled = true;
