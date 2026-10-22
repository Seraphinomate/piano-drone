// ═══════════════════════════════════════════════════════════
//  Clavier
// ═══════════════════════════════════════════════════════════
const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const BLACK_INDICES = new Set([1,3,6,8,10]);

function generateKeys(startOct, numOct) {
  const keys = [];
  for (let o = startOct; o < startOct + numOct; o++)
    for (let i = 0; i < 12; i++)
      keys.push({ note: NOTE_NAMES[i], octave: o, id: `${NOTE_NAMES[i]}${o}`, isBlack: BLACK_INDICES.has(i), noteIdx: i });
  keys.push({ note: "C", octave: startOct + numOct, id: `C${startOct + numOct}`, isBlack: false, noteIdx: 0 });
  return keys;
}
const ALL_KEYS = generateKeys(1, 7);            // C1 → C8
const KEY_BY_ID = {}; ALL_KEYS.forEach(k => KEY_BY_ID[k.id] = k);
const WHITE_KEYS = ALL_KEYS.filter(k => !k.isBlack);
const pitchOf = id => { const k = KEY_BY_ID[id]; return k ? k.octave * 12 + k.noteIdx : 0; };
const sortIds = ids => [...ids].filter(id => KEY_BY_ID[id]).sort((a, b) => pitchOf(a) - pitchOf(b));

const keyboard = $('keyboard');
const WHITE_W = 36, WHITE_H = 150, BLACK_W = 22;
const totalWidth = WHITE_KEYS.length * WHITE_W;
keyboard.style.width = totalWidth + 'px';
keyboard.style.height = WHITE_H + 'px';

function bindKey(el, id) {
  el.addEventListener('touchstart', e => { e.preventDefault(); onKeyPress(id); }, { passive: false });
  el.addEventListener('mousedown', e => { e.preventDefault(); onKeyPress(id); });
}
WHITE_KEYS.forEach((key, i) => {
  const el = document.createElement('div');
  el.className = 'white-key';
  el.id = 'key_' + key.id;
  el.style.left = (i * WHITE_W) + 'px';
  if (key.note === 'C') el.textContent = `C${key.octave}`;
  bindKey(el, key.id);
  keyboard.appendChild(el);
  if ([0,2,5,7,9].includes(key.noteIdx) && i < WHITE_KEYS.length - 1) {
    const blackId = NOTE_NAMES[key.noteIdx + 1] + key.octave;
    const bel = document.createElement('div');
    bel.className = 'black-key';
    bel.id = 'key_' + blackId;
    bel.style.left = (i * WHITE_W + WHITE_W - BLACK_W / 2) + 'px';
    bindKey(bel, blackId);
    keyboard.appendChild(bel);
  }
});

// ── Mini-carte + flèches d'octave ──
const pianoWrap = $('pianoWrap'), minimap = $('minimap'), miniKeys = $('miniKeys'), miniWindow = $('miniWindow');
const KB_PAD = 16;
const FULL_W = totalWidth + 2 * KB_PAD;
const pct = px => (px / FULL_W * 100) + '%';
WHITE_KEYS.forEach((key, i) => {
  const x = KB_PAD + i * WHITE_W;
  const m = document.createElement('div');
  m.className = 'mini-key mini-white'; m.id = 'mini_' + key.id;
  m.style.left = pct(x); m.style.width = pct(WHITE_W);
  miniKeys.appendChild(m);
  if (key.note === 'C') {
    const l = document.createElement('span');
    l.className = 'mini-label'; l.textContent = key.octave; l.style.left = pct(x);
    miniKeys.appendChild(l);
  }
  if ([0,2,5,7,9].includes(key.noteIdx) && i < WHITE_KEYS.length - 1) {
    const b = document.createElement('div');
    b.className = 'mini-key mini-black'; b.id = 'mini_' + NOTE_NAMES[key.noteIdx + 1] + key.octave;
    b.style.left = pct(x + WHITE_W - BLACK_W / 2); b.style.width = pct(BLACK_W);
    miniKeys.appendChild(b);
  }
});
function updateMiniWindow() {
  const sw = pianoWrap.scrollWidth;
  miniWindow.style.left = (pianoWrap.scrollLeft / sw * 100) + '%';
  miniWindow.style.width = (pianoWrap.clientWidth / sw * 100) + '%';
}
let scrollSaveTimer = null;
pianoWrap.addEventListener('scroll', () => {
  updateMiniWindow();
  clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(() => lsSet('pianoScroll', pianoWrap.scrollLeft), 300);
}, { passive: true });
window.addEventListener('resize', updateMiniWindow);
pianoWrap.addEventListener('wheel', e => {
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); pianoWrap.scrollLeft += e.deltaY; }
}, { passive: false });

let miniDrag = false, miniGrabOffset = 0;
function scrollMiniTo(clientX) {
  const r = minimap.getBoundingClientRect();
  const f = (clientX - miniGrabOffset - r.left) / r.width;
  pianoWrap.scrollLeft = f * pianoWrap.scrollWidth - pianoWrap.clientWidth / 2;
}
minimap.addEventListener('pointerdown', e => {
  const w = miniWindow.getBoundingClientRect();
  miniGrabOffset = (e.clientX >= w.left && e.clientX <= w.right) ? e.clientX - (w.left + w.width / 2) : 0;
  miniDrag = true;
  minimap.setPointerCapture(e.pointerId);
  scrollMiniTo(e.clientX);
});
minimap.addEventListener('pointermove', e => { if (miniDrag) scrollMiniTo(e.clientX); });
['pointerup', 'pointercancel'].forEach(t => minimap.addEventListener(t, () => { miniDrag = false; }));

function shiftOctave(d) {
  const cur = Math.round((pianoWrap.scrollLeft + 8 - KB_PAD) / WHITE_W);
  let base = d > 0 ? Math.floor(cur / 7) * 7 + 7 : Math.ceil(cur / 7) * 7 - 7;
  base = Math.max(0, Math.min(WHITE_KEYS.length - 1, base));
  pianoWrap.scrollTo({ left: KB_PAD + base * WHITE_W - 8, behavior: 'smooth' });
}
// Fait apparaître des notes si elles sont hors du champ du clavier
function revealNotes(ids) {
  if (!ids.length) return;
  const els = ids.map(id => $('key_' + id)).filter(Boolean);
  if (!els.length) return;
  const lo = KB_PAD + Math.min(...els.map(e => e.offsetLeft));
  const hi = KB_PAD + Math.max(...els.map(e => e.offsetLeft + e.offsetWidth));
  const vl = pianoWrap.scrollLeft, vr = vl + pianoWrap.clientWidth;
  if (lo >= vl + 4 && hi <= vr - 4) return;
  pianoWrap.scrollTo({ left: (lo + hi) / 2 - pianoWrap.clientWidth / 2, behavior: 'smooth' });
}

