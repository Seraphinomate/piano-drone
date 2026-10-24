// ═══════════════════════════════════════════════════════════
//  Mode Pads
//  Palette d'accords par suite, jouée de trois façons :
//   - Libre  : chaque pad touché enchaîne avec le précédent ; le « fil » garde les 16 derniers
//   - Duo    : ancre A fixe, chaque pad touché devient B ; boucle A → B
//   - Chaîne : progression construite en touchant les pads ; boucle ; remplacement à une position
//  Données dans la suite : prog.pads [{id, notes, label?}], prog.chain [padId], prog.padBeats
// ═══════════════════════════════════════════════════════════
const FIL_MAX = 16, CHAIN_MAX = 16, PADS_MAX = 48;

let view = lsGet('pianoView', 'suite');        // 'suite' | 'pads'
let padMode = lsGet('pianoPadMode', 'libre');  // 'libre' | 'duo' | 'chaine'
let padEdit = false;      // grille en mode édition
let selPadId = null;      // pad sélectionné en édition
let fil = [];             // ids des derniers pads joués (Libre), non enregistré
let filStart = 0;         // début de l'extrait du fil envoyé en chaîne
let duoA = null, duoB = null, duoPickA = false;
let chainSel = -1;        // position sélectionnée dans la chaîne
let padSoundingId = null; // pad qui sonne
let padLoopIdx = -1;      // position qui sonne (duo : 0/1, chaîne : index)

const padById = id => (prog.pads || []).find(p => p.id === id);
const padLabel = p => p.label || chordLabel(p.notes);
const notesKey = notes => sortIds(notes).join(',');

// ── Vue Suite | Pads ──
function setView(v) {
  if (v === view) return;
  stopAll();
  view = v; lsSet('pianoView', v);
  applyView();
}
function applyView() {
  const pads = view === 'pads';
  $('btnViewSuite').classList.toggle('on', !pads);
  $('btnViewPads').classList.toggle('on', pads);
  $('padsBlock').hidden = !pads;
  $('hint').hidden = pads;
  // Grand écran : en vue Pads, la suite passe dans la colonne de droite pour rester visible
  const wide = matchMedia('(min-width: 900px)').matches;
  const seq = $('seqBlock');
  if (pads && wide) { $('colRight').prepend(seq); seq.hidden = false; }
  else {
    $('padsBlock').before(seq);
    seq.hidden = pads;
  }
  renderPads();
}
matchMedia('(min-width: 900px)').addEventListener('change', applyView);

function setPadMode(m) {
  if (m === padMode) return;
  stopAll();
  padMode = m; lsSet('pianoPadMode', m);
  chainSel = -1; duoPickA = false;
  renderPads();
}
function togglePadEdit() {
  padEdit = !padEdit;
  selPadId = null;
  if (padEdit) stopAll();
  renderPads();
}

// ── Rendu ──
const HELP = {
  empty:   'Pose un accord au clavier, puis touche + pour en faire un pad',
  edit:    'Touche un pad pour le renommer, le remplacer, le déplacer ou le supprimer',
  libre:   'Touche les pads : chacun enchaîne avec le précédent · ■ pour arrêter',
  duoA:    'Touche un pad : il devient l\'ancre A',
  duo:     'Touche d\'autres pads pour entendre A → B en boucle · touche A pour changer d\'ancre',
  pickA:   'Touche le pad qui devient la nouvelle ancre A',
  chaine:  'Touche les pads pour construire la progression · elle boucle dès 2 accords',
  chainSel:'Touche un pad pour remplacer l\'accord sélectionné · re-touche-le pour désélectionner',
};
function renderPads() {
  if (!prog || view !== 'pads') return;
  const pads = prog.pads;
  $('padsBlock').classList.toggle('editing', padEdit);
  $('btnPadEdit').classList.toggle('on', padEdit);
  [...$('padModeSeg').children].forEach(b => b.classList.toggle('on', b.dataset.m === padMode));

  // aide contextuelle
  let help;
  if (!pads.length) help = HELP.empty;
  else if (padEdit) help = HELP.edit;
  else if (padMode === 'libre') help = HELP.libre;
  else if (padMode === 'duo') help = duoPickA ? HELP.pickA : (duoA ? HELP.duo : HELP.duoA);
  else help = chainSel >= 0 ? HELP.chainSel : HELP.chaine;
  $('padHelp').textContent = help;

  // scène
  $('stageLibre').hidden = padMode !== 'libre';
  $('stageDuo').hidden = padMode !== 'duo';
  $('stageChain').hidden = padMode !== 'chaine';
  if (padMode === 'libre') renderFil();
  if (padMode === 'duo') renderDuo();
  if (padMode === 'chaine') renderChain();

  // grille
  const grid = $('padGrid');
  const chordOnKeyboard = selected.size > 0;
  grid.innerHTML = pads.map(p => {
    const cls = ['pad'];
    if (!padEdit && p.id === padSoundingId && playState !== 'idle') cls.push('playing');
    if (padMode === 'duo' && p.id === duoA && !padEdit) cls.push('anchor');
    if (padEdit && p.id === selPadId) cls.push('sel');
    const tag = padMode === 'duo' && p.id === duoA && !padEdit ? '<span class="pad-tag">A</span>' : '';
    return `<button class="${cls.join(' ')}" onclick="onPadTap('${p.id}')">${tag}
      <span class="pad-name">${esc(padLabel(p))}</span>
      <span class="pad-notes">${p.notes.join(' ')}</span></button>`;
  }).join('') + (pads.length < PADS_MAX
    ? `<button class="pad add" onclick="addPad()" ${chordOnKeyboard ? '' : 'disabled'}><span class="plus">+</span>Pad</button>`
    : '');

  // barre d'édition
  const editing = padEdit && !!padById(selPadId);
  $('padEditBar').classList.toggle('show', editing);
  $('btnPadReplace').disabled = !chordOnKeyboard;

  // transport
  $('padTransport').hidden = padEdit;
  // ▶ / ■ : lance ce qui est prêt dans le mode (chaîne, duo, dernier pad joué) ou arrête
  const playing = ['pad', 'duo', 'chain'].includes(playState);
  const btn = $('btnPadStop');
  btn.textContent = playing ? '■' : '▶';
  btn.className = 'btn ' + (playing ? 'stop' : 'primary');
  btn.disabled = !playing && (!samplerReady || !padPlayable());
  $('padBpmInput').value = prog.bpm;
  document.querySelector('#padTransport .bpm').hidden = padMode === 'libre';
  const sel = $('padBeats');
  if (!sel.options.length) BEAT_CHOICES.forEach(b => sel.add(new Option(b + (b > 1 ? ' temps' : ' temps'), b)));
  sel.value = prog.padBeats;
  sel.hidden = padMode === 'libre';
  const canSend = (padMode === 'duo' && duoA && duoB) || (padMode === 'chaine' && prog.chain.length > 0);
  $('btnPadToSuite').hidden = padMode === 'libre';
  $('btnPadToSuite').disabled = !canSend;
}

function renderFil() {
  const box = $('filChips');
  if (filStart >= fil.length) filStart = 0;
  box.innerHTML = fil.length
    ? fil.map((id, i) => {
        const p = padById(id); if (!p) return '';
        const cls = ['chip'];
        if (i < filStart) cls.push('dim');
        if (i === filStart && fil.length > 1) cls.push('start');
        return `<button class="${cls.join(' ')}" onclick="setFilStart(${i})">${esc(padLabel(p))}</button>`;
      }).join('')
    : '<span class="chips-empty">Les pads joués s\'afficheront ici</span>';
  box.scrollLeft = box.scrollWidth;
  $('btnFilToChain').disabled = fil.length - filStart < 1;
  $('btnFilToChain').textContent = fil.length > 1 ? `→ Chaîne (${fil.length - filStart})` : '→ Chaîne';
  $('btnFilClear').disabled = !fil.length;
}
function renderDuo() {
  const a = padById(duoA), b = padById(duoB);
  const live = playState === 'duo';
  const slot = (el, p, tag, emptyTxt) => {
    el.className = 'duo-slot' + (p ? ' filled' : '') + (el.id === 'duoB' ? ' b' : '');
    el.innerHTML = p ? `<small>${tag}</small>${esc(padLabel(p))}` : `<small>${tag}</small>${emptyTxt}`;
  };
  slot($('duoA'), a, 'A', '—');
  slot($('duoB'), b, 'B', '—');
  $('duoA').classList.toggle('picking', duoPickA);
  $('duoA').classList.toggle('playing', live && padLoopIdx === 0);
  $('duoB').classList.toggle('playing', live && padLoopIdx === 1);
}
function renderChain() {
  if (chainSort.isActive()) return;
  const box = $('chainChips');
  const live = playState === 'chain';
  box.innerHTML = prog.chain.length
    ? prog.chain.map((id, i) => {
        const p = padById(id); if (!p) return '';
        const cls = ['chip'];
        if (i === chainSel) cls.push('sel');
        if (live && i === padLoopIdx) cls.push('playing');
        return `<button class="${cls.join(' ')}" onclick="onChainTap(${i})">${esc(padLabel(p))}</button>`;
      }).join('')
    : '<span class="chips-empty">Touche des pads pour construire la chaîne</span>';
  const focus = chainSel >= 0 ? chainSel : (live ? padLoopIdx : -1);
  const el = box.children[focus];
  if (el && el.classList.contains('chip')) {
    const l = el.offsetLeft - box.offsetLeft, r = l + el.offsetWidth;
    if (l < box.scrollLeft || r > box.scrollLeft + box.clientWidth) box.scrollLeft = l - box.clientWidth / 2 + el.offsetWidth / 2;
  }
  $('btnChainRemove').hidden = chainSel < 0;
  $('btnChainClear').disabled = !prog.chain.length;
}

// ── Gestion de la palette ──
function addPad() {
  const notes = getSortedNotes();
  if (!notes.length) return;
  if (prog.pads.length >= PADS_MAX) return toast('Palette pleine (48 pads)');
  const dup = prog.pads.find(p => notesKey(p.notes) === notesKey(notes));
  if (dup) return toast(`Ce voicing est déjà le pad « ${padLabel(dup)} »`);
  prog.pads.push({ id: uid(), notes });
  touch(false); renderPads();
}
function selPad() { return padById(selPadId); }
function renamePad() {
  const p = selPad(); if (!p) return;
  const auto = chordLabel(p.notes);
  const v = prompt('Nom du pad (vide = nom automatique)', p.label || auto);
  if (v === null) return;
  const t = v.trim().slice(0, 40);
  if (!t || t === auto) delete p.label; else p.label = t;
  touch(false); renderPads();
}
function replacePad() {
  const p = selPad(); const notes = getSortedNotes();
  if (!p || !notes.length) return;
  p.notes = notes;
  touch(false); renderPads();
  toast('Pad remplacé par l\'accord du clavier');
}
function movePad(d) {
  const i = prog.pads.findIndex(p => p.id === selPadId), j = i + d;
  if (i < 0 || j < 0 || j >= prog.pads.length) return;
  [prog.pads[i], prog.pads[j]] = [prog.pads[j], prog.pads[i]];
  touch(false); renderPads();
}
function deletePad() {
  const p = selPad(); if (!p) return;
  if (!confirm(`Supprimer le pad « ${padLabel(p)} » ?`)) return;
  prog.pads = prog.pads.filter(x => x.id !== p.id);
  prog.chain = prog.chain.filter(id => id !== p.id);
  fil = fil.filter(id => id !== p.id);
  if (duoA === p.id) duoA = null;
  if (duoB === p.id) duoB = null;
  selPadId = null;
  touch(false); renderPads();
}
function loadSuiteAsPads() {
  closePadMenu();
  let n = 0;
  prog.chords.forEach(c => {
    if (prog.pads.length >= PADS_MAX) return;
    if (prog.pads.some(p => notesKey(p.notes) === notesKey(c.notes))) return;
    const p = { id: uid(), notes: c.notes.slice() };
    if (c.label) p.label = c.label;
    prog.pads.push(p); n++;
  });
  touch(false); renderPads();
  toast(n ? `${n} pad${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} depuis la suite` : 'Aucun nouvel accord à ajouter');
}
function importPadsFrom(id) {
  closePadMenu();
  const src = lib.items[id]; if (!src || !src.pads) return;
  let n = 0;
  src.pads.forEach(sp => {
    if (prog.pads.length >= PADS_MAX) return;
    if (prog.pads.some(p => notesKey(p.notes) === notesKey(sp.notes))) return;
    const p = { id: uid(), notes: sp.notes.slice() };
    if (sp.label) p.label = sp.label;
    prog.pads.push(p); n++;
  });
  touch(false); renderPads();
  toast(n ? `${n} pad${n > 1 ? 's' : ''} importé${n > 1 ? 's' : ''} de « ${src.name} »` : 'Aucun nouveau pad à importer');
}

// ── Menu ⋯ ──
function togglePadMenu(e) {
  e.stopPropagation();
  const m = $('padMenu');
  if (!m.hidden) return closePadMenu();
  const others = liveProgs().filter(p => p.id !== prog.id && p.pads && p.pads.length);
  m.innerHTML = `
    <button onclick="loadSuiteAsPads()">Charger les accords de la suite en pads</button>
    <div class="menu-title">Importer les pads de…</div>
    ${others.length
      ? others.map(p => `<button onclick="importPadsFrom('${p.id}')">${esc(p.name)} · ${p.pads.length} pads</button>`).join('')
      : '<div class="menu-empty">Aucune autre suite n\'a de pads</div>'}`;
  m.hidden = false;
}
function closePadMenu() { $('padMenu').hidden = true; }
document.addEventListener('click', e => { if (!e.target.closest('.menu-wrap')) closePadMenu(); });

// ── Jouer ──
async function onPadTap(id) {
  if (padEdit) { selPadId = selPadId === id ? null : id; renderPads(); return; }
  const p = padById(id); if (!p) return;
  if (!samplerReady || !(await audioStart())) { setSelectedNotes(p.notes); revealNotes(p.notes); return; }
  if (padMode === 'libre') return playLibre(p);
  if (padMode === 'duo') return playDuo(p);
  return playChain(p);
}

function soundPad(p, time) {
  holdChord(p.notes, time);
  padSoundingId = p.id;
  const ui = () => { setSelectedNotes(p.notes); revealNotes(p.notes); renderPads(); };
  if (time !== undefined) Tone.Draw.schedule(ui, time); else ui();
}

// Libre
function playLibre(p) {
  if (playState !== 'pad') stopAll();
  playState = 'pad';
  soundPad(p);
  if (fil[fil.length - 1] !== p.id) {
    fil.push(p.id);
    if (fil.length > FIL_MAX) { fil.shift(); filStart = Math.max(0, filStart - 1); }
  }
  renderPads(); renderTransport();
}
function setFilStart(i) { filStart = i; renderPads(); }
function clearFil() { fil = []; filStart = 0; renderPads(); }
function filToChain() {
  const ids = fil.slice(filStart).filter(id => padById(id)).slice(-CHAIN_MAX);
  if (!ids.length) return;
  stopAll();
  prog.chain = ids;
  chainSel = -1;
  touch(false);
  padMode = 'chaine'; lsSet('pianoPadMode', padMode);
  renderPads();
  if (prog.chain.length >= 2) startPadLoop('chain', 0);
}

// Duo
function pickNewAnchor() {
  if (padEdit || !prog.pads.length) return;
  duoPickA = !duoPickA;
  renderPads();
}
function playDuo(p) {
  if (!duoA || duoPickA) {
    duoA = p.id; duoPickA = false;
    if (duoB === duoA) duoB = null;
    if (duoB) { startPadLoop('duo', 0); return; }
    stopAll();
    playState = 'pad';               // l'ancre seule sonne, tenue
    soundPad(p);
    renderPads(); renderTransport();
    return;
  }
  if (p.id === duoA) {
    if (padById(duoB)) { startPadLoop('duo', 0); return; }
    stopAll(); playState = 'pad'; soundPad(p); renderPads(); renderTransport();
    return;
  }
  duoB = p.id;
  startPadLoop('duo', 0);            // on réentend tout de suite A → B
}

// Chaîne
function playChain(p) {
  if (chainSel >= 0 && chainSel < prog.chain.length) {
    prog.chain[chainSel] = p.id;     // remplacement à la position sélectionnée
    touch(false);
    if (playState === 'chain' && padLoopIdx === chainSel) soundPad(p);
    else if (playState !== 'chain') { stopAll(); playState = 'pad'; soundPad(p); }
    renderPads();
    return;
  }
  if (prog.chain.length >= CHAIN_MAX) return toast('Chaîne pleine (16 accords)');
  prog.chain.push(p.id);
  touch(false);
  if (playState === 'chain') { renderPads(); return; }   // entre dans la boucle au prochain tour
  if (prog.chain.length >= 2) { startPadLoop('chain', prog.chain.length - 2); return; }
  stopAll(); playState = 'pad'; soundPad(p); renderPads(); renderTransport();
}
function onChainTap(i) {
  chainSel = chainSel === i ? -1 : i;
  renderPads();
}
function removeChainPos() {
  if (chainSel < 0) return;
  prog.chain.splice(chainSel, 1);
  if (playState === 'chain' && padLoopIdx > chainSel) padLoopIdx--;
  chainSel = -1;
  if (playState === 'chain' && prog.chain.length < 2) stopAll();
  touch(false); renderPads();
}
function clearChain() {
  if (!prog.chain.length) return;
  stopAll();
  prog.chain = []; chainSel = -1;
  touch(false); renderPads();
}
const chainSort = makeSortable($('chainChips'), '.chip', (from, to) => {
  if (from !== to) {
    const [id] = prog.chain.splice(from, 1);
    prog.chain.splice(to, 0, id);
    padLoopIdx = remapIndex(padLoopIdx, from, to);
    chainSel = remapIndex(chainSel, from, to);
    touch(false);
  }
  renderPads();
});

// ── Bouton ▶ / ■ ──
function padPlayable() {
  if (padMode === 'chaine') return prog.chain.some(id => padById(id));
  if (padMode === 'duo') return !!padById(duoA);
  return fil.some(id => padById(id));
}
async function togglePadPlay() {
  if (['pad', 'duo', 'chain'].includes(playState)) { stopAll(); return; }
  if (!samplerReady || !(await audioStart())) return;
  if (padMode === 'chaine') {
    const steps = padLoopSteps('chain');
    if (steps.length >= 2) return startPadLoop('chain', chainSel >= 0 && chainSel < steps.length ? chainSel : 0);
    if (steps.length === 1) { stopAll(); playState = 'pad'; soundPad(steps[0]); renderPads(); renderTransport(); }
    return;
  }
  if (padMode === 'duo') {
    if (padById(duoA) && padById(duoB)) return startPadLoop('duo', 0);
    const a = padById(duoA);
    if (a) { stopAll(); playState = 'pad'; soundPad(a); renderPads(); renderTransport(); }
    return;
  }
  const last = [...fil].reverse().map(padById).find(Boolean);   // Libre : rejoue le dernier pad
  if (last) { stopAll(); playState = 'pad'; soundPad(last); renderPads(); renderTransport(); }
}

// ── Boucle au tempo (Duo et Chaîne) ──
function padLoopSteps(kind) {
  if (kind === 'duo') return [padById(duoA), padById(duoB)].filter(Boolean);
  return prog.chain.map(padById).filter(Boolean);
}
function startPadLoop(kind, from) {
  const T = Tone.Transport;
  T.stop(); T.cancel(); T.position = 0;
  T.bpm.value = prog.bpm;
  releaseHeld();
  playState = kind;
  padLoopIdx = -1;
  schedulePadStep(kind, from, 0);
  T.start('+0.05');
  renderPads(); renderTransport(); updateUI();
}
function schedulePadStep(kind, i, ticks) {
  Tone.Transport.scheduleOnce(time => {
    if (playState !== kind) return;
    const steps = padLoopSteps(kind);
    if (steps.length < 2) {           // plus assez d'accords pour boucler
      Tone.Draw.schedule(stopAll, time);
      return;
    }
    i = i % steps.length;
    padLoopIdx = i;
    soundPad(steps[i], time);
    schedulePadStep(kind, i + 1, ticks + prog.padBeats * Tone.Transport.PPQ);
  }, ticks + 'i');
}
function setPadBeats(v) {
  prog.padBeats = +v;
  touch(false); renderPads();
}

// ── Envoyer dans la suite ──
function padsToSuite() {
  const steps = padMode === 'duo' ? padLoopSteps('duo') : padLoopSteps('chain');
  if (!steps.length) return;
  const chords = steps.map(p => {
    const c = { id: uid(), notes: p.notes.slice(), beats: prog.padBeats };
    if (p.label) c.label = p.label;
    return c;
  });
  const at = selIdx >= 0 && selIdx < prog.chords.length ? selIdx + 1 : prog.chords.length;
  prog.chords.splice(at, 0, ...chords);
  selIdx = at + chords.length - 1;
  touch(); renderTransport();
  toast(`${chords.length} accord${chords.length > 1 ? 's' : ''} ajouté${chords.length > 1 ? 's' : ''} à « ${prog.name} »`);
}

// ── Message éphémère ──
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// Remise à zéro quand on change de suite
function resetPadsState() {
  fil = []; filStart = 0; duoA = duoB = null; duoPickA = false;
  chainSel = -1; selPadId = null; padSoundingId = null; padLoopIdx = -1;
}

// Le bouton « + Pad » et « Remplacer » dépendent de ce qui est posé au clavier
function refreshPadKeyboardState() {
  if (view !== 'pads') return;
  const has = selected.size > 0;
  const add = document.querySelector('#padGrid .pad.add');
  if (add) add.disabled = !has;
  $('btnPadReplace').disabled = !has;
}
