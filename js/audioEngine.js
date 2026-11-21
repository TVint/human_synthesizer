/**
 * USS ENTERPRISE NCC-1701 // Starfleet Web Audio DSP & SFX Engine
 * Includes synthesized Kelvin-timeline LCARS beeps, Red Alert klaxon,
 * Bridge Hail chime, Warp Engage whoosh, Into Darkness-inspired procedural score,
 * and full 6-axis face-mapped FX chain.
 */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.initialized = false;
    this.muted = false;
    this.bypass = false;
    this.masterVolume = 0.85;
    this.activeSource = 'none';

    this.fx = { pitch: 0, vocoder: 0, flange: 0, filter: 0, space: 0, shimmer: 0 };

    this.audioEl = new Audio();
    this.audioEl.crossOrigin = 'anonymous';
    this.audioEl.loop = true;
    this.fileSourceNode = null;
    this.fileObjectUrl = null;

    this.tabStream = null;
    this.tabSourceNode = null;
    this.micStream = null;
    this.micSourceNode = null;
    this.micGainNode = null;
    this.micGateAnalyser = null;
    this.micGateGain = null;
    this.micGateThresholdDb = -38;

    this.synthPlaying = false;
    this.synthGroove = 'enterprise';
    this.synthTimer = null;
    this.synthStep = 0;

    this.waveBuffer = new Float32Array(256);
    this.fftBuffer = new Uint8Array(128);
    this.micBuffer = new Float32Array(256);
  }

  async init() {
    if (this.initialized) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this.inputBus = this.ctx.createGain();
    this.fxInput = this.ctx.createGain();
    this.bypassDry = this.ctx.createGain();
    this.fxOutput = this.ctx.createGain();
    this.bypassDry.gain.value = 0.0;
    this.fxOutput.gain.value = 1.0;

    this.inputBus.connect(this.fxInput);
    this.inputBus.connect(this.bypassDry);

    // 1. Cloak Sub-Filter
    this.subFilter = this.ctx.createBiquadFilter();
    this.subFilter.type = 'lowpass';
    this.subFilter.frequency.value = 20000;
    this.subFilter.Q.value = 1.2;

    // 2. Phaser Shimmer
    this.shimmerFilter = this.ctx.createBiquadFilter();
    this.shimmerFilter.type = 'peaking';
    this.shimmerFilter.frequency.value = 3200;
    this.shimmerFilter.Q.value = 2.2;
    this.shimmerFilter.gain.value = 0;

    this.fxInput.connect(this.subFilter);
    this.subFilter.connect(this.shimmerFilter);

    // 3. Transporter Pitch Shifter (Dual-Delay)
    this.pitchDry = this.ctx.createGain();
    this.pitchWet = this.ctx.createGain();
    this.pitchOut = this.ctx.createGain();
    this.pitchDry.gain.value = 1.0;
    this.pitchWet.gain.value = 0.0;
    this.shimmerFilter.connect(this.pitchDry);
    this.pitchDry.connect(this.pitchOut);
    this._buildPitchShifter(this.shimmerFilter, this.pitchWet);
    this.pitchWet.connect(this.pitchOut);

    // 4. Tricorder Vocoder
    this.vocDry = this.ctx.createGain();
    this.vocWet = this.ctx.createGain();
    this.vocOut = this.ctx.createGain();
    this.vocDry.gain.value = 1.0;
    this.vocWet.gain.value = 0.0;
    this.pitchOut.connect(this.vocDry);
    this.vocDry.connect(this.vocOut);

    this.vocRingGain = this.ctx.createGain();
    this.vocRingGain.gain.value = 0.0;
    this.vocCarrier = this.ctx.createOscillator();
    this.vocCarrier.type = 'sawtooth';
    this.vocCarrier.frequency.value = 125;
    this.vocCarrier.connect(this.vocRingGain.gain);
    this.vocCarrier.start();

    this.vocShaper = this.ctx.createWaveShaper();
    this.vocShaper.curve = this._makeBitcrushCurve(10);
    this.vocShaper.oversample = '2x';
    this.vocFormant = this.ctx.createBiquadFilter();
    this.vocFormant.type = 'bandpass';
    this.vocFormant.frequency.value = 1050;
    this.vocFormant.Q.value = 2.4;
    this.vocBoost = this.ctx.createGain();
    this.vocBoost.gain.value = 2.4;

    this.pitchOut.connect(this.vocRingGain);
    this.vocRingGain.connect(this.vocShaper);
    this.vocShaper.connect(this.vocFormant);
    this.vocFormant.connect(this.vocBoost);
    this.vocBoost.connect(this.vocWet);
    this.vocWet.connect(this.vocOut);

    // 5. Warp Drive Flanger
    this.flangeDry = this.ctx.createGain();
    this.flangeWet = this.ctx.createGain();
    this.flangeOut = this.ctx.createGain();
    this.flangeDry.gain.value = 1.0;
    this.flangeWet.gain.value = 0.0;
    this.flangeDelay = this.ctx.createDelay(0.05);
    this.flangeDelay.delayTime.value = 0.005;
    this.flangeFeedback = this.ctx.createGain();
    this.flangeFeedback.gain.value = 0.72;
    this.flangeLfo = this.ctx.createOscillator();
    this.flangeLfo.type = 'sine';
    this.flangeLfo.frequency.value = 0.35;
    this.flangeLfoDepth = this.ctx.createGain();
    this.flangeLfoDepth.gain.value = 0.0038;
    this.flangeLfo.connect(this.flangeLfoDepth);
    this.flangeLfoDepth.connect(this.flangeDelay.delayTime);
    this.flangeLfo.start();

    this.vocOut.connect(this.flangeDry);
    this.flangeDry.connect(this.flangeOut);
    this.vocOut.connect(this.flangeDelay);
    this.flangeDelay.connect(this.flangeFeedback);
    this.flangeFeedback.connect(this.flangeDelay);
    this.flangeDelay.connect(this.flangeWet);
    this.flangeWet.connect(this.flangeOut);

    // 6. Subspace Echo & Reverb
    this.spaceDry = this.ctx.createGain();
    this.spaceWet = this.ctx.createGain();
    this.spaceDry.gain.value = 1.0;
    this.spaceWet.gain.value = 0.0;

    this.delayL = this.ctx.createDelay(1.5);
    this.delayR = this.ctx.createDelay(1.5);
    this.delayL.delayTime.value = 0.28;
    this.delayR.delayTime.value = 0.42;
    this.delayFbL = this.ctx.createGain();
    this.delayFbR = this.ctx.createGain();
    this.delayFbL.gain.value = 0.46;
    this.delayFbR.gain.value = 0.46;
    this.delayTone = this.ctx.createBiquadFilter();
    this.delayTone.type = 'lowpass';
    this.delayTone.frequency.value = 3400;

    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this._createReverbImpulse(2.6, 2.8);

    this.flangeOut.connect(this.spaceDry);
    this.spaceDry.connect(this.fxOutput);
    this.flangeOut.connect(this.delayTone);
    this.delayTone.connect(this.delayL);
    this.delayL.connect(this.delayFbL);
    this.delayFbL.connect(this.delayR);
    this.delayR.connect(this.delayFbR);
    this.delayFbR.connect(this.delayL);
    this.delayL.connect(this.spaceWet);
    this.delayR.connect(this.spaceWet);
    this.flangeOut.connect(this.reverb);
    this.reverb.connect(this.spaceWet);
    this.spaceWet.connect(this.fxOutput);

    // 7. Master Limiter, Gain & Analyser
    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.value = -4;
    this.masterLimiter.knee.value = 8;
    this.masterLimiter.ratio.value = 12;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.masterVolume;

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.45;
    this.sfxBus.connect(this.ctx.destination);

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.82;
    this.waveBuffer = new Float32Array(this.analyser.fftSize);
    this.fftBuffer = new Uint8Array(this.analyser.frequencyBinCount);

    this.fxOutput.connect(this.masterLimiter);
    this.bypassDry.connect(this.masterLimiter);
    this.masterLimiter.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    this.initialized = true;
  }

  /* ===================== STARFLEET SYNTHESIZED SFX ===================== */

  playButtonBeep(freq = 1320) {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.setValueAtTime(freq * 1.25, now + 0.045);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.18, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playHailChime() {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    // Classic Starfleet bosun whistle / hail chirp
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(980, now);
    osc.frequency.exponentialRampToValueAtTime(1680, now + 0.14);
    osc.frequency.exponentialRampToValueAtTime(1240, now + 0.28);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.24, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 0.36);
  }

  playRedAlertKlaxon() {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.42;
      const osc = this.ctx.createOscillator();
      const flt = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.linearRampToValueAtTime(740, t + 0.24);
      osc.frequency.linearRampToValueAtTime(520, t + 0.36);
      flt.type = 'bandpass';
      flt.frequency.value = 900;
      flt.Q.value = 2.0;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.28, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      osc.connect(flt);
      flt.connect(g);
      g.connect(this.sfxBus);
      osc.start(t);
      osc.stop(t + 0.4);
    }
  }

  playWarpWhoosh() {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.28);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.65);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.32, now + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.68);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 0.7);
  }

  /* ===================== DSP HELPERS ===================== */

  _buildPitchShifter(inputNode, outputNode) {
    const bufLen = 4096;
    const sr = this.ctx.sampleRate;
    const rampA = this.ctx.createBuffer(1, bufLen, sr);
    const rampB = this.ctx.createBuffer(1, bufLen, sr);
    const winA = this.ctx.createBuffer(1, bufLen, sr);
    const winB = this.ctx.createBuffer(1, bufLen, sr);
    const rA = rampA.getChannelData(0), rB = rampB.getChannelData(0);
    const wA = winA.getChannelData(0), wB = winB.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      const pA = i / bufLen, pB = (pA + 0.5) % 1.0;
      rA[i] = 1 - pA; rB[i] = 1 - pB;
      wA[i] = Math.sin(Math.PI * pA); wB[i] = Math.sin(Math.PI * pB);
    }
    const delayWindow = 0.065;
    this.pitchDelayA = this.ctx.createDelay(0.2);
    this.pitchDelayB = this.ctx.createDelay(0.2);
    this.pitchGainA = this.ctx.createGain();
    this.pitchGainB = this.ctx.createGain();
    this.pitchGainA.gain.value = 0;
    this.pitchGainB.gain.value = 0;

    this.pitchModA = this.ctx.createBufferSource();
    this.pitchModB = this.ctx.createBufferSource();
    this.pitchWinA = this.ctx.createBufferSource();
    this.pitchWinB = this.ctx.createBufferSource();
    this.pitchModA.buffer = rampA; this.pitchModB.buffer = rampB;
    this.pitchWinA.buffer = winA;  this.pitchWinB.buffer = winB;
    [this.pitchModA, this.pitchModB, this.pitchWinA, this.pitchWinB].forEach(s => { s.loop = true; s.playbackRate.value = 0.001; });

    const dA = this.ctx.createGain(), dB = this.ctx.createGain();
    dA.gain.value = delayWindow; dB.gain.value = delayWindow;
    this.pitchModA.connect(dA); dA.connect(this.pitchDelayA.delayTime);
    this.pitchModB.connect(dB); dB.connect(this.pitchDelayB.delayTime);
    this.pitchWinA.connect(this.pitchGainA.gain);
    this.pitchWinB.connect(this.pitchGainB.gain);

    inputNode.connect(this.pitchDelayA); inputNode.connect(this.pitchDelayB);
    this.pitchDelayA.connect(this.pitchGainA); this.pitchDelayB.connect(this.pitchGainB);
    this.pitchGainA.connect(outputNode); this.pitchGainB.connect(outputNode);

    const now = this.ctx.currentTime;
    this.pitchModA.start(now); this.pitchModB.start(now);
    this.pitchWinA.start(now); this.pitchWinB.start(now);
    this._pitchWindowSec = delayWindow;
    this._pitchBufSec = bufLen / sr;
  }

  _makeBitcrushCurve(steps = 10) {
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      c[i] = Math.tanh((Math.round(x * steps) / steps) * 2.2);
    }
    return c;
  }

  _createReverbImpulse(duration, decay) {
    const sr = this.ctx.sampleRate, len = Math.floor(sr * duration);
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  updateFX({ pitch = 0, vocoder = 0, flange = 0, filter = 0, space = 0, shimmer = 0 }) {
    this.fx = { pitch, vocoder, flange, filter, space, shimmer };
    if (!this.initialized) return;
    const now = this.ctx.currentTime, tau = 0.045;

    const cutoff = 20000 * Math.pow(260 / 20000, Math.max(0, Math.min(1, filter)));
    this.subFilter.frequency.setTargetAtTime(cutoff, now, tau);
    this.subFilter.Q.setTargetAtTime(1.2 + filter * 4.5, now, tau);
    this.shimmerFilter.gain.setTargetAtTime(shimmer * 14, now, tau);

    const pitchNorm = Math.max(0, Math.min(1, pitch / 12));
    const ratio = Math.pow(2, pitch / 12);
    const pbRate = Math.max(0.05, (ratio - 1) / this._pitchWindowSec) * this._pitchBufSec;
    [this.pitchModA, this.pitchModB, this.pitchWinA, this.pitchWinB].forEach(s => s.playbackRate.setTargetAtTime(pbRate, now, tau));
    const pWet = Math.min(1, pitchNorm * 2.5);
    this.pitchWet.gain.setTargetAtTime(pWet, now, tau);
    this.pitchDry.gain.setTargetAtTime(1 - pWet * 0.9, now, tau);

    this.vocWet.gain.setTargetAtTime(vocoder * 0.95, now, tau);
    this.vocDry.gain.setTargetAtTime(1 - vocoder * 0.72, now, tau);
    this.vocCarrier.frequency.setTargetAtTime(95 + vocoder * 145, now, tau);
    this.vocFormant.frequency.setTargetAtTime(700 + vocoder * 1200, now, tau);

    this.flangeWet.gain.setTargetAtTime(flange * 0.85, now, tau);
    this.flangeFeedback.gain.setTargetAtTime(0.35 + flange * 0.52, now, tau);
    this.flangeLfo.frequency.setTargetAtTime(0.25 + flange * 2.2, now, tau);

    this.spaceWet.gain.setTargetAtTime(space * 0.95, now, tau);
    this.delayFbL.gain.setTargetAtTime(0.32 + space * 0.36, now, tau);
    this.delayFbR.gain.setTargetAtTime(0.32 + space * 0.36, now, tau);

    if (this.micGateAnalyser && this.micGateGain) {
      this.micGateAnalyser.getFloatTimeDomainData(this.micBuffer);
      let sum = 0;
      for (let i = 0; i < this.micBuffer.length; i++) sum += this.micBuffer[i] * this.micBuffer[i];
      const db = 20 * Math.log10(Math.max(Math.sqrt(sum / this.micBuffer.length), 1e-6));
      const open = db > this.micGateThresholdDb ? 1.0 : 0.0;
      this.micGateGain.gain.setTargetAtTime(open, now, open ? 0.015 : 0.09);
    }
  }

  setBypass(enabled) {
    this.bypass = enabled;
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    this.bypassDry.gain.setTargetAtTime(enabled ? 1 : 0, now, 0.02);
    this.fxOutput.gain.setTargetAtTime(enabled ? 0 : 1, now, 0.02);
  }

  setMute(muted) {
    this.muted = muted;
    if (!this.initialized) return;
    this.masterGain.gain.setTargetAtTime(muted ? 0 : this.masterVolume, this.ctx.currentTime, 0.015);
  }

  setMasterVolume(vol) {
    this.masterVolume = vol;
    if (!this.initialized || this.muted) return;
    this.masterGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.03);
  }

  stopAllSources(except = null) {
    if (except !== 'synth') this.stopSynth();
    if (except !== 'file' && !this.audioEl.paused) this.audioEl.pause();
    if (except !== 'tab') this.stopTabCapture();
    if (except !== 'mic') this.stopMic();
  }

  /* ===================== INTO DARKNESS PROCEDURAL SCORE ===================== */

  setGroove(groove) {
    this.synthGroove = groove;
    this.synthStep = 0;
  }

  async startSynth() {
    await this.init();
    this.stopAllSources('synth');
    if (this.synthPlaying) return;
    this.synthPlaying = true;
    this.activeSource = 'synth';
    this.synthStep = 0;

    const triggerStep = () => {
      if (!this.synthPlaying || !this.ctx) return;
      const now = this.ctx.currentTime;

      if (this.synthGroove === 'enterprise') {
        // Heroic Into Darkness orchestral brass + pulsing bass ostinato
        const ostinato = [146.83, 146.83, 174.61, 146.83, 220.0, 196.0, 174.61, 164.81];
        const hornMelody = [293.66, 0, 0, 440.0, 392.0, 0, 349.23, 329.63];
        this._playVoice(ostinato[this.synthStep % ostinato.length], 'sawtooth', 0.14, 0.23, 720, now);
        const hFreq = hornMelody[this.synthStep % hornMelody.length];
        if (hFreq > 0) {
          this._playVoice(hFreq, 'sawtooth', 0.11, 0.65, 1350, now);
          this._playVoice(hFreq * 1.004, 'triangle', 0.09, 0.65, 1500, now);
        }
      } else if (this.synthGroove === 'cyber') {
        // Section 31 Dark Industrial Cyber-Trek bass + cold neon arpeggio
        const bass = [55.0, 55.0, 65.41, 55.0, 73.42, 55.0, 82.41, 61.74];
        const arp  = [220.0, 0, 261.63, 329.63, 0, 293.66, 261.63, 246.94];
        this._playVoice(bass[this.synthStep % bass.length], 'sawtooth', 0.23, 0.19, 620, now);
        const aFreq = arp[this.synthStep % arp.length];
        if (aFreq > 0) this._playVoice(aFreq, 'square', 0.08, 0.16, 2400, now);
      } else {
        // VOID RIDER Cosmic Synthwave D-minor Arpeggio + Sub
        const arp = [293.66, 349.23, 440.0, 523.25, 587.33, 523.25, 440.0, 349.23];
        const bass = [73.42, 73.42, 87.31, 65.41];
        this._playVoice(arp[this.synthStep % arp.length], 'sawtooth', 0.13, 0.23, 1850, now);
        if (this.synthStep % 4 === 0) {
          this._playVoice(bass[Math.floor(this.synthStep / 4) % bass.length], 'triangle', 0.22, 0.85, 480, now);
        }
      }
      this.synthStep++;
    };

    triggerStep();
    this.synthTimer = setInterval(triggerStep, 250);
  }

  _playVoice(freq, type, gainPeak, duration, filterHz, now) {
    const osc = this.ctx.createOscillator();
    const flt = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(filterHz, now);
    flt.frequency.exponentialRampToValueAtTime(Math.max(110, filterHz * 0.28), now + duration);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(gainPeak, now + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(flt); flt.connect(env); env.connect(this.inputBus);
    osc.start(now); osc.stop(now + duration + 0.05);
  }

  stopSynth() {
    this.synthPlaying = false;
    if (this.synthTimer) { clearInterval(this.synthTimer); this.synthTimer = null; }
    if (this.activeSource === 'synth') this.activeSource = 'none';
  }

  async loadFile(file) {
    await this.init();
    this.stopAllSources('file');
    if (this.fileObjectUrl) URL.revokeObjectURL(this.fileObjectUrl);
    this.fileObjectUrl = URL.createObjectURL(file);
    this.audioEl.src = this.fileObjectUrl;
    if (!this.fileSourceNode) {
      this.fileSourceNode = this.ctx.createMediaElementSource(this.audioEl);
      this.fileSourceNode.connect(this.inputBus);
    }
    await this.audioEl.play();
    this.activeSource = 'file';
    return file.name;
  }

  async toggleFilePlay() {
    await this.init();
    if (this.audioEl.paused) {
      this.stopAllSources('file');
      await this.audioEl.play();
      this.activeSource = 'file';
      return true;
    }
    this.audioEl.pause();
    return false;
  }

  async startTabCapture() {
    await this.init();
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    stream.getVideoTracks().forEach(t => t.stop());
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) throw new Error('Spunta "Condividi audio scheda" nella finestra di selezione!');
    this.stopAllSources('tab');
    this.tabStream = stream;
    this.tabSourceNode = this.ctx.createMediaStreamSource(stream);
    this.tabSourceNode.connect(this.inputBus);
    this.activeSource = 'tab';
    audioTracks[0].addEventListener('ended', () => this.stopTabCapture());
  }

  stopTabCapture() {
    if (this.tabSourceNode) { try { this.tabSourceNode.disconnect(); } catch (_) {} this.tabSourceNode = null; }
    if (this.tabStream) { this.tabStream.getTracks().forEach(t => t.stop()); this.tabStream = null; }
    if (this.activeSource === 'tab') this.activeSource = 'none';
  }

  async startMic(gainDb = 4, gateDb = -38) {
    await this.init();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
    this.stopAllSources('mic');
    this.micStream = stream;
    this.micSourceNode = this.ctx.createMediaStreamSource(stream);
    this.micGateAnalyser = this.ctx.createAnalyser();
    this.micGateAnalyser.fftSize = 256;
    this.micGateGain = this.ctx.createGain();
    this.micGainNode = this.ctx.createGain();
    this.micGainNode.gain.value = Math.pow(10, gainDb / 20);
    this.micGateThresholdDb = gateDb;
    const antiLarsen = this.ctx.createBiquadFilter();
    antiLarsen.type = 'highshelf'; antiLarsen.frequency.value = 6000; antiLarsen.gain.value = -8;
    this.micSourceNode.connect(this.micGateAnalyser);
    this.micSourceNode.connect(this.micGateGain);
    this.micGateGain.connect(this.micGainNode);
    this.micGainNode.connect(antiLarsen);
    antiLarsen.connect(this.inputBus);
    this.activeSource = 'mic';
  }

  setMicGainDb(db) { if (this.micGainNode && this.ctx) this.micGainNode.gain.setTargetAtTime(Math.pow(10, db / 20), this.ctx.currentTime, 0.03); }
  setMicGateDb(db) { this.micGateThresholdDb = db; }
  stopMic() {
    if (this.micSourceNode) { try { this.micSourceNode.disconnect(); } catch (_) {} this.micSourceNode = null; }
    if (this.micStream) { this.micStream.getTracks().forEach(t => t.stop()); this.micStream = null; }
    this.micGateAnalyser = null; this.micGateGain = null; this.micGainNode = null;
    if (this.activeSource === 'mic') this.activeSource = 'none';
  }

  getMetrics() {
    if (!this.initialized || !this.analyser) return { db: -Infinity, level: 0, bass: 0, wave: this.waveBuffer, fft: this.fftBuffer };
    this.analyser.getFloatTimeDomainData(this.waveBuffer);
    this.analyser.getByteFrequencyData(this.fftBuffer);
    let sum = 0;
    for (let i = 0; i < this.waveBuffer.length; i++) sum += this.waveBuffer[i] * this.waveBuffer[i];
    const rms = Math.sqrt(sum / this.waveBuffer.length);
    const db = rms > 1e-6 ? 20 * Math.log10(rms) : -Infinity;
    const level = Math.max(0, Math.min(1, (db + 48) / 44));
    let bassSum = 0;
    for (let i = 1; i <= 8; i++) bassSum += this.fftBuffer[i];
    return { db, level, bass: bassSum / (8 * 255), wave: this.waveBuffer, fft: this.fftBuffer };
  }
}
