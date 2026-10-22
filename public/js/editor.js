// ═══════════════════════════════════════════════════════════
//  État de l'éditeur d'accord (clavier)
// ═══════════════════════════════════════════════════════════
const selected = new Set();
let mode = 'edit';
let soloCut = false;
let degreeTimer = null;

const notesDisplay = $('notesDisplay'), chordName = $('chordName'), degreeDisplay = $('degreeDisplay');
const btnClear = $('btnClear'), btnPlay = $('btnPlay'), btnModeEdit = $('btnModeEdit'), btnModeListen = $('btnModeListen');
const statusEl = $('status'), progressWrap = $('progressWrap');

function getSortedNotes() { return sortIds(selected); }

function onKeyPress(id) {
  if (mode === 'edit') toggleNote(id);
  else soloNote(id);
}
function toggleNote(id) {
  if (selected.has(id)) { selected.delete(id); $('key_' + id)?.classList.remove('active'); }
  else { selected.add(id); $('key_' + id)?.classList.add('active'); }
  updateUI();
}
function setSelectedNotes(ids) {
  selected.forEach(id => $('key_' + id)?.classList.remove('active'));
  selected.clear();
  ids.forEach(id => { if (KEY_BY_ID[id]) { selected.add(id); $('key_' + id)?.classList.add('active'); } });
  updateUI();
}
function clearAll() {
  if (playState === 'chord') stopAll();
  setSelectedNotes([]);
}

const DEGREE_NAMES = [
  'fondamentale', 'seconde mineure (b9)', 'seconde majeure (9)', 'tierce mineure (#9)',
  'tierce majeure', 'quarte juste (11)', 'quinte diminuée (#11 / b5)', 'quinte juste',
  'quinte augmentée (#5 / b13)', 'sixte majeure (13)', 'septième mineure', 'septième majeure'
];
function degreeOf(id) {
  const notes = getSortedNotes();
  if (!notes.length) return '';
  const k = KEY_BY_ID[id]; if (!k) return '';
  const ref = drone.on ? drone.pc : KEY_BY_ID[notes[0]].noteIdx;   // bourdon actif → relatif au bourdon
  let label = DEGREE_NAMES[(k.noteIdx - ref + 12) % 12];
  if (drone.on) label += ` · / bourdon ${NOTE_NAMES[drone.pc]}`;
  if (notes.filter(n => KEY_BY_ID[n].note === k.note).length > 1) label += ' · doublée';
  return label;
}
function showDegree(id) {
  degreeDisplay.innerHTML = `<span class="degree-note">${id}</span><span class="degree-label">${degreeOf(id)}</span>`;
  degreeDisplay.classList.add('show');
  clearTimeout(degreeTimer);
  degreeTimer = setTimeout(() => degreeDisplay.classList.remove('show'), 3500);
}
async function soloNote(id) {
  if (!samplerReady || !selected.has(id)) return;
  await Tone.start();
  if (soloCut && playState !== 'idle') stopAll();
  try { sampler.triggerAttackRelease(id, 2.4); } catch (e) {}
  const el = $('key_' + id);
  if (el) { el.classList.add('solo'); setTimeout(() => el.classList.remove('solo'), 420); }
  showDegree(id);
}
function setMode(m) {
  if (m === 'listen' && selected.size === 0) return;
  mode = m;
  document.body.classList.toggle('listen-mode', m === 'listen');
  btnModeEdit.classList.toggle('on', m === 'edit');
  btnModeListen.classList.toggle('on', m === 'listen');
  degreeDisplay.classList.remove('show');
}
function toggleSoloCut() { soloCut = !soloCut; $('soloCutToggle').classList.toggle('on', soloCut); }

// Nom d'accord à partir des notes (la note la plus grave est prise comme fondamentale).
// Gabarits du plus riche au plus simple ; la quinte juste est facultative ;
// les notes restantes deviennent des extensions : Dm7(9), G7(b9,13)…
const CHORD_TEMPLATES = [
  ['m7b5', [3, 6, 10]], ['dim7', [3, 6, 9]], ['mMaj7', [3, 11]], ['maj7', [4, 11]],
  ['m7', [3, 10]], ['7', [4, 10]], ['7sus4', [5, 10]], ['m6', [3, 9]], ['6', [4, 9]],
  ['aug', [4, 8]], ['dim', [3, 6]], ['m', [3]], ['', [4]], ['sus4', [5]], ['sus2', [2]],
];
const EXT_NAMES = { 1: 'b9', 2: '9', 3: '#9', 5: '11', 6: '#11', 8: 'b13', 9: '13' };
// Nom pour une fondamentale donnée : [nom, nombre d'extensions] ou null
function nameForRoot(pcs, root) {
  const ivs = new Set(pcs.map(pc => (pc - root + 12) % 12));
  ivs.delete(0);
  if (!ivs.size) return null;
  const r = NOTE_NAMES[root];
  if (ivs.size === 1 && ivs.has(7)) return [r + '5', 0];
  for (const [q, req] of CHORD_TEMPLATES) {
    if (!req.every(i => ivs.has(i))) continue;
    const rest = [...ivs].filter(i => !req.includes(i) && i !== 7).sort((a, b) => a - b);
    const exts = rest.map(i => EXT_NAMES[i]).filter(Boolean);
    if (exts.length !== rest.length) continue;
    if (rest.includes(3) && !req.includes(4)) continue;
    return [r + q + (exts.length ? `(${exts.join(',')})` : ''), exts.length];
  }
  return null;
}
// Essaie chaque note comme fondamentale ; garde le nom le plus simple.
// À simplicité égale, la basse gagne. Renversement noté « C/E ».
function detectChord(ids) {
  if (ids.length < 2) return '';
  const bass = KEY_BY_ID[ids[0]].noteIdx;
  const pcs = [...new Set(ids.map(id => KEY_BY_ID[id].noteIdx))];
  let best = null;
  pcs.forEach(root => {
    const res = nameForRoot(pcs, root);
    if (!res) return;
    const score = res[1] + (root === bass ? 0 : 0.6);
    if (!best || score < best.score) best = { name: res[0] + (root === bass ? '' : '/' + NOTE_NAMES[bass]), score };
  });
  return best ? best.name : '';
}
// Nom affiché sur une case ou un pad : accord détecté, sinon les notes sans octave
function chordLabel(ids) {
  const sorted = sortIds(ids);
  return detectChord(sorted) || [...new Set(sorted.map(id => KEY_BY_ID[id].note))].join(' ');
}

function updateUI() {
  const notes = getSortedNotes();
  if (!notes.length) {
    notesDisplay.innerHTML = '<span class="notes-placeholder">Sélectionne des notes</span>';
    chordName.textContent = '';
    btnModeListen.disabled = true;
    if (mode === 'listen') setMode('edit');
  } else {
    notesDisplay.innerHTML = notes.map(n => `<span class="note-tag" onclick="soloNote('${n}')">${n}</span>`).join('');
    chordName.textContent = detectChord(notes);
    btnModeListen.disabled = false;
  }
  btnClear.disabled = !notes.length;
  btnPlay.disabled = playState === 'chord' ? false : (!samplerReady || !notes.length);
  btnPlay.textContent = playState === 'chord' ? '■ Stop' : '▶ Accord';
  btnPlay.className = 'btn small ' + (playState === 'chord' ? 'stop' : 'primary');
  $('btnAdd').disabled = !notes.length;
  $('btnReplace').disabled = !notes.length;
  refreshMiniNotes();
  if (typeof refreshPadKeyboardState === 'function') refreshPadKeyboardState();
}
function refreshMiniNotes() {
  let droneOn = false, dronePc = -1;
  try { droneOn = drone.on; dronePc = drone.pc; } catch (e) {}
  ALL_KEYS.forEach(k => {
    const m = $('mini_' + k.id); if (!m) return;
    m.classList.toggle('active', selected.has(k.id));
    m.classList.toggle('drone-pc', droneOn && k.noteIdx === dronePc);
  });
}

