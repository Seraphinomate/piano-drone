// ═══════════════════════════════════════════════════════════
//  Démarrage
// ═══════════════════════════════════════════════════════════
ensureProg();
Object.assign(drone, prog.drone || {});
renderDrone();
renderAllSeq();
applyView();
updateUI();

if (matchMedia('(min-width: 900px)').matches) {
  ['panelLib', 'panelDrone', 'panelSound'].forEach(id => $(id).open = true);
}
requestAnimationFrame(() => {
  const saved = lsGet('pianoScroll', null);
  const c3 = WHITE_KEYS.findIndex(k => k.id === 'C3');
  pianoWrap.scrollLeft = saved !== null ? +saved : KB_PAD + c3 * WHITE_W - 8;
  updateMiniWindow();
});

(function loadTone() {
  statusEl.textContent = '⟳ Chargement Tone.js…';
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/tone/14.7.77/Tone.js';
  script.onload = () => {
    statusEl.textContent = '⟳ Chargement piano…';
    buildPianoSampler(window.Tone);
    Tone.Transport.bpm.value = prog.bpm;
  };
  script.onerror = () => {
    statusEl.className = 'status error';
    statusEl.textContent = '✕ Échec chargement — vérifier la connexion';
  };
  document.head.appendChild(script);
})();

sync();
