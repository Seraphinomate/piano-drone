// ═══════════════════════════════════════════════════════════
//  Suite d'accords : édition
// ═══════════════════════════════════════════════════════════
const BEAT_CHOICES = [1, 2, 3, 4, 6, 8];
let selIdx = -1;     // case sélectionnée
let playIdx = -1;    // case qui sonne

BEAT_CHOICES.forEach(b => {
  const el = document.createElement('button');
  el.className = 'btn small beat-btn'; el.textContent = b; el.dataset.b = b;
  el.onclick = () => setBeats(b);
  $('beats').appendChild(el);
});

function renderStrip() {
  // Pas de reconstruction pendant un glisser (la lecture auto continue)
  if (suiteSort.isActive()) { stripDirty = true; return; }
  stripDirty = false;
  const strip = $('strip');
  const live = playState === 'manual' || playState === 'auto';
  strip.innerHTML = prog.chords.length
    ? prog.chords.map((c, i) =>
        `<button class="cell ${i === selIdx ? 'sel' : ''} ${live && i === playIdx ? 'playing' : ''}" onclick="onCellTap(${i})">
           <span class="cell-name">${esc(c.label || chordLabel(c.notes))}</span>
           <span class="cell-beats">${c.beats} T</span>
         </button>`).join('')
    : '<div class="strip-empty">Pose un accord au clavier, puis « + Ajouter »</div>';
  const focus = live && playIdx >= 0 ? playIdx : selIdx;
  const el = strip.children[focus];
  if (el && el.classList.contains('cell')) {
    const l = el.offsetLeft - strip.offsetLeft, r = l + el.offsetWidth;
    if (l < strip.scrollLeft || r > strip.scrollLeft + strip.clientWidth)
      strip.scrollTo({ left: l - strip.clientWidth / 2 + el.offsetWidth / 2, behavior: 'smooth' });
  }
  $('cellActions').classList.toggle('show', selIdx >= 0 && selIdx < prog.chords.length);
  const cur = prog.chords[selIdx];
  [...$('beats').querySelectorAll('.beat-btn')].forEach(b => b.classList.toggle('on', !!cur && +b.dataset.b === cur.beats));
  $('seqName').innerHTML = `${esc(prog.name)} <small>✎</small>`;
}
function renderTransport() {
  const auto = playState === 'auto';
  const b = $('btnSeqPlay');
  b.textContent = auto ? '■ Stop' : '▶ Lire';
  b.className = 'btn ' + (auto ? 'stop' : 'primary');
  b.disabled = !auto && (!samplerReady || !prog || !prog.chords.length);
  $('btnNext').disabled = !samplerReady || !prog || !prog.chords.length;
  $('bpmInput').value = prog ? prog.bpm : 80;
  $('btnLoop').classList.toggle('on', !!(prog && prog.loop));
}
function renderAllSeq() { renderStrip(); renderTransport(); renderLib(); if (typeof renderPads === 'function') renderPads(); }

function addChord() {
  const notes = getSortedNotes();
  if (!notes.length) return;
  const last = prog.chords[prog.chords.length - 1];
  prog.chords.push({ id: uid(), notes, beats: last ? last.beats : 4 });
  selIdx = prog.chords.length - 1;
  touch(); renderTransport();
}
function replaceCell() {
  const notes = getSortedNotes();
  if (selIdx < 0 || !notes.length) return;
  prog.chords[selIdx].notes = notes;
  touch();
}
function duplicateCell() {
  if (selIdx < 0) return;
  const c = prog.chords[selIdx];
  const copy = { id: uid(), notes: c.notes.slice(), beats: c.beats };
  if (c.label) copy.label = c.label;
  prog.chords.splice(selIdx + 1, 0, copy);
  if (playIdx > selIdx) playIdx++;
  selIdx++;
  touch();
}
function deleteCell() {
  if (selIdx < 0) return;
  if (playIdx === selIdx && playState === 'manual') stopAll();
  prog.chords.splice(selIdx, 1);
  if (playIdx > selIdx) playIdx--;
  else if (playIdx === selIdx) playIdx = -1;
  selIdx = Math.min(selIdx, prog.chords.length - 1);
  if (!prog.chords.length && playState === 'auto') stopAll();
  touch(); renderTransport();
}
function renameCell() {
  if (selIdx < 0) return;
  const c = prog.chords[selIdx];
  const auto = chordLabel(c.notes);
  const v = prompt('Nom de la case (vide = nom automatique)', c.label || auto);
  if (v === null) return;
  const t = v.trim().slice(0, 40);
  if (!t || t === auto) delete c.label; else c.label = t;
  touch();
}

// ── Réordonner les cases : appui long puis glisser (voir sortable.js) ──
let stripDirty = false;
const suiteSort = makeSortable($('strip'), '.cell', (from, to) => {
  if (from !== to) {
    const [c] = prog.chords.splice(from, 1);
    prog.chords.splice(to, 0, c);
    playIdx = remapIndex(playIdx, from, to);
  }
  selIdx = to;
  touch();
  renderTransport();
});
function setBeats(b) {
  if (selIdx < 0) return;
  prog.chords[selIdx].beats = b;
  touch();
}
function setBpm(v) {
  let n = Math.round(+v);
  if (!isFinite(n)) n = prog.bpm;
  prog.bpm = Math.max(40, Math.min(200, n));
  if (Tone) Tone.Transport.bpm.value = prog.bpm;
  $('bpmInput').value = prog.bpm;
  touch(false);
  renderPads();
}
function nudgeBpm(d) { setBpm(prog.bpm + d); }
function toggleLoop() { prog.loop = !prog.loop; renderTransport(); touch(false); }

// ═══════════════════════════════════════════════════════════
//  Suite d'accords : lecture
// ═══════════════════════════════════════════════════════════
function showChord(i) {
  const c = prog.chords[i];
  if (!c) return;
  setSelectedNotes(c.notes);
  revealNotes(c.notes);
}
// Fait sonner la case i (tenue jusqu'au prochain accord)
function playCell(i, time) {
  const c = prog.chords[i];
  if (!c) return;
  holdChord(c.notes, time);
  playIdx = i;
  const ui = () => { showChord(i); renderStrip(); };
  if (time !== undefined) Tone.Draw.schedule(ui, time); else ui();
}

async function onCellTap(i) {
  // Re-toucher la case qui sonne (hors lecture auto) → coupe
  if (playState === 'manual' && playIdx === i && selIdx === i) { stopAll(); return; }
  selIdx = i;
  if (!samplerReady || !(await audioStart())) { showChord(i); renderStrip(); return; }
  if (playState === 'auto') { jumpTo(i); return; }
  if (playState !== 'manual' && playState !== 'idle') stopAll();
  playState = 'manual';
  playCell(i);
  renderTransport(); updateUI();
}
async function nextChord() {
  if (!prog.chords.length || !samplerReady) return;
  await audioStart();
  const from = playIdx >= 0 && playState !== 'idle' ? playIdx : selIdx;
  const i = (from + 1) % prog.chords.length;
  selIdx = i;
  if (playState === 'auto') { jumpTo(i); return; }
  if (playState !== 'manual' && playState !== 'idle') stopAll();
  playState = 'manual';
  playCell(i);
  renderTransport(); updateUI();
}

async function toggleSeq() {
  if (playState === 'auto') { stopAll(); return; }
  if (!prog.chords.length || !samplerReady) return;
  await audioStart();
  const start = (playState === 'manual' && playIdx >= 0) ? playIdx : (selIdx >= 0 ? selIdx : 0);
  startSeq(start);
}
function startSeq(from) {
  const T = Tone.Transport;
  T.stop(); T.cancel(); T.position = 0;
  T.bpm.value = prog.bpm;
  releaseHeld();
  playState = 'auto';
  scheduleCell(from, 0);
  T.start('+0.05');
  renderTransport(); updateUI();
}
// Programme la case i au tick donné ; chaque case programme la suivante,
// donc un changement de tempo ou d'ordre est pris en compte au vol.
function scheduleCell(i, ticks) {
  Tone.Transport.scheduleOnce(time => {
    if (playState !== 'auto') return;
    const n = prog.chords.length;
    if (!n) { Tone.Draw.schedule(stopAll, time); return; }
    if (i >= n) {
      if (!prog.loop) { releaseHeld(time); Tone.Draw.schedule(stopAll, time); return; }
      i = 0;
    }
    playCell(i, time);
    scheduleCell(i + 1, ticks + prog.chords[i].beats * Tone.Transport.PPQ);
  }, ticks + 'i');
}
function jumpTo(i) {
  const T = Tone.Transport;
  T.cancel();
  playCell(i);
  scheduleCell(i + 1, T.ticks + prog.chords[i].beats * T.PPQ);
}
function stopAll() {
  if (Tone) { Tone.Transport.stop(); Tone.Transport.cancel(); }
  releaseHeld();
  playState = 'idle';
  playIdx = -1;
  if (typeof padSoundingId !== 'undefined') { padSoundingId = null; padLoopIdx = -1; }
  if (prog) { renderStrip(); renderTransport(); if (typeof renderPads === 'function') renderPads(); }
  updateUI();
}

