/**
 * Smart Virtual Trackpad Engine for Android Phone & Tablet
 * Supports: Inertial cursor movement, Tap-to-click, 2-Finger right click, 2-Finger scroll, Scroll strip
 */

class TouchpadController {
  constructor(surfaceElement, scrollStripElement, wsClient) {
    this.surface = surfaceElement;
    this.scrollStrip = scrollStripElement;
    this.ws = wsClient;

    this.sensitivity = 1.35;
    this.activeTouches = new Map();
    
    // Tap detection
    this.touchStartTime = 0;
    this.hasMoved = false;
    this.tapThresholdMs = 250;
    this.moveThresholdPx = 8;
    
    // Scroll state
    this.lastScrollY = 0;

    this.setupEvents();
  }

  setupEvents() {
    // Touchpad surface
    this.surface.addEventListener('pointerdown', (e) => this.onPointerDown(e), { passive: false });
    this.surface.addEventListener('pointermove', (e) => this.onPointerMove(e), { passive: false });
    this.surface.addEventListener('pointerup', (e) => this.onPointerUp(e), { passive: false });
    this.surface.addEventListener('pointercancel', (e) => this.onPointerUp(e), { passive: false });
    this.surface.addEventListener('contextmenu', (e) => e.preventDefault());

    // Scroll strip
    if (this.scrollStrip) {
      this.scrollStrip.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.scrollStrip.setPointerCapture(e.pointerId);
        this.lastScrollY = e.clientY;
      });

      this.scrollStrip.addEventListener('pointermove', (e) => {
        e.preventDefault();
        if (this.lastScrollY === 0) return;
        const delta = (this.lastScrollY - e.clientY) * 0.15;
        if (Math.abs(delta) > 0.3) {
          this.ws.send({
            type: 'mouse_wheel',
            delta_y: delta
          });
          this.lastScrollY = e.clientY;
        }
      });

      this.scrollStrip.addEventListener('pointerup', () => {
        this.lastScrollY = 0;
      });
    }
  }

  onPointerDown(e) {
    e.preventDefault();
    this.surface.setPointerCapture(e.pointerId);
    this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });

    if (this.activeTouches.size === 1) {
      this.touchStartTime = performance.now();
      this.hasMoved = false;
    }
  }

  onPointerMove(e) {
    e.preventDefault();
    if (!this.activeTouches.has(e.pointerId)) return;

    const prev = this.activeTouches.get(e.pointerId);
    const dx = (e.clientX - prev.x) * this.sensitivity;
    const dy = (e.clientY - prev.y) * this.sensitivity;

    // Check if movement passed threshold
    const totalDist = Math.hypot(e.clientX - prev.startX, e.clientY - prev.startY);
    if (totalDist > this.moveThresholdPx) {
      this.hasMoved = true;
    }

    // 1-Finger Cursor Movement
    if (this.activeTouches.size === 1) {
      this.ws.send({
        type: 'mouse_move_rel',
        dx: Math.round(dx),
        dy: Math.round(dy)
      });
    }
    // 2-Finger Vertical Scrolling
    else if (this.activeTouches.size === 2) {
      const scrollDelta = -(dy * 0.2);
      if (Math.abs(scrollDelta) > 0.2) {
        this.ws.send({
          type: 'mouse_wheel',
          delta_y: scrollDelta
        });
      }
    }

    this.activeTouches.set(e.pointerId, { ...prev, x: e.clientX, y: e.clientY });
  }

  onPointerUp(e) {
    e.preventDefault();
    const touch = this.activeTouches.get(e.pointerId);
    const duration = performance.now() - this.touchStartTime;

    // Detect Tap
    if (!this.hasMoved && duration < this.tapThresholdMs) {
      if (this.activeTouches.size === 1) {
        // 1-Finger Tap -> Left Click
        this.ws.send({ type: 'mouse_click', button: 'left' });
        if (window.navigator.vibrate) window.navigator.vibrate(20);
      } else if (this.activeTouches.size === 2) {
        // 2-Finger Tap -> Right Click
        this.ws.send({ type: 'mouse_click', button: 'right' });
        if (window.navigator.vibrate) window.navigator.vibrate(40);
      }
    }

    this.activeTouches.delete(e.pointerId);
  }
}
