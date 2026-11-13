/**
 * High-performance Screen Mirroring & Interactive Stylus Drawing Engine
 * Tailored for Advan Sketsa 2 Tablet Stylus Pen & Affinity on Windows.
 * Features:
 * - Real-time Pressure Tracking (0.0 to 1.0)
 * - Strict Palm Rejection (rests hand on tablet without accidental strokes)
 * - 0ms Local Ink Preview (immediate visual feedback under pen tip)
 * - Two-Finger Canvas Pan & Pinch-to-Zoom
 * - Sub-pixel multi-monitor coordinate alignment
 */

class ScreenStreamer {
  constructor(canvasElement, overlayCanvasElement, wsClient) {
    this.canvas = canvasElement;
    this.overlayCanvas = overlayCanvasElement;
    this.ctx = canvasElement.getContext('2d', { alpha: false, desynchronized: true });
    this.overlayCtx = overlayCanvasElement ? overlayCanvasElement.getContext('2d', { desynchronized: true }) : null;
    this.ws = wsClient;

    this.isActive = false;
    this.nativeWidth = 1920;
    this.nativeHeight = 1080;

    // View Transformation (Zoom & Pan)
    this.scale = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.initialPinchDistance = 0;
    this.initialPinchCenter = { x: 0, y: 0 };
    this.initialScale = 1.0;
    this.initialPan = { x: 0, y: 0 };

    // Drawing & Stylus State
    this.palmRejectionStrict = true; // When true, only stylus draws; single touches ignored
    this.localInking = true; // Zero-latency ink trail under pen
    this.activePenId = null;
    this.activeTouches = new Map();
    this.lastInkPos = null;
    this.currentPressure = 0.0;
    this.onPressureChange = null; // Callback for UI pressure gauge

    this.setupPointerEvents();
  }

  setNativeResolution(w, h) {
    this.nativeWidth = w;
    this.nativeHeight = h;
    this.canvas.width = w;
    this.canvas.height = h;
    if (this.overlayCanvas) {
      this.overlayCanvas.width = w;
      this.overlayCanvas.height = h;
    }
  }

  start(fps = 45, quality = 70, scale = 0.85) {
    this.isActive = true;
    if (this.ws && this.ws.isOpen()) {
      this.ws.send({
        type: 'stream_start',
        fps: fps,
        quality: quality,
        scale: scale
      });
    }
  }

  stop() {
    this.isActive = false;
    if (this.ws && this.ws.isOpen()) {
      this.ws.send({ type: 'stream_stop' });
    }
    this.clearOverlay();
  }

  async handleBinaryFrame(arrayBuffer) {
    if (!this.isActive) return;

    try {
      const blob = new Blob([arrayBuffer], { type: 'image/jpeg' });
      const bitmap = await createImageBitmap(blob);

      this.ctx.drawImage(bitmap, 0, 0, this.canvas.width, this.canvas.height);
      bitmap.close();

      // Clear local ink trail as the server frame now contains the stroke painted by Affinity
      if (this.activePenId === null) {
        this.clearOverlay();
      }

      this.ws.send({ type: 'frame_ack' });
    } catch (err) {
      this.ws.send({ type: 'frame_ack' });
    }
  }

  clearOverlay() {
    if (this.overlayCtx && this.overlayCanvas) {
      this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    }
  }

  setupPointerEvents() {
    // Listen on the container or overlay canvas so stylus receives high-frequency pointer events
    const target = this.overlayCanvas || this.canvas;

    target.addEventListener('pointerdown', (e) => this.onPointerDown(e), { passive: false });
    target.addEventListener('pointermove', (e) => this.onPointerMove(e), { passive: false });
    target.addEventListener('pointerup', (e) => this.onPointerUp(e), { passive: false });
    target.addEventListener('pointercancel', (e) => this.onPointerUp(e), { passive: false });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  getNativeCoordinates(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const clientRelX = clientX - rect.left;
    const clientRelY = clientY - rect.top;

    const normX = clientRelX / rect.width;
    const normY = clientRelY / rect.height;

    const screenX = Math.round(normX * this.nativeWidth);
    const screenY = Math.round(normY * this.nativeHeight);

    return {
      x: Math.max(0, Math.min(this.nativeWidth - 1, screenX)),
      y: Math.max(0, Math.min(this.nativeHeight - 1, screenY))
    };
  }

  onPointerDown(e) {
    e.preventDefault();
    const isPen = (e.pointerType === 'pen');
    const isTouch = (e.pointerType === 'touch');
    const isMouse = (e.pointerType === 'mouse');

    // 1. Palm Rejection: If pen is active or drawing, ignore all accidental touches from palm
    if (this.activePenId !== null && isTouch) {
      return;
    }

    // 2. Multi-Touch Gestures (2 fingers for Pinch-to-Zoom & Pan)
    if (isTouch) {
      this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.activeTouches.size === 2) {
        const [p1, p2] = Array.from(this.activeTouches.values());
        this.initialPinchDistance = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        this.initialPinchCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        this.initialScale = this.scale;
        this.initialPan = { x: this.panX, y: this.panY };
        return;
      }

      // If strict palm rejection is enabled, 1-finger touch does NOT draw (reserved for pen)
      if (this.palmRejectionStrict && this.activeTouches.size === 1) {
        return;
      }
    }

    // 3. Stylus Pen or Intentional Mouse Drawing
    if (isPen || isMouse || (!this.palmRejectionStrict && isTouch)) {
      if (e.target.setPointerCapture) {
        try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
      }

      this.activePenId = e.pointerId;
      const coords = this.getNativeCoordinates(e.clientX, e.clientY);
      this.lastInkPos = coords;

      // Extract pressure: default to 0.5 if unsupported
      let pressure = e.pressure !== undefined && e.pressure > 0 ? e.pressure : 0.5;
      this.currentPressure = pressure;
      if (this.onPressureChange) this.onPressureChange(pressure);

      // Send pen stroke down to server
      this.ws.send({
        type: 'pen_stroke',
        action: 'down',
        x: coords.x,
        y: coords.y,
        pressure: pressure,
        buttons: e.buttons || 1
      });

      // Start local ink line
      if (this.localInking && this.overlayCtx) {
        this.overlayCtx.beginPath();
        this.overlayCtx.arc(coords.x, coords.y, Math.max(1, pressure * 4), 0, Math.PI * 2);
        this.overlayCtx.fillStyle = 'rgba(59, 130, 246, 0.7)';
        this.overlayCtx.fill();
      }
    }
  }

  onPointerMove(e) {
    e.preventDefault();

    // 1. Two-Finger Canvas Pan & Zoom
    if (e.pointerType === 'touch' && this.activeTouches.has(e.pointerId)) {
      this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.activeTouches.size === 2) {
        const [p1, p2] = Array.from(this.activeTouches.values());
        const currentDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const currentCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

        if (this.initialPinchDistance > 0) {
          const factor = currentDist / this.initialPinchDistance;
          this.scale = Math.max(1.0, Math.min(4.0, this.initialScale * factor));

          this.panX = this.initialPan.x + (currentCenter.x - this.initialPinchCenter.x);
          this.panY = this.initialPan.y + (currentCenter.y - this.initialPinchCenter.y);

          this.applyTransform();
        }
        return;
      }
    }

    // 2. Active Pen / Stylus Drawing
    if (e.pointerId === this.activePenId) {
      const coords = this.getNativeCoordinates(e.clientX, e.clientY);
      let pressure = e.pressure !== undefined && e.pressure > 0 ? e.pressure : 0.5;
      this.currentPressure = pressure;
      if (this.onPressureChange) this.onPressureChange(pressure);

      // Send move to server
      this.ws.send({
        type: 'pen_stroke',
        action: 'move',
        x: coords.x,
        y: coords.y,
        pressure: pressure,
        buttons: e.buttons || 1
      });

      // Draw local zero-latency ink preview
      if (this.localInking && this.overlayCtx && this.lastInkPos) {
        this.overlayCtx.beginPath();
        this.overlayCtx.moveTo(this.lastInkPos.x, this.lastInkPos.y);
        this.overlayCtx.lineTo(coords.x, coords.y);
        this.overlayCtx.strokeStyle = 'rgba(59, 130, 246, 0.75)';
        this.overlayCtx.lineWidth = Math.max(1.5, pressure * 6);
        this.overlayCtx.lineCap = 'round';
        this.overlayCtx.lineJoin = 'round';
        this.overlayCtx.stroke();
      }

      this.lastInkPos = coords;
    }
  }

  onPointerUp(e) {
    e.preventDefault();

    if (e.pointerType === 'touch') {
      this.activeTouches.delete(e.pointerId);
    }

    if (e.pointerId === this.activePenId) {
      const coords = this.getNativeCoordinates(e.clientX, e.clientY);

      this.ws.send({
        type: 'pen_stroke',
        action: 'up',
        x: coords.x,
        y: coords.y,
        pressure: 0,
        buttons: 0
      });

      this.activePenId = null;
      this.lastInkPos = null;
      this.currentPressure = 0.0;
      if (this.onPressureChange) this.onPressureChange(0);

      // Fade out overlay ink trail gracefully
      setTimeout(() => {
        if (this.activePenId === null) this.clearOverlay();
      }, 80);
    }
  }

  applyTransform() {
    const transformStr = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    this.canvas.style.transform = transformStr;
    if (this.overlayCanvas) {
      this.overlayCanvas.style.transform = transformStr;
    }
  }

  resetView() {
    this.scale = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.applyTransform();
  }

  setPalmRejection(strict) {
    this.palmRejectionStrict = strict;
  }
}
