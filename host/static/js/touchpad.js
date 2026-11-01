/**
 * Smart Virtual Trackpad Engine for Android Phone & Tablet
 * Supports: Inertial cursor movement, Tap-to-click, 2-Finger scroll,
 * Reverse Scrolling setting, Double-Tap & Drag gesture, and Dedicated Scroll Strip.
 */

class TouchpadController {
  constructor(surfaceElement, scrollStripElement, wsClient) {
    this.surface = surfaceElement;
    this.scrollStrip = scrollStripElement;
    this.ws = wsClient;

    this.sensitivity = 1.35;
    this.activeTouches = new Map();
    
    // Tap & Double-Tap detection
    this.touchStartTime = 0;
    this.lastTapTime = 0;
    this.hasMoved = false;
    this.tapThresholdMs = 250;
    this.doubleTapThresholdMs = 300;
    this.moveThresholdPx = 8;
    this.isDragGestureActive = false;

    // Scroll state & Reverse scroll preference
    this.lastScrollY = 0;
    this.reverseScroll = localStorage.getItem('pcremote_reverse_scroll') === 'true';

    this.setupEvents();
  }

  setReverseScroll(enabled) {
    this.reverseScroll = !!enabled;
    localStorage.setItem('pcremote_reverse_scroll', this.reverseScroll ? 'true' : 'false');
  }

  setupEvents() {
    this.surface.addEventListener('pointerdown', (e) => this.onPointerDown(e), { passive: false });
    this.surface.addEventListener('pointermove', (e) => this.onPointerMove(e), { passive: false });
    this.surface.addEventListener('pointerup', (e) => this.onPointerUp(e), { passive: false });
    this.surface.addEventListener('pointercancel', (e) => this.onPointerUp(e), { passive: false });
    this.surface.addEventListener('contextmenu', (e) => e.preventDefault());

    if (this.scrollStrip) {
      this.scrollStrip.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.scrollStrip.setPointerCapture(e.pointerId);
        this.lastScrollY = e.clientY;
      });

      this.scrollStrip.addEventListener('pointermove', (e) => {
        e.preventDefault();
        if (this.lastScrollY === 0) return;
        
        let delta = (this.lastScrollY - e.clientY) * 0.15;
        if (this.reverseScroll) {
          delta = -delta;
        }

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
    const now = performance.now();
    this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });

    if (this.activeTouches.size === 1) {
      // Check for double-tap to initiate drag
      const timeSinceLastTap = now - this.lastTapTime;
      if (timeSinceLastTap < this.doubleTapThresholdMs) {
        this.isDragGestureActive = true;
        this.ws.send({ type: 'mouse_down', button: 'left' });
        if (window.navigator.vibrate) window.navigator.vibrate([15, 30]);
      } else {
        this.isDragGestureActive = false;
      }

      this.touchStartTime = now;
      this.hasMoved = false;
    }
  }

  onPointerMove(e) {
    e.preventDefault();
    if (!this.activeTouches.has(e.pointerId)) return;

    const prev = this.activeTouches.get(e.pointerId);
    const dx = (e.clientX - prev.x) * this.sensitivity;
    const dy = (e.clientY - prev.y) * this.sensitivity;

    const totalDist = Math.hypot(e.clientX - prev.startX, e.clientY - prev.startY);
    if (totalDist > this.moveThresholdPx) {
      this.hasMoved = true;
    }

    // 1-Finger Cursor Movement or Double-Tap Dragging
    if (this.activeTouches.size === 1) {
      this.ws.send({
        type: 'mouse_move_rel',
        dx: Math.round(dx),
        dy: Math.round(dy)
      });
    }
    // 2-Finger Vertical Scrolling
    else if (this.activeTouches.size === 2) {
      let scrollDelta = -(dy * 0.2);
      if (this.reverseScroll) {
        scrollDelta = -scrollDelta;
      }

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
    const now = performance.now();
    const duration = now - this.touchStartTime;

    // Release double-tap drag if active
    if (this.isDragGestureActive) {
      this.ws.send({ type: 'mouse_up', button: 'left' });
      this.isDragGestureActive = false;
      this.lastTapTime = 0;
    } else {
      // Detect single / two finger tap
      if (!this.hasMoved && duration < this.tapThresholdMs) {
        if (this.activeTouches.size === 1) {
          this.ws.send({ type: 'mouse_click', button: 'left' });
          if (window.navigator.vibrate) window.navigator.vibrate(20);
          this.lastTapTime = now;
        } else if (this.activeTouches.size === 2) {
          this.ws.send({ type: 'mouse_click', button: 'right' });
          if (window.navigator.vibrate) window.navigator.vibrate(40);
          this.lastTapTime = 0;
        }
      }
    }

    this.activeTouches.delete(e.pointerId);
  }
}
