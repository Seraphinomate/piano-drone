// ═══════════════════════════════════════════════════════════
//  Audio : Tone.js, samplers, reverb
// ═══════════════════════════════════════════════════════════
let Tone = null, reverb = null;
let reverbOn = true;
let samplerReady = false;
let samplers = { piano: null, strings: null };
let samplerLoaded = { piano: false, strings: false };
let samplerLoading = { piano: false, strings: false };
let currentTimbre = 'piano';
let sampler = null;

// playState : 'idle' | 'chord' (▶ Accord) | 'manual' (case tenue) | 'auto' (suite au tempo)
let playState = 'idle';
let held = [];     // notes actuellement tenues par l'accord ou la suite

function releaseHeld(time) {
  if (held.length && sampler) { try { sampler.triggerRelease(held, time); } catch (e) {} }
  held = [];
}
function holdChord(notes, time) {
  releaseHeld(time);
  if (!sampler || !samplerReady || !notes.length) return;
  try { sampler.triggerAttack(notes, time); } catch (e) {}
  held = notes.slice();
}
async function audioStart() {
  if (!Tone) return false;
  await Tone.start();
  return true;
}

async function togglePlay() {
  if (playState === 'chord') { stopAll(); return; }
  if (!samplerReady || !selected.size) return;
  await audioStart();
  stopAll();
  holdChord(getSortedNotes());
  playState = 'chord';
  updateUI(); renderTransport();
}

function setReady(label, isError) {
  samplerReady = true;
  progressWrap.style.display = 'none';
  statusEl.className = 'status ' + (isError ? 'error' : 'ready');
  statusEl.textContent = '◈ ' + label;
  updateUI(); renderTransport();
}
function reconnectSampler() {
  if (!sampler) return;
  sampler.disconnect();
  if (reverbOn) sampler.connect(reverb); else sampler.toDestination();
}
function toggleReverb() {
  reverbOn = !reverbOn;
  $('reverbToggle').classList.toggle('on', reverbOn);
  reconnectSampler(); reconnectDrone();
}
async function setTimbre(t) {
  if (currentTimbre === t) return;
  stopAll();
  currentTimbre = t;
  $('btnPiano').classList.toggle('on', t === 'piano');
  $('btnStrings').classList.toggle('on', t === 'strings');
  $('soundSummary').textContent = t === 'piano' ? 'Piano' : 'Cordes';
  if (samplerLoaded[t]) {
    sampler = samplers[t];
    reconnectSampler();
    setReady(t === 'piano' ? 'Salamander Grand Piano' : 'FluidR3 String Ensemble');
  } else if (Tone) {
    samplerReady = false;
    updateUI(); renderTransport();
    loadStringsSampler();
  }
}

const SALAMANDER_NOTES = ["A0","C1","D#1","F#1","A1","C2","D#2","F#2","A2","C3","D#3","F#3","A3","C4","D#4","F#4","A4","C5","D#5","F#5","A5","C6","D#6","F#6","A6","C7","D#7","F#7","A7","C8"];
const STRINGS_NOTES    = ["A2","C3","D#3","F#3","A3","C4","D#4","F#4","A4","C5","D#5","F#5","A5","C6","D#6","F#6","A6"];

function useFallback(name, opts, label) {
  const fs = new Tone.PolySynth(Tone.Synth, opts);
  samplers[name] = fs; samplerLoaded[name] = true;
  if (currentTimbre === name) { sampler = fs; reconnectSampler(); setReady(label, true); }
}
function buildPianoSampler(ToneLib) {
  Tone = ToneLib;
  reverb = new Tone.Reverb({ decay: 3.5, wet: 0.38 }).toDestination();
  reverb.generate();
  buildDrone();
  const urls = {};
  SALAMANDER_NOTES.forEach(n => urls[n] = n.replace('#', 's') + '.mp3');
  samplerLoading.piano = true;
  const s = new Tone.Sampler({
    urls, release: 0.35,
    baseUrl: 'https://tonejs.github.io/audio/salamander/',
    onload: () => {
      samplers.piano = s; samplerLoaded.piano = true;
      if (currentTimbre === 'piano') { sampler = s; reconnectSampler(); setReady('Salamander Grand Piano'); }
    },
    onerror: () => useFallback('piano', { oscillator: { type: 'triangle' }, envelope: { attack: 0.02, decay: 0.4, sustain: 0.5, release: 0.6 }, volume: -4 }, 'Synthèse (fallback)')
  });
}
function loadStringsSampler() {
  if (!Tone || samplerLoading.strings) return;
  samplerLoading.strings = true;
  progressWrap.style.display = '';
  statusEl.className = 'status loading';
  statusEl.textContent = '⟳ Chargement cordes…';
  const urls = {};
  STRINGS_NOTES.forEach(n => urls[n] = n.replace('#', 's') + '.mp3');
  const s = new Tone.Sampler({
    urls, release: 0.6,
    baseUrl: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/string_ensemble_1-mp3/',
    onload: () => {
      samplers.strings = s; samplerLoaded.strings = true;
      if (currentTimbre === 'strings') { sampler = s; reconnectSampler(); setReady('FluidR3 String Ensemble'); }
    },
    onerror: () => useFallback('strings', { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.4, decay: 0.2, sustain: 0.8, release: 0.8 }, volume: -8 }, 'Synth cordes (fallback)')
  });
}

