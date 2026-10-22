// ═══════════════════════════════════════════════════════════
//  Bibliothèque de suites (local + synchro Cloudflare)
// ═══════════════════════════════════════════════════════════
// Suite : { id, name, bpm, loop, drone:{pc,octave,fifth}, chords:[{id, notes:[...], beats}], updatedAt, deleted? }
const LIB_KEY = 'pianoLibrary';
let lib = lsGet(LIB_KEY, null) || { items: {}, currentId: null };
let prog = null;

// Complète les champs manquants (données venant d'une ancienne version ou du serveur)
function normalize(p) {
  if (!p || p.deleted) return p;
  if (!Array.isArray(p.chords)) p.chords = [];
  p.chords.forEach(c => {
    if (!c.id) c.id = uid();
    if (!BEAT_CHOICES.includes(c.beats)) c.beats = 4;
    c.notes = sortIds(c.notes || []);
    if (typeof c.label !== 'string' || !c.label.trim()) delete c.label;
  });
  if (!(p.bpm >= 40 && p.bpm <= 200)) p.bpm = 80;
  if (typeof p.loop !== 'boolean') p.loop = true;
  if (!p.name) p.name = 'Sans titre';
  if (!Array.isArray(p.pads)) p.pads = [];
  p.pads = p.pads.filter(x => x && x.id && Array.isArray(x.notes) && x.notes.length);
  p.pads.forEach(x => { x.notes = sortIds(x.notes); if (typeof x.label !== 'string' || !x.label.trim()) delete x.label; });
  if (!Array.isArray(p.chain)) p.chain = [];
  p.chain = p.chain.filter(id => p.pads.some(x => x.id === id));
  if (!BEAT_CHOICES.includes(p.padBeats)) p.padBeats = 4;
  return p;
}
const liveProgs = () => Object.values(lib.items).filter(p => !p.deleted).map(normalize).sort((a, b) => b.updatedAt - a.updatedAt);
function newProgObj(name) {
  return { id: uid(), name, bpm: 80, loop: true, drone: { pc: drone.pc, octave: drone.octave, fifth: drone.fifth }, chords: [], pads: [], chain: [], padBeats: 4, updatedAt: Date.now() };
}
function saveLocal() { lsSet(LIB_KEY, lib); }
// À appeler après chaque modification de la suite ouverte
function touch(rerender = true) {
  if (!prog) return;
  delete prog.pristine;
  prog.updatedAt = Date.now();
  saveLocal();
  scheduleSync();
  if (rerender) { renderStrip(); }
  renderLib();
}
function ensureProg() {
  prog = normalize(lib.items[lib.currentId]);
  if (!prog || prog.deleted) {
    const list = liveProgs();
    prog = list[0] || null;
    if (!prog) {
      // Suite vide créée automatiquement : « pristine » tant qu'on n'y touche pas.
      // Elle n'est pas envoyée au serveur et disparaît si le serveur a déjà des suites.
      prog = newProgObj('Ma première suite');
      prog.pristine = true;
      lib.items[prog.id] = prog;
    }
    lib.currentId = prog.id;
    saveLocal();
  }
}
function openProg(id) {
  const p = normalize(lib.items[id]);
  if (!p || p.deleted) return;
  stopAll();
  prog = p; lib.currentId = id; saveLocal();
  selIdx = -1; playIdx = -1;
  if (typeof resetPadsState === 'function') resetPadsState();
  if (prog.drone) {
    Object.assign(drone, prog.drone);
    lsSet('pianoDrone', { pc: drone.pc, octave: drone.octave, fifth: drone.fifth, vol: drone.vol });
    updateDroneSound(); renderDrone();
  }
  if (Tone) Tone.Transport.bpm.value = prog.bpm;
  renderAllSeq();
}
function newProg() {
  const p = newProgObj('Suite ' + (liveProgs().length + 1));
  lib.items[p.id] = p;
  openProg(p.id);
  touch();
}
function renameProg() {
  const name = prompt('Nom de la suite', prog.name);
  if (name === null) return;
  prog.name = name.trim() || prog.name;
  touch();
}
function duplicateProg() {
  const p = JSON.parse(JSON.stringify(prog));
  p.id = uid(); p.name = prog.name + ' (copie)'; p.updatedAt = Date.now();
  p.chords.forEach(c => c.id = uid());
  lib.items[p.id] = p;
  openProg(p.id);
  touch();
}
function deleteProg() {
  if (!confirm(`Supprimer « ${prog.name} » ?`)) return;
  stopAll();
  // On garde une trace « supprimée » pour que la suppression se propage aux autres appareils
  lib.items[prog.id] = { id: prog.id, deleted: true, updatedAt: Date.now() };
  lib.currentId = null;
  ensureProg();
  openProg(prog.id);
  saveLocal(); scheduleSync(); renderLib();
}
function renderLib() {
  const list = liveProgs();
  $('libList').innerHTML = list.map(p =>
    `<button class="lib-item ${p.id === prog.id ? 'cur' : ''}" onclick="openProg('${p.id}')">
       <span class="lib-name">${esc(p.name)}</span>
       <span class="lib-meta">${p.chords.length} acc. · ${p.bpm} bpm</span>
     </button>`).join('');
  $('libSummary').textContent = prog ? prog.name : '';
}

// ── Synchro ──
// Le serveur garde, pour chaque suite, la version la plus récente (updatedAt).
let accessCode = lsGet('pianoCode', '');
let syncing = false, syncAgain = false, syncTimer = null;
const SYNC_TEXT = {
  local: ['Hors Cloudflare : suites gardées sur cet appareil', 'warn'],
  code:  ['Entre le code d\'accès pour synchroniser', 'warn'],
  bad:   ['Code d\'accès refusé', 'err'],
  busy:  ['☁ Synchronisation…', ''],
  ok:    ['☁ Synchronisé', 'ok'],
  off:   ['Hors ligne — synchro au retour du réseau', 'warn'],
  srv:   ['Erreur serveur — réessai plus tard', 'err'],
};
function setSync(state, detail) {
  const [txt, cls] = SYNC_TEXT[state];
  const el = $('syncState');
  el.textContent = detail ? `${txt} (${detail})` : txt;
  el.className = 'sync-state ' + cls;
  if (state === 'code' || state === 'bad') showCodeInput(true);
}
function showCodeInput(show) {
  $('codeRow').style.display = show ? '' : 'none';
  $('btnShowCode').style.display = show ? 'none' : '';
  if (show) $('panelLib').open = true;
}
function saveCode() {
  accessCode = $('codeInput').value.trim();
  lsSet('pianoCode', accessCode);
  $('codeInput').value = '';
  showCodeInput(false);
  sync();
}
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(sync, 1500);
}
async function sync() {
  if (location.protocol === 'file:') { setSync('local'); return; }
  if (!accessCode) { setSync('code'); return; }
  if (syncing) { syncAgain = true; return; }
  syncing = true;
  setSync('busy');
  try {
    const r = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-access-code': accessCode },
      body: JSON.stringify({ items: Object.values(lib.items).filter(p => !p.pristine) })
    });
    if (r.status === 401) { setSync('bad'); return; }
    if (r.status === 404 || r.status === 405) { setSync('local'); return; }
    if (!r.ok) { let m = ''; try { m = (await r.json()).error; } catch (e) {} setSync('srv', m); return; }
    const data = await r.json();
    let changedCurrent = false;
    (data.items || []).forEach(it => {
      const local = lib.items[it.id];
      if (!local || it.updatedAt > local.updatedAt) {
        lib.items[it.id] = it;
        if (it.id === lib.currentId) changedCurrent = true;
      }
    });
    // Nouvel appareil : on jette la suite vide auto-créée si le serveur en a déjà
    const pristine = Object.values(lib.items).filter(p => p.pristine);
    if (playState === 'idle' && pristine.length && Object.values(lib.items).some(p => !p.pristine && !p.deleted)) {
      pristine.forEach(p => delete lib.items[p.id]);
      if (pristine.some(p => p.id === lib.currentId) && playState === 'idle') {
        lib.currentId = null;
        changedCurrent = true;
      }
    }
    saveLocal();
    if (changedCurrent) {
      const wasPlaying = playState !== 'idle';
      ensureProg();
      if (!wasPlaying) { prog = lib.items[lib.currentId]; renderAllSeq(); }
      else { prog = lib.items[lib.currentId] || prog; }
    }
    renderLib();
    setSync('ok');
  } catch (e) {
    setSync('off');
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; scheduleSync(); }
  }
}
window.addEventListener('online', sync);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });

