// ═══════════════════════════════════════════════════════════
//  Bourdon (drone)
// ═══════════════════════════════════════════════════════════
const DRONE_OCT_MIN = 1, DRONE_OCT_MAX = 4;
const drone = Object.assign({ pc: 0, octave: 2, fifth: false, vol: -12 }, lsGet('pianoDrone', {}), { on: false });
let droneSynth = null, droneOut = null, droneSounding = [];

NOTE_NAMES.forEach((n, i) => {
  const b = document.createElement('button');
  b.className = 'drone-note' + (BLACK_INDICES.has(i) ? ' sharp' : '');
  b.textContent = n;
  b.onclick = () => setDronePc(i);
  $('droneNotes').appendChild(b);
});
$('droneVol').value = drone.vol;

function buildDrone() {
  droneOut = new Tone.Gain(Tone.dbToGain(drone.vol));
  const filter = new Tone.Filter({ type: 'lowpass', frequency: 900, Q: 0.6 }).connect(droneOut);
  new Tone.LFO({ frequency: 0.07, min: 550, max: 1300 }).start().connect(filter.frequency);
  droneSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fatsawtooth', count: 3, spread: 14 },
    envelope: { attack: 1.5, decay: 0.2, sustain: 1, release: 2.2 },
    volume: -14
  }).connect(filter);
  reconnectDrone();
  renderDrone();
}
function reconnectDrone() {
  if (!droneOut) return;
  droneOut.disconnect();
  if (reverbOn) droneOut.connect(reverb); else droneOut.toDestination();
}
function droneNoteNames() {
  const root = drone.octave * 12 + drone.pc;
  const list = [root];
  if (drone.fifth) list.push(root + 7);
  return list.map(n => NOTE_NAMES[n % 12] + Math.floor(n / 12));
}
function updateDroneSound() {
  if (!droneSynth) return;
  const next = drone.on ? droneNoteNames() : [];
  const off = droneSounding.filter(n => !next.includes(n));
  const on  = next.filter(n => !droneSounding.includes(n));
  if (off.length) droneSynth.triggerRelease(off);
  if (on.length) droneSynth.triggerAttack(on);
  droneSounding = next;
}
function renderDrone() {
  $('panelDrone').classList.toggle('drone-on', drone.on);
  $('droneToggle').classList.toggle('on', drone.on);
  $('fifthToggle').classList.toggle('on', drone.fifth);
  $('droneCurrent').textContent = droneNoteNames().join(' · ');
  $('octVal').textContent = drone.octave;
  $('octDown').disabled = drone.octave <= DRONE_OCT_MIN;
  $('octUp').disabled = drone.octave >= DRONE_OCT_MAX;
  [...$('droneNotes').children].forEach((b, i) => b.classList.toggle('active', i === drone.pc));
  ALL_KEYS.forEach(k => $('key_' + k.id)?.classList.toggle('drone-pc', drone.on && k.noteIdx === drone.pc));
  refreshMiniNotes();
}
// Réglages du bourdon → mémorisés globalement + dans la suite ouverte
function droneChanged() {
  lsSet('pianoDrone', { pc: drone.pc, octave: drone.octave, fifth: drone.fifth, vol: drone.vol });
  if (prog) { prog.drone = { pc: drone.pc, octave: drone.octave, fifth: drone.fifth }; touch(false); }
  updateDroneSound(); renderDrone();
}
async function toggleDrone() {
  if (!droneSynth) return;
  await Tone.start();
  drone.on = !drone.on;
  updateDroneSound(); renderDrone();
}
function setDronePc(pc) { drone.pc = pc; droneChanged(); }
function shiftDroneOct(d) { drone.octave = Math.min(DRONE_OCT_MAX, Math.max(DRONE_OCT_MIN, drone.octave + d)); droneChanged(); }
function toggleDroneFifth() { drone.fifth = !drone.fifth; droneChanged(); }
function setDroneVol(v) {
  drone.vol = +v;
  if (droneOut) droneOut.gain.rampTo(Tone.dbToGain(drone.vol), 0.08);
  lsSet('pianoDrone', { pc: drone.pc, octave: drone.octave, fifth: drone.fifth, vol: drone.vol });
}

