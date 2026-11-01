/**
 * High-performance Screen Mirroring & Interactive Pointer/Stylus Handler
 * Supports: Hardware ImageBitmap rendering, Pinch-to-Zoom, Direct Touch, and Advan Sketsa 2 Stylus Pen.
 */

class ScreenStreamer {
  constructor(canvasElement, wsClient) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d', { alpha: false, desynchronized: true });
    this.ws = wsClient;
    
    this.isActive = false;
    this.nativeWidth = 1920;
    this.nativeHeight = 1080;
    
    // Zoom & Pan state
    this.scale = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.initialPinchDistance = 0;
    this.initialScale = 1.0;
    
    // Pointer tracking
    this.activePointers = new Map();
    this.isDragging = false;
    this.lastPointerPos = null;
    this.isDirectTouch = true; // True: tap = click. False: virtual cursor
    
    this.setupPointerEvents();
  }

  setNativeResolution(w, h) {
    this.nativeWidth = w;
    this.nativeHeight = h;
    this.canvas.width = w;
    this.canvas.height = h;
  }

  start(fps = 30, quality = 65, scale = 0.75) {
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
  }

  async handleBinaryFrame(arrayBuffer) {
    if (!this.isActive) return;

    try {
      const blob = new Blob([arrayBuffer], { type: 'image/jpeg' });
      // createImageBitmap decodes asynchronously off the main thread for maximum 60fps performance
      const bitmap = await createImageBitmap(blob);
      
      // Render to canvas
      this.ctx.drawImage(bitmap, 0, 0, this.canvas.width, this.canvas.height);
      bitmap.close();

      // Flow control backpressure acknowledgement
      this.ws.send({ type: 'frame_ack' });
    } catch (err) {
      console.error('Frame decode error:', err);
      // Still ack so we do not freeze
      this.ws.send({ type: 'frame_ack' });
    }
  }

  setupPointerEvents() {
    const el = this.canvas;

    el.addEventListener('pointerdown', (e) => this.onPointerDown(e), { passive: false });
    el.addEventListener('pointermove', (e) => this.onPointerMove(e), { passive: false });
    el.addEventListener('pointerup', (e) => this.onPointerUp(e), { passive: false });
    el.addEventListener('pointercancel', (e) => this.onPointerUp(e), { passive: false });

    // Prevent default context menu on right click / long press
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Translates client pointer coordinates into Laptop Native Screen (X, Y)
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
    this.canvas.setPointerCapture(e.pointerId);
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Handle 2-finger pinch-to-zoom
    if (this.activePointers.size === 2) {
      const [p1, p2] = Array.from(this.activePointers.values());
      this.initialPinchDistance = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      this.initialScale = this.scale;
      return;
    }

    if (this.activePointers.size === 1) {
      const coords = this.getNativeCoordinates(e.clientX, e.clientY);
      this.lastPointerPos = coords;

      // Detect stylus pen (Advan Sketsa 2 stylus pen support!)
      const isPen = (e.pointerType === 'pen');
      const isRightClick = (e.buttons === 2 || e.button === 2);

      // Move cursor to touch/pen location
      this.ws.send({
        type: 'mouse_move_abs',
        x: coords.x,
        y: coords.y
      });

      // Press mouse button down (supports stylus drag/drawing)
      this.ws.send({
        type: 'mouse_down',
        button: isRightClick ? 'right' : 'left'
      });

      this.isDragging = true;
      if (window.navigator.vibrate) window.navigator.vibrate(15);
    }
  }

  onPointerMove(e) {
    e.preventDefault();
    if (!this.activePointers.has(e.pointerId)) return;
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // 2-Finger Pinch Zooming
    if (this.activePointers.size === 2) {
      const [p1, p2] = Array.from(this.activePointers.values());
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      if (this.initialPinchDistance > 0) {
        const factor = dist / this.initialPinchDistance;
        this.scale = Math.max(1.0, Math.min(3.0, this.initialScale * factor));
        this.canvas.style.transform = `scale(${this.scale})`;
      }
      return;
    }

    // 1-Finger / Stylus Dragging
    if (this.activePointers.size === 1 && this.isDragging) {
      const coords = this.getNativeCoordinates(e.clientX, e.clientY);
      this.ws.send({
        type: 'mouse_move_abs',
        x: coords.x,
        y: coords.y
      });
      this.lastPointerPos = coords;
    }
  }

  onPointerUp(e) {
    e.preventDefault();
    this.activePointers.delete(e.pointerId);

    if (this.activePointers.size === 0 && this.isDragging) {
      const isRightClick = (e.button === 2);
      this.ws.send({
        type: 'mouse_up',
        button: isRightClick ? 'right' : 'left'
      });
      this.isDragging = false;
      this.lastPointerPos = null;
    }
  }

  resetZoom() {
    this.scale = 1.0;
    this.canvas.style.transform = 'scale(1.0)';
  }
}
