/**
 * VOID RIDER MK-II // MediaPipe Face Landmarker + Mouse Simulator
 * Tracks 478 neural landmarks, 52 ARKit blendshapes, and true normalized head pose
 * with 1-click zero calibration and graceful simulator fallback.
 */

const VISION_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export class FaceTracker {
  constructor(videoEl) {
    this.video = videoEl;
    this.landmarker = null;
    this.stream = null;
    this.ready = false;
    this.simMode = false;
    this.lastVideoTime = -1;

    // Calibration offsets
    this.zeroYaw = 0;
    this.zeroPitch = 0;

    // Raw & smoothed pose + expression state
    this.raw = { yaw: 0, pitch: 0, roll: 0, jawOpen: 0, browUp: 0 };
    this.state = {
      detected: false,
      yaw: 0,       // -1 (left) .. +1 (right)
      pitch: 0,     // -1 (down) .. +1 (up)
      roll: 0,      // radians
      jawOpen: 0,   // 0..1
      browUp: 0,    // 0..1
      noseX: 0.5,   // normalized 0..1 (unmirrored video space)
      noseY: 0.5,
      landmarks: null
    };

    // Mouse simulator state
    this.mouse = { x: 0, y: 0, down: false, shift: false };
    this._bindMouseSim();
  }

  _bindMouseSim() {
    window.addEventListener('pointermove', (e) => {
      if (!this.simMode) return;
      this.mouse.x = ((e.clientX / window.innerWidth) - 0.5) * 2;
      this.mouse.y = -((e.clientY / window.innerHeight) - 0.5) * 2;
    });
    window.addEventListener('pointerdown', (e) => {
      if (!this.simMode) return;
      if (e.target.closest('button, input, aside, header, footer, #boot-screen, #flight-manual')) return;
      this.mouse.down = true;
    });
    window.addEventListener('pointerup', () => {
      this.mouse.down = false;
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') this.mouse.shift = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') this.mouse.shift = false;
    });
  }

  async initCameraAndModel(onStatus = () => {}) {
    onStatus('Richiesta accesso alla webcam...');
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false
    });

    this.video.srcObject = this.stream;
    await new Promise((resolve) => {
      this.video.onloadedmetadata = () => {
        this.video.play();
        resolve();
      };
    });

    onStatus('Caricamento rete neurale MediaPipe Face Landmarker...');
    const vision = await import(`${VISION_CDN}/+esm`);
    const filesetResolver = await vision.FilesetResolver.forVisionTasks(`${VISION_CDN}/wasm`);

    this.landmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    this.ready = true;
    this.simMode = false;
    onStatus('Rete neurale agganciata.');
  }

  enableSimMode(enabled) {
    this.simMode = enabled;
    if (enabled) {
      this.ready = true;
    }
  }

  calibrateZero() {
    this.zeroYaw = this.raw.yaw;
    this.zeroPitch = this.raw.pitch;
  }

  update(nowMs) {
    if (this.simMode) {
      this.state.detected = true;
      this.state.yaw = this._lerp(this.state.yaw, this.mouse.x, 0.16);
      this.state.pitch = this._lerp(this.state.pitch, this.mouse.y, 0.16);
      this.state.roll = this._lerp(this.state.roll, this.mouse.x * 0.15, 0.12);
      this.state.jawOpen = this._lerp(this.state.jawOpen, this.mouse.down ? 0.95 : 0, 0.18);
      this.state.browUp = this._lerp(this.state.browUp, this.mouse.shift ? 0.9 : 0, 0.18);
      this.state.noseX = 0.5 - this.state.yaw * 0.2;
      this.state.noseY = 0.5 - this.state.pitch * 0.2;
      this.state.landmarks = null;
      return this.state;
    }

    if (!this.ready || !this.landmarker || this.video.readyState < 2) {
      return this.state;
    }

    if (this.video.currentTime === this.lastVideoTime) {
      return this.state;
    }
    this.lastVideoTime = this.video.currentTime;

    const results = this.landmarker.detectForVideo(this.video, nowMs);

    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
      const lm = results.faceLandmarks[0];
      this.state.detected = true;
      this.state.landmarks = lm;

      // Nose tip (index 1)
      const nose = lm[1];
      this.state.noseX = nose.x;
      this.state.noseY = nose.y;

      // Compute head pose from 4x4 transformation matrix if available, else robust landmark geometry
      let rawYaw = 0;
      let rawPitch = 0;
      let rawRoll = 0;

      if (results.facialTransformationMatrixes && results.facialTransformationMatrixes.length > 0) {
        const m = results.facialTransformationMatrixes[0].data;
        // Column-major 4x4 rotation matrix -> Euler angles (radians)
        // Mirrored webcam: turning user's head to their right yields positive yaw
        const sy = Math.sqrt(m[0] * m[0] + m[1] * m[1]);
        const pitchRad = Math.atan2(-m[6], m[10]); // + = looking up
        const yawRad = Math.atan2(m[8], sy);       // + = turning right
        const rollRad = Math.atan2(m[1], m[0]);

        // Combine head rotation + slight screen position so both turning & leaning work naturally!
        const posYaw = (0.5 - nose.x) * 1.4;
        const posPitch = (0.5 - nose.y) * 1.2;

        rawYaw = Math.max(-1.2, Math.min(1.2, (yawRad / 0.52) * 0.65 + posYaw * 0.55));
        rawPitch = Math.max(-1.2, Math.min(1.2, (pitchRad / 0.42) * 0.65 + posPitch * 0.55));
        rawRoll = rollRad;
      } else {
        rawYaw = (0.5 - nose.x) * 2.4;
        rawPitch = (0.5 - nose.y) * 2.4;
      }

      // Extract ARKit blendshapes (jawOpen & browInnerUp)
      let jawOpen = 0;
      let browUp = 0;
      if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
        const cats = results.faceBlendshapes[0].categories;
        for (let i = 0; i < cats.length; i++) {
          const name = cats[i].categoryName;
          if (name === 'jawOpen') jawOpen = cats[i].score;
          else if (name === 'browInnerUp') browUp = Math.max(browUp, cats[i].score);
          else if (name === 'browOuterUpLeft' || name === 'browOuterUpRight') {
            browUp = Math.max(browUp, cats[i].score * 0.9);
          }
        }
      } else {
        // Fallback: normalized lip distance / face height
        const faceH = Math.hypot(lm[10].x - lm[152].x, lm[10].y - lm[152].y) || 0.25;
        const mouthD = Math.hypot(lm[13].x - lm[14].x, lm[13].y - lm[14].y);
        jawOpen = Math.max(0, Math.min(1, (mouthD / faceH - 0.04) / 0.22));
      }

      this.raw = { yaw: rawYaw, pitch: rawPitch, roll: rawRoll, jawOpen, browUp };

      const calYaw = Math.max(-1, Math.min(1, rawYaw - this.zeroYaw));
      const calPitch = Math.max(-1, Math.min(1, rawPitch - this.zeroPitch));

      // Smooth filtering (zero jitter)
      this.state.yaw = this._lerp(this.state.yaw, calYaw, 0.22);
      this.state.pitch = this._lerp(this.state.pitch, calPitch, 0.22);
      this.state.roll = this._lerp(this.state.roll, rawRoll, 0.18);
      this.state.jawOpen = this._lerp(this.state.jawOpen, jawOpen, 0.28);
      this.state.browUp = this._lerp(this.state.browUp, browUp, 0.25);
    } else {
      this.state.detected = false;
      this.state.landmarks = null;
      // Gently return to neutral if face leaves frame
      this.state.yaw = this._lerp(this.state.yaw, 0, 0.08);
      this.state.pitch = this._lerp(this.state.pitch, 0, 0.08);
      this.state.jawOpen = this._lerp(this.state.jawOpen, 0, 0.12);
      this.state.browUp = this._lerp(this.state.browUp, 0, 0.12);
    }

    return this.state;
  }

  _lerp(a, b, t) {
    return a + (b - a) * t;
  }
}
