import { AudioEngine } from './audioEngine.js';
import { FaceTracker } from './faceTracker.js';
import { UnifiedRenderer } from './unifiedRenderer.js';

const THEME_META = {
  void:       { title: 'VOID RIDER MK-II',       sub: 'COSMIC NEURAL SYNTHESIZER',      status: 'VOID RIDER // COSMIC LINK ACTIVE' },
  enterprise: { title: 'U.S.S. ENTERPRISE',      sub: 'NCC-1701 · KELVIN BRIDGE 2013',  status: 'USS ENTERPRISE // ALL SYSTEMS NOMINAL' },
  cyber:      { title: 'U.S.S. VENGEANCE',       sub: 'SECTION 31 · CYBER-TREK NOIR',   status: 'DANGER // AUTHORIZED PERSONNEL ONLY' }
};

const $ = (id) => document.getElementById(id);
const appMode = document.body.dataset.appMode || 'desktop'; // 'desktop' | 'mobile' | 'pocket'
const isLite = appMode !== 'desktop';

const videoEl = $('webcam-video');
const canvasEl = $('bridge-canvas');
const audio = new AudioEngine();
const tracker = videoEl ? new FaceTracker(videoEl) : null;
const renderer = new UnifiedRenderer(canvasEl, videoEl, {
  liteMode: isLite,
  showVisor: appMode !== 'pocket'
});

let currentTheme = document.body.dataset.theme || 'enterprise';
let active = false;
let redAlert = false;
let sensitivity = 1.15;

// Touch XY pad state (for mobile.html & mobile-pocket.html)
const touchState = { active: false, yaw: 0, pitch: 0, echo: false, shimmer: false };

/* ===================== REAL-TIME 3-THEME SWITCHER ===================== */

function setTheme(theme) {
  if (!THEME_META[theme]) return;
  currentTheme = theme;
  document.body.dataset.theme = theme;

  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });

  const meta = THEME_META[theme];
  if ($('brand-title')) $('brand-title').textContent = meta.title;
  if ($('brand-sub')) $('brand-sub').textContent = meta.sub;
  if ($('hud-status') && !audio.muted) $('hud-status').textContent = meta.status;

  // Play era-appropriate UI SFX & sync built-in synth groove seamlessly!
  if (audio.initialized) {
    if (theme === 'enterprise') audio.playHailChime();
    else if (theme === 'cyber') audio.playButtonBeep(880);
    else audio.playButtonBeep(1440);

    audio.setGroove(theme);
    if (audio.synthPlaying && $('source-status')) {
      $('source-status').textContent = `SYNTH // ${theme.toUpperCase()}`;
    }
  }
}

document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => setTheme(btn.dataset.theme));
});

/* ===================== BOOT / START ===================== */

async function startApp(useCam = false) {
  const statusEl = $('boot-status');
  try {
    await audio.init();
    audio.setGroove(currentTheme);

    if (useCam && tracker) {
      if (statusEl) statusEl.textContent = 'Caricamento MediaPipe Face Landmarker...';
      await tracker.initCameraAndModel((m) => { if (statusEl) statusEl.textContent = m; });
    } else if (tracker) {
      tracker.enableSimMode(true);
    }

    active = true;
    $('boot-screen')?.classList.add('hidden');
    document.querySelectorAll('.hud-reveal').forEach(el => el.classList.remove('hidden'));

    await audio.startSynth();
    if ($('btn-synth-toggle')) $('btn-synth-toggle').textContent = '■ STOP SYNTH';
    if ($('source-status')) $('source-status').textContent = `SYNTH // ${currentTheme.toUpperCase()}`;
    setTheme(currentTheme);
  } catch (err) {
    if (statusEl) statusEl.textContent = `Errore: ${err.message}. Usa Touch / Mouse!`;
  }
}

$('btn-boot-cam')?.addEventListener('click', () => startApp(true));
$('btn-boot-sim')?.addEventListener('click', () => startApp(false));

/* ===================== CONTROLS (SHARED DESKTOP + MOBILE) ===================== */

const toggleAlert = () => {
  redAlert = !redAlert;
  document.body.classList.toggle('red-alert', redAlert);
  $('btn-alert')?.classList.toggle('active', redAlert);
  if (redAlert) audio.playRedAlertKlaxon();
  else audio.playButtonBeep(1100);
};

const toggleBypass = () => {
  const next = !audio.bypass;
  audio.setBypass(next);
  audio.playButtonBeep(next ? 780 : 1380);
  if ($('btn-bypass')) {
    $('btn-bypass').textContent = next ? 'FX: OFF' : 'FX: ON';
    $('btn-bypass').classList.toggle('active-toggle', next);
  }
};

const toggleMute = () => {
  const next = !audio.muted;
  audio.setMute(next);
  if ($('btn-mute')) $('btn-mute').classList.toggle('active-toggle', next);
};

$('btn-alert')?.addEventListener('click', toggleAlert);
$('btn-bypass')?.addEventListener('click', toggleBypass);
$('btn-mute')?.addEventListener('click', toggleMute);
$('btn-calibrate')?.addEventListener('click', () => {
  tracker?.calibrateZero();
  audio.playButtonBeep(1580);
});

$('btn-sim-mode')?.addEventListener('click', async () => {
  if (!tracker) return;
  if (!tracker.simMode) {
    tracker.enableSimMode(true);
    $('btn-sim-mode').classList.add('active-toggle');
  } else {
    if (!tracker.landmarker) {
      try { await tracker.initCameraAndModel(); }
      catch (err) { alert(err.message); return; }
    }
    tracker.enableSimMode(false);
    $('btn-sim-mode').classList.remove('active-toggle');
  }
});

$('fx-sensitivity')?.addEventListener('input', (e) => {
  sensitivity = parseFloat(e.target.value);
  if ($('sens-val')) $('sens-val').textContent = `${sensitivity.toFixed(1)}x`;
});
$('master-vol')?.addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  audio.setMasterVolume(v);
  if ($('vol-val')) $('vol-val').textContent = `${Math.round(v * 100)}%`;
});

/* ===================== AUDIO SOURCES ===================== */

document.querySelectorAll('.src-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    audio.playButtonBeep(1220);
    document.querySelectorAll('.src-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.src-pane').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    $(`pane-${tab.dataset.source}`)?.classList.add('active');
  });
});

$('btn-synth-toggle')?.addEventListener('click', async () => {
  if (audio.synthPlaying) {
    audio.stopSynth();
    $('btn-synth-toggle').textContent = '▶ START SYNTH';
    if ($('source-status')) $('source-status').textContent = 'STANDBY';
  } else {
    audio.setGroove(currentTheme);
    await audio.startSynth();
    $('btn-synth-toggle').textContent = '■ STOP SYNTH';
    if ($('source-status')) $('source-status').textContent = `SYNTH // ${currentTheme.toUpperCase()}`;
  }
});

const fileInput = $('audio-file-input');
async function handleFile(file) {
  if (!file) return;
  const name = await audio.loadFile(file);
  if ($('file-track-name')) $('file-track-name').textContent = name;
  if ($('btn-synth-toggle')) $('btn-synth-toggle').textContent = '▶ START SYNTH';
  if ($('source-status')) $('source-status').textContent = 'FILE // LIVE';
}
$('btn-file-pick')?.addEventListener('click', () => fileInput?.click());
fileInput?.addEventListener('change', (e) => handleFile(e.target.files[0]));

const triggerTab = async () => {
  try {
    await audio.startTabCapture();
    if ($('source-status')) $('source-status').textContent = 'TAB // LIVE';
  } catch (err) { if (err.name !== 'NotAllowedError') alert(err.message); }
};
$('btn-tab-capture')?.addEventListener('click', triggerTab);
$('btn-yt-capture')?.addEventListener('click', triggerTab);

$('btn-yt-load')?.addEventListener('click', () => {
  const raw = $('yt-url-input').value.trim();
  const m = raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  if (!m) { alert('Link YouTube non valido'); return; }
  $('yt-iframe').src = `https://www.youtube.com/embed/${m[1]}?autoplay=1&enablejsapi=1`;
  $('yt-player-wrap').classList.remove('hidden');
  audio.stopSynth();
});

let micOn = false;
$('btn-mic-toggle')?.addEventListener('click', async () => {
  if (micOn) { audio.stopMic(); micOn = false; $('btn-mic-toggle').textContent = '🎙️ MIC'; }
  else {
    try { await audio.startMic(4, -38); micOn = true; $('btn-mic-toggle').textContent = '■ MIC ON'; }
    catch (err) { alert(err.message); }
  }
});

/* ===================== MOBILE TOUCH XY PAD ===================== */

const xyPad = $('xy-pad');
const xyPuck = $('xy-puck');
if (xyPad) {
  const updatePad = (e) => {
    const r = xyPad.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    touchState.yaw = (x - 0.5) * 2;
    touchState.pitch = -(y - 0.5) * 2;
    if (xyPuck) { xyPuck.style.left = `${x * 100}%`; xyPuck.style.top = `${y * 100}%`; }
  };
  xyPad.addEventListener('pointerdown', (e) => {
    xyPad.setPointerCapture(e.pointerId);
    touchState.active = true;
    updatePad(e);
  });
  xyPad.addEventListener('pointermove', (e) => { if (touchState.active) updatePad(e); });
  const releasePad = () => {
    touchState.active = false;
    touchState.yaw = 0; touchState.pitch = 0;
    if (xyPuck) { xyPuck.style.left = '50%'; xyPuck.style.top = '50%'; }
  };
  xyPad.addEventListener('pointerup', releasePad);
  xyPad.addEventListener('pointercancel', releasePad);
}

const bindHold = (id, key) => {
  const el = $(id);
  if (!el) return;
  const down = (e) => { e.preventDefault(); touchState[key] = true; el.classList.add('pressed'); };
  const up = () => { touchState[key] = false; el.classList.remove('pressed'); };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
};
bindHold('hold-echo', 'echo');
bindHold('hold-shimmer', 'shimmer');

/* ===================== KEYBOARD SHORTCUTS ===================== */
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === '1') setTheme('void');
  else if (k === '2') setTheme('enterprise');
  else if (k === '3') setTheme('cyber');
  else if (k === 'r' && active) toggleAlert();
  else if (k === 'b' && active) toggleBypass();
  else if (k === 'm' && active) toggleMute();
  else if (k === 'c' && active) tracker?.calibrateZero();
});

/* ===================== 60FPS MAIN LOOP ===================== */

function mapFX(face) {
  const dz = 0.12;
  const c01 = (v) => Math.max(0, Math.min(1, v));
  const ramp = (v, s, span) => c01((v - s) / span);
  return {
    pitch:   ramp(face.yaw * sensitivity, dz, 0.5) * 12,
    vocoder: ramp(-face.yaw * sensitivity, dz, 0.5),
    flange:  ramp(face.pitch * sensitivity, dz, 0.48),
    filter:  ramp(-face.pitch * sensitivity, dz, 0.48),
    space:   ramp(face.jawOpen * sensitivity, 0.14, 0.42),
    shimmer: ramp(face.browUp * sensitivity, 0.2, 0.45)
  };
}

function tick(now) {
  requestAnimationFrame(tick);

  let face = { detected: true, yaw: 0, pitch: 0, jawOpen: 0, browUp: 0, noseX: 0.5, noseY: 0.5, landmarks: null };
  if (active) {
    if (appMode === 'pocket' || (appMode === 'mobile' && (!tracker || tracker.simMode || touchState.active))) {
      face.yaw = touchState.yaw;
      face.pitch = touchState.pitch;
      face.jawOpen = touchState.echo ? 0.95 : 0;
      face.browUp = touchState.shimmer ? 0.9 : 0;
    } else if (tracker) {
      face = tracker.update(now);
    }
  }

  const fx = active ? mapFX(face) : audio.fx;
  if (active) audio.updateFX(fx);
  const metrics = audio.getMetrics();

  renderer.render({
    theme: currentTheme,
    active,
    face,
    fx,
    metrics,
    simMode: !tracker || tracker.simMode || appMode === 'pocket',
    redAlert
  });

  if (!active) return;

  if ($('vu-fill')) $('vu-fill').style.width = `${Math.round(metrics.level * 100)}%`;
  if ($('bar-pitch'))   $('bar-pitch').style.width = `${(fx.pitch / 12) * 100}%`;
  if ($('bar-vocoder')) $('bar-vocoder').style.width = `${fx.vocoder * 100}%`;
  if ($('bar-flange'))  $('bar-flange').style.width = `${fx.flange * 100}%`;
  if ($('bar-filter'))  $('bar-filter').style.width = `${fx.filter * 100}%`;
  if ($('bar-space'))   $('bar-space').style.width = `${fx.space * 100}%`;
  if ($('bar-shimmer')) $('bar-shimmer').style.width = `${fx.shimmer * 100}%`;
}

requestAnimationFrame(tick);
