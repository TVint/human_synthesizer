/**
 * VOID RIDER TRILOGY // Unified 60FPS Real-Time Multi-Theme Bridge Renderer
 * Supports instant live hot-swapping between:
 *  - 'void'       : Void Rider MK-II (Spiral Galaxy, Pulsars, Comets, Plasma Synapses)
 *  - 'enterprise' : USS Enterprise NCC-1701 (Into Darkness 2013: Orbiting Planet Loop, Kelvin Warp, LCARS, Crew, Anamorphic Flares)
 *  - 'cyber'      : USS Vengeance / Section 31 (Matrix Data Rain Loop, Obsidian Steel Bridge, Radiation Chamber Visor, Cyber-Crew)
 * Automatically scales particle density in `liteMode` for smooth 60fps on smartphones.
 */

const SILHOUETTE_IDX = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
];
const LIPS_IDX = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

export class UnifiedRenderer {
  constructor(canvas, videoEl, { liteMode = false, showVisor = true } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.video = videoEl;
    this.liteMode = liteMode;
    this.showVisor = showVisor;

    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, liteMode ? 1.5 : 2);
    this.frame = 0;
    this.camDX = 0;
    this.camDY = 0;

    this.stars = [];
    this.matrixDrops = [];
    this.comets = [];
    this.resize();
    this._initEntities();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  _initEntities() {
    const starCount = this.liteMode ? 160 : 380;
    this.stars = Array.from({ length: starCount }, () => {
      const z = Math.random() * this.w + 1;
      return { x: (Math.random() - 0.5) * this.w * 2, y: (Math.random() - 0.5) * this.h * 2, z, pz: z };
    });

    const cols = this.liteMode ? 22 : 48;
    this.matrixDrops = Array.from({ length: cols }, (_, i) => ({
      x: (i / cols) * this.w + Math.random() * 14,
      y: Math.random() * this.h,
      speed: 2 + Math.random() * 4.5,
      len: 40 + Math.random() * 90
    }));

    this.comets = Array.from({ length: this.liteMode ? 2 : 5 }, () => this._makeComet());
  }

  _makeComet() {
    const a = Math.random() * Math.PI * 2;
    const r = Math.max(this.w, this.h) * 0.9;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    const tx = (Math.random() - 0.5) * this.w * 0.4, ty = (Math.random() - 0.5) * this.h * 0.4;
    const d = Math.hypot(tx - x, ty - y) || 1;
    const speed = 12 + Math.random() * 18;
    return { x, y, vx: ((tx - x) / d) * speed, vy: ((ty - y) / d) * speed, speed, len: 70 + Math.random() * 120 };
  }

  render({ theme = 'enterprise', active, face, fx, metrics, simMode, redAlert }) {
    this.frame++;
    const ctx = this.ctx;
    const cx = this.w / 2;
    const cy = this.h / 2;
    const px = active ? -face.yaw * (this.liteMode ? 14 : 26) : 0;
    const py = active ? face.pitch * (this.liteMode ? 10 : 18) : 0;

    // 1. Background Base + Period-Authentic Animated Video-Like Loop
    ctx.fillStyle = theme === 'cyber' ? '#020408' : (theme === 'enterprise' ? '#020711' : '#02050d');
    ctx.fillRect(0, 0, this.w, this.h);

    if (theme === 'void') {
      this._drawVoidLoop(ctx, cx, cy, px, py, fx, metrics.bass, redAlert);
    } else if (theme === 'enterprise') {
      this._drawEnterpriseLoop(ctx, cx, cy, px, py, fx, metrics.bass, redAlert);
    } else {
      this._drawCyberLoop(ctx, cx, cy, px, py, fx, metrics.bass, redAlert);
    }

    if (!active || !this.showVisor) return;

    // 2. Central Visor (adapts dynamically to desktop vs smartphone portrait!)
    const isPortrait = this.h > this.w;
    const visorH = isPortrait
      ? Math.min(270, this.h * 0.32)
      : Math.min(390, Math.max(245, this.h * 0.46));
    const visorW = Math.min(this.w * 0.82, visorH * 0.88);
    const visorY = isPortrait ? cy - this.h * 0.12 : cy - 28;

    ctx.save();
    ctx.translate(cx, visorY);
    if (!this.liteMode) this._drawRadialSpectrum(ctx, metrics.fft, visorW, visorH, theme, redAlert);
    this._drawVisor(ctx, visorW, visorH, theme, face, fx, metrics, simMode, redAlert);
    ctx.restore();

    // 3. Oscilloscope
    if (!isPortrait) {
      this._drawOscilloscope(ctx, cx, this.h - 122, Math.min(430, this.w * 0.34), metrics.wave, theme, redAlert);
    }
  }

  /* ===================== THEME 1: VOID RIDER LOOP ===================== */
  _drawVoidLoop(ctx, cx, cy, px, py, fx, bass, redAlert) {
    // Rotating Spiral Galaxy Nebula Loop
    ctx.save();
    ctx.translate(cx + px * 0.4, cy + py * 0.4);
    ctx.rotate(this.frame * 0.0025);
    for (let arm = 0; arm < 3; arm++) {
      ctx.rotate((Math.PI * 2) / 3);
      const g = ctx.createRadialGradient(80, 0, 10, 120, 0, Math.max(this.w, this.h) * 0.48);
      g.addColorStop(0, redAlert ? 'rgba(255, 23, 68, 0.22)' : `rgba(0, 245, 255, ${0.14 + bass * 0.1})`);
      g.addColorStop(0.5, `rgba(180, 20, 220, ${0.09 + fx.vocoder * 0.12})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(110, 0, this.w * 0.38, this.h * 0.16, 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 3D Warp Stars + Comets
    ctx.save();
    ctx.translate(cx + px, cy + py);
    this._drawStars(ctx, 2.0 + fx.flange * 72 + bass * 12, fx.flange, 'void', redAlert);
    for (const c of this.comets) {
      c.x += c.vx; c.y += c.vy;
      if (Math.hypot(c.x, c.y) > Math.max(this.w, this.h) * 1.2) Object.assign(c, this._makeComet());
      const g = ctx.createLinearGradient(c.x, c.y, c.x - c.vx * 4, c.y - c.vy * 4);
      g.addColorStop(0, 'rgba(210, 255, 255, 0.85)');
      g.addColorStop(1, 'rgba(0, 245, 255, 0)');
      ctx.strokeStyle = g; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x - c.vx * 4, c.y - c.vy * 4); ctx.stroke();
    }
    ctx.restore();

    // Synthwave Horizon Grid at Bottom
    const floorY = this.h * 0.76 + py * 0.3;
    ctx.strokeStyle = redAlert ? 'rgba(255, 23, 68, 0.22)' : 'rgba(0, 245, 255, 0.18)';
    ctx.lineWidth = 1.2;
    const scroll = (this.frame * (1 + fx.flange * 4)) % 28;
    for (let y = floorY + scroll; y < this.h; y += 28) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.w, y); ctx.stroke();
    }
    for (let i = -8; i <= 8; i++) {
      ctx.beginPath(); ctx.moveTo(cx + i * 50 + px, floorY); ctx.lineTo(cx + i * 200 + px, this.h); ctx.stroke();
    }
  }

  /* ===================== THEME 2: ENTERPRISE NCC-1701 LOOP ===================== */
  _drawEnterpriseLoop(ctx, cx, cy, px, py, fx, bass, redAlert) {
    // Looping Orbiting Alien Planet (Nibiru / Vulcan horizon) behind Main Viewscreen
    ctx.save();
    const orbitX = cx + Math.sin(this.frame * 0.004) * (this.w * 0.18) + px * 0.35;
    const orbitY = this.h * 0.34 + Math.cos(this.frame * 0.003) * 18 + py * 0.3;
    const pr = Math.min(this.w, this.h) * 0.18;
    const pGrad = ctx.createRadialGradient(orbitX - pr * 0.35, orbitY - pr * 0.3, pr * 0.1, orbitX, orbitY, pr);
    pGrad.addColorStop(0, redAlert ? 'rgba(255, 90, 90, 0.45)' : 'rgba(120, 225, 255, 0.42)');
    pGrad.addColorStop(0.55, redAlert ? 'rgba(130, 22, 32, 0.35)' : 'rgba(22, 85, 145, 0.32)');
    pGrad.addColorStop(1, 'rgba(2, 7, 17, 0)');
    ctx.fillStyle = pGrad;
    ctx.beginPath(); ctx.arc(orbitX, orbitY, pr, 0, Math.PI * 2); ctx.fill();

    // Planetary Ring
    ctx.strokeStyle = redAlert ? 'rgba(255, 110, 120, 0.28)' : 'rgba(160, 232, 255, 0.28)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(orbitX, orbitY, pr * 1.65, pr * 0.28, -0.22, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // Kelvin Warp Stars + Rings
    ctx.save();
    ctx.translate(cx + px * 0.85, cy - 30 + py * 0.85);
    if (fx.flange > 0.22) {
      for (let i = 0; i < 5; i++) {
        const prog = ((this.frame * 0.045 + i / 5) % 1);
        const r = prog * Math.max(this.w, this.h) * 0.65;
        ctx.strokeStyle = redAlert ? `rgba(255, 70, 90, ${(1 - prog) * 0.45})` : `rgba(90, 220, 255, ${(1 - prog) * 0.45})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    this._drawStars(ctx, 2.2 + fx.flange * 88 + bass * 14, fx.flange, 'enterprise', redAlert);
    ctx.restore();

    // Overhead Glowing Cyan Bridge Ceiling Ring
    ctx.save();
    ctx.translate(cx + px * 0.35, 16 + py * 0.25);
    ctx.strokeStyle = 'rgba(230, 244, 255, 0.34)'; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.ellipse(0, 0, this.w * 0.25, 34, 0, 0, Math.PI); ctx.stroke();
    ctx.strokeStyle = redAlert ? '#e62639' : '#4ce4ff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(0, 0, this.w * 0.215, 26, 0, 0, Math.PI); ctx.stroke();
    ctx.restore();

    // Warm Burgundy Deck + Backlit White Trapezoidal Panels
    const floorY = this.h * 0.77 + py * 0.35;
    const fGrad = ctx.createLinearGradient(0, floorY, 0, this.h);
    fGrad.addColorStop(0, 'rgba(46, 15, 20, 0)');
    fGrad.addColorStop(0.35, 'rgba(54, 18, 22, 0.72)');
    fGrad.addColorStop(1, 'rgba(16, 7, 10, 0.96)');
    ctx.fillStyle = fGrad;
    ctx.fillRect(0, floorY, this.w, this.h - floorY);

    if (!this.liteMode && this.w > 780) {
      // Backlit floor panels + animated crew (Sulu, Chekov, Spock, Uhura)
      [-0.24, -0.12, 0.12, 0.24].forEach(off => {
        ctx.fillStyle = redAlert ? 'rgba(255, 80, 95, 0.2)' : 'rgba(225, 245, 255, 0.2)';
        ctx.beginPath();
        ctx.moveTo(cx + this.w * off - 28 + px * 0.5, floorY + 24);
        ctx.lineTo(cx + this.w * off + 28 + px * 0.5, floorY + 24);
        ctx.lineTo(cx + this.w * off * 1.2 + 46 + px * 0.5, this.h - 14);
        ctx.lineTo(cx + this.w * off * 1.2 - 46 + px * 0.5, this.h - 14);
        ctx.closePath(); ctx.fill();
      });
      this._drawCrewSilhouettes(ctx, 'enterprise', px * 0.55, py * 0.4, fx, bass, redAlert);
    }

    // J.J. Abrams Anamorphic Horizontal Blue Lens Flare
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const fxY = this.h * 0.26 + py * 0.4;
    const fw = this.w * 0.78;
    const g = ctx.createLinearGradient(cx - fw / 2, fxY, cx + fw / 2, fxY);
    const col = redAlert ? '255, 60, 80' : '56, 217, 255';
    g.addColorStop(0, `rgba(${col}, 0)`);
    g.addColorStop(0.5, `rgba(225, 248, 255, ${0.32 + fx.flange * 0.4 + bass * 0.2})`);
    g.addColorStop(1, `rgba(${col}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(cx - fw / 2, fxY - 3, fw, 6);
    ctx.restore();
  }

  /* ===================== THEME 3: SECTION 31 CYBER-TREK LOOP ===================== */
  _drawCyberLoop(ctx, cx, cy, px, py, fx, bass, redAlert) {
    // Cascading Section 31 Encrypted Matrix Data Rain Loop
    ctx.save();
    for (const d of this.matrixDrops) {
      d.y += d.speed * (1 + fx.flange * 2.5);
      if (d.y - d.len > this.h) { d.y = -20; d.x = Math.random() * this.w; }
      const g = ctx.createLinearGradient(d.x, d.y - d.len, d.x, d.y);
      g.addColorStop(0, 'rgba(0, 229, 255, 0)');
      g.addColorStop(1, redAlert ? 'rgba(255, 30, 66, 0.35)' : 'rgba(0, 229, 255, 0.28)');
      ctx.strokeStyle = g; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(d.x, d.y - d.len); ctx.lineTo(d.x, d.y); ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(cx + px, cy - 30 + py);
    this._drawStars(ctx, 2.2 + fx.flange * 82 + bass * 12, fx.flange, 'cyber', redAlert);
    ctx.restore();

    // Heavy Dark Steel Columns + Vertical LED Strips
    if (this.w > 640) {
      [this.w * 0.14, this.w * 0.86].forEach(colX => {
        ctx.fillStyle = 'rgba(8, 13, 20, 0.82)';
        ctx.fillRect(colX - 20 + px * 0.4, 0, 40, this.h);
        ctx.fillStyle = redAlert ? 'rgba(255, 30, 66, 0.8)' : 'rgba(180, 245, 255, 0.65)';
        for (let y = 70; y < this.h - 100; y += 64) ctx.fillRect(colX - 2 + px * 0.4, y, 4, 26);
      });
    }

    // Obsidian Glass Floor Grid
    const floorY = this.h * 0.77 + py * 0.35;
    ctx.fillStyle = 'rgba(3, 7, 12, 0.85)';
    ctx.fillRect(0, floorY, this.w, this.h - floorY);
    ctx.strokeStyle = redAlert ? 'rgba(255, 30, 66, 0.24)' : 'rgba(0, 229, 255, 0.18)';
    for (let i = -8; i <= 8; i++) {
      ctx.beginPath(); ctx.moveTo(cx + i * 55 + px * 0.5, floorY); ctx.lineTo(cx + i * 195 + px * 0.5, this.h); ctx.stroke();
    }

    if (!this.liteMode && this.w > 780) {
      this._drawCrewSilhouettes(ctx, 'cyber', px * 0.55, py * 0.4, fx, bass, redAlert);
    }
  }

  _drawStars(ctx, speed, flange, theme, redAlert) {
    for (const s of this.stars) {
      s.z -= speed;
      if (s.z < 1) { s.z = this.w; s.pz = s.z; s.x = (Math.random() - 0.5) * this.w * 2; s.y = (Math.random() - 0.5) * this.h * 2; }
      const sx = (s.x / s.z) * this.w * 0.55, sy = (s.y / s.z) * this.h * 0.55;
      const px = (s.x / s.pz) * this.w * 0.55, py = (s.y / s.pz) * this.h * 0.55;
      s.pz = s.z;
      const d = 1 - s.z / this.w;
      ctx.strokeStyle = redAlert ? `rgba(255, 70, 90, ${d})` : (theme === 'cyber' && flange > 0.2 ? `rgba(10, 255, 210, ${d})` : `rgba(215, 245, 255, ${d * 0.9})`);
      ctx.lineWidth = Math.max(0.7, d * (2.1 + flange * 2.6));
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx, sy); ctx.stroke();
    }
  }

  _drawCrewSilhouettes(ctx, theme, px, py, fx, bass, redAlert) {
    const t = this.frame * 0.045;
    const w = this.w, h = this.h;
    const officers = theme === 'enterprise'
      ? [
          { x: w * 0.33, y: h - 118, col: '#d49a1a', hair: '#111', label: 'SULU · HELM', act: fx.flange },
          { x: w * 0.67, y: h - 118, col: '#d49a1a', hair: '#4a331f', label: 'CHEKOV · NAV', act: fx.filter },
          { x: w * 0.22, y: h * 0.66, col: '#1d72ab', hair: '#0c0d10', label: 'SPOCK · SCI', act: fx.vocoder, vulcan: true },
          { x: w * 0.78, y: h * 0.66, col: '#bc1e2e', hair: '#151010', label: 'UHURA · COMMS', act: fx.space }
        ]
      : [
          { x: w * 0.33, y: h - 118, col: '#142030', hair: null, label: '0718 · CYBER', act: fx.vocoder, implant: true },
          { x: w * 0.67, y: h - 118, col: '#12141a', hair: '#181414', label: 'S31 · TACTICAL', act: fx.flange },
          { x: w * 0.22, y: h * 0.66, col: '#2a0f18', hair: '#eef6ff', label: 'OVERRIDE', act: fx.shimmer },
          { x: w * 0.78, y: h * 0.66, col: '#00e5ff', hair: '#00aacc', label: 'HOLO-PRIME', act: fx.space, holo: true }
        ];

    for (const o of officers) {
      ctx.save();
      const bob = Math.sin(t * (1.2 + o.act * 2.5) + o.x) * (2 + o.act * 3);
      ctx.translate(o.x + px, o.y + py + bob);
      if (o.holo) ctx.globalAlpha = 0.5 + o.act * 0.4;
      ctx.fillStyle = o.col;
      ctx.beginPath(); ctx.moveTo(-24, 48); ctx.quadraticCurveTo(-22, 12, -10, 8); ctx.lineTo(10, 8); ctx.quadraticCurveTo(22, 12, 24, 48); ctx.closePath(); ctx.fill();
      ctx.fillStyle = o.holo ? '#66f2ff' : '#d4b29c';
      ctx.beginPath(); ctx.ellipse(0, -8, 10.5, 12.5, 0, 0, Math.PI * 2); ctx.fill();
      if (o.hair) { ctx.fillStyle = o.hair; ctx.beginPath(); ctx.arc(0, -12, 11, Math.PI * 0.92, Math.PI * 2.08); ctx.fill(); }
      if (o.implant) { ctx.fillStyle = '#0affd2'; ctx.fillRect(-3, -20, 6, 4); }
      ctx.fillStyle = o.act > 0.2 ? '#fff' : 'rgba(180, 225, 255, 0.58)';
      ctx.font = '600 9.5px "Share Tech Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(o.label, 0, 62);
      ctx.restore();
    }
  }

  _drawRadialSpectrum(ctx, fft, w, h, theme, redAlert) {
    const bars = 56, rx = w * 0.55, ry = h * 0.54;
    ctx.save();
    for (let i = 0; i < bars; i++) {
      const a = (i / bars) * Math.PI * 2 - Math.PI / 2;
      const val = (fft[Math.floor((i / bars) * (fft.length * 0.65))] || 0) / 255;
      const len = 3 + val * 24;
      ctx.strokeStyle = redAlert ? `rgba(255, 45, 75, ${0.25 + val * 0.75})`
        : (theme === 'cyber' ? `rgba(10, 255, 210, ${0.25 + val * 0.75})` : `rgba(56, 217, 255, ${0.25 + val * 0.75})`);
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * rx, Math.sin(a) * ry); ctx.lineTo(Math.cos(a) * (rx + len), Math.sin(a) * (ry + len)); ctx.stroke();
    }
    ctx.restore();
  }

  _octagon(ctx, w, h, cut = 24) {
    const hw = w / 2, hh = h / 2;
    ctx.beginPath();
    ctx.moveTo(-hw + cut, -hh); ctx.lineTo(hw - cut, -hh);
    ctx.lineTo(hw, -hh + cut);  ctx.lineTo(hw, hh - cut);
    ctx.lineTo(hw - cut, hh);   ctx.lineTo(-hw + cut, hh);
    ctx.lineTo(-hw, hh - cut);  ctx.lineTo(-hw, -hh + cut);
    ctx.closePath();
  }

  _drawVisor(ctx, w, h, theme, face, fx, metrics, simMode, redAlert) {
    ctx.save();
    this._octagon(ctx, w, h, 24);
    ctx.clip();
    ctx.fillStyle = 'rgba(3, 10, 22, 0.9)';
    ctx.fillRect(-w / 2, -h / 2, w, h);

    if (!simMode && this.video && this.video.readyState >= 2) {
      const vw = this.video.videoWidth || 640, vh = this.video.videoHeight || 480;
      const scaleF = Math.max(w / vw, h / vh) * 1.22;
      const drawW = vw * scaleF, drawH = vh * scaleF;
      if (face.detected) {
        this.camDX += (Math.max(-(drawW - w) / 2, Math.min((drawW - w) / 2, (face.noseX - 0.5) * drawW)) - this.camDX) * 0.14;
        this.camDY += (Math.max(-(drawH - h) / 2, Math.min((drawH - h) / 2, -(face.noseY - 0.5) * drawH)) - this.camDY) * 0.14;
      }
      ctx.save();
      ctx.translate(this.camDX, this.camDY);
      ctx.scale(-1, 1);
      ctx.drawImage(this.video, -drawW / 2, -drawH / 2, drawW, drawH);

      const g = ctx.createLinearGradient(-drawW / 2, -drawH / 2, drawW / 2, drawH / 2);
      g.addColorStop(0, redAlert ? 'rgba(95, 8, 18, 0.56)' : 'rgba(4, 20, 44, 0.5)');
      g.addColorStop(1, theme === 'cyber' ? 'rgba(0, 229, 255, 0.26)' : 'rgba(56, 217, 255, 0.25)');
      ctx.fillStyle = g;
      ctx.fillRect(-drawW / 2, -drawH / 2, drawW, drawH);

      if (face.landmarks) {
        const lm = face.landmarks;
        const gx = (i) => lm[i].x * drawW - drawW / 2;
        const gy = (i) => lm[i].y * drawH - drawH / 2;
        ctx.fillStyle = redAlert ? 'rgba(255, 70, 90, 0.7)' : 'rgba(56, 217, 255, 0.7)';
        for (let i = 0; i < lm.length; i += (this.liteMode ? 6 : 3)) ctx.fillRect(gx(i) - 1, gy(i) - 1, 2, 2);
        ctx.strokeStyle = theme === 'enterprise' ? '#f5c33b' : '#ff007f';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); SILHOUETTE_IDX.forEach((idx, n) => n === 0 ? ctx.moveTo(gx(idx), gy(idx)) : ctx.lineTo(gx(idx), gy(idx))); ctx.closePath(); ctx.stroke();
        ctx.strokeStyle = '#0affd2';
        ctx.beginPath(); LIPS_IDX.forEach((idx, n) => n === 0 ? ctx.moveTo(gx(idx), gy(idx)) : ctx.lineTo(gx(idx), gy(idx))); ctx.closePath(); ctx.stroke();
      }
      ctx.restore();
    } else {
      // Touch / Sim Interactive Reticle Core
      ctx.save();
      ctx.translate(face.yaw * (w * 0.26), -face.pitch * (h * 0.24));
      const r = 42 + metrics.bass * 18 + fx.space * 20;
      ctx.strokeStyle = redAlert ? '#ff1e42' : (theme === 'enterprise' ? '#f5c33b' : '#00f5ff');
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = theme === 'cyber' ? '#ff007f' : '#38d9ff';
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.15, r * 0.42, this.frame * 0.02, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // Section 31 Radiation Chamber Stencil Overlay when in 'cyber' theme
    if (theme === 'cyber') {
      ctx.fillStyle = redAlert ? 'rgba(255, 30, 66, 0.78)' : 'rgba(200, 240, 255, 0.3)';
      ctx.font = '700 18px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('DANGER', 0, -h / 2 + 28);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = (i / 6) < (0.3 + metrics.level * 0.7) ? 'rgba(255, 30, 66, 0.75)' : 'rgba(255, 30, 66, 0.14)';
        ctx.fillRect(-w / 2 + 10, -h / 2 + 52 + i * 15, 11, 6);
      }
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = redAlert ? '#ff1e42' : (theme === 'enterprise' ? 'rgba(215, 242, 255, 0.85)' : '#00f5ff');
    ctx.lineWidth = 3;
    this._octagon(ctx, w, h, 24);
    ctx.stroke();
    ctx.restore();
  }

  _drawOscilloscope(ctx, cx, cy, width, wave, theme, redAlert) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = redAlert ? '#ff1e42' : (theme === 'cyber' ? '#0affd2' : '#38d9ff');
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < wave.length; i++) {
      const x = -width / 2 + (i / (wave.length - 1)) * width;
      const y = Math.max(-16, Math.min(16, wave[i] * 46));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
}
