/**
 * Main Application Controller
 * Handles WebSocket communication, Mode Navigation, Media, Shortcuts, and Screenshot Hub.
 */

class WebSocketClient {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.binaryHandler = null;
    this.reconnectTimer = null;
    this.connect();
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    this.ws = new WebSocket(wsUrl);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      console.log('Connected to laptop server.');
      this.updateStatus(true);
      if (this.reconnectTimer) {
        clearInterval(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    };

    this.ws.onclose = () => {
      console.warn('Disconnected. Reconnecting...');
      this.updateStatus(false);
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    this.ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        if (this.binaryHandler) {
          this.binaryHandler(event.data);
        }
      } else {
        try {
          const data = JSON.parse(event.data);
          const handler = this.handlers.get(data.type);
          if (handler) handler(data);
        } catch (e) {
          console.error('Error parsing JSON message:', e);
        }
      }
    };
  }

  scheduleReconnect() {
    if (!this.reconnectTimer) {
      this.reconnectTimer = setInterval(() => {
        if (!this.isOpen()) this.connect();
      }, 2000);
    }
  }

  send(data) {
    if (this.isOpen()) {
      this.ws.send(JSON.stringify(data));
    }
  }

  isOpen() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  on(type, callback) {
    this.handlers.set(type, callback);
  }

  onBinary(callback) {
    this.binaryHandler = callback;
  }

  updateStatus(connected) {
    const dot = document.getElementById('statusDot');
    if (dot) {
      if (connected) {
        dot.classList.add('connected');
      } else {
        dot.classList.remove('connected');
      }
    }
  }
}

// Global App Initialization
document.addEventListener('DOMContentLoaded', () => {
  const ws = new WebSocketClient();

  // Screen Streamer
  const canvas = document.getElementById('screenCanvas');
  const streamer = new ScreenStreamer(canvas, ws);
  ws.onBinary((data) => streamer.handleBinaryFrame(data));

  // Touchpad Controller
  const touchpadSurface = document.getElementById('touchpadSurface');
  const scrollStrip = document.getElementById('scrollStrip');
  const touchpad = new TouchpadController(touchpadSurface, scrollStrip, ws);

  // Initialize Native Screen Info from Server
  ws.on('init', (data) => {
    if (data.screen) {
      streamer.setNativeResolution(data.screen.width, data.screen.height);
      const resBadge = document.getElementById('resBadge');
      if (resBadge) resBadge.textContent = `${data.screen.width}x${data.screen.height}`;
    }
    if (data.battery) {
      updateBatteryUI(data.battery);
    }
    // Automatically start stream if mirror tab is active
    if (currentTab === 'mirror') {
      streamer.start(30, 65, 0.75);
    }
  });

  ws.on('system_info', (data) => {
    if (data.battery) updateBatteryUI(data.battery);
  });

  // Screenshot Ready Handler
  ws.on('screenshot_ready', (data) => {
    playShutterSound();
    triggerFlashEffect();
    showScreenshotModal(data.url, data.filename);
  });

  ws.on('notification', (data) => {
    showToast(data.message);
  });

  // --- Tab Switching Logic ---
  let currentTab = 'mirror';
  const navItems = document.querySelectorAll('.nav-item');
  const viewPanels = document.querySelectorAll('.view-panel');

  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      switchTab(target);
    });
  });

  function switchTab(target) {
    currentTab = target;
    navItems.forEach((item) => {
      item.classList.toggle('active', item.dataset.target === target);
    });

    viewPanels.forEach((panel) => {
      panel.classList.toggle('active', panel.id === `panel-${target}`);
    });

    // Control video stream lifecycle: only stream when Screen Mirror tab is open!
    if (target === 'mirror') {
      streamer.start(30, 65, 0.75);
    } else {
      streamer.stop();
    }

    if (window.navigator.vibrate) window.navigator.vibrate(10);
  }

  // --- Header & Floating Screenshot Buttons ---
  const headerScreenshotBtn = document.getElementById('btnHeaderScreenshot');
  if (headerScreenshotBtn) {
    headerScreenshotBtn.addEventListener('click', () => {
      triggerInstantScreenshot();
    });
  }

  const floatingScreenshotBtn = document.getElementById('btnFloatingScreenshot');
  if (floatingScreenshotBtn) {
    floatingScreenshotBtn.addEventListener('click', () => {
      triggerInstantScreenshot();
    });
  }

  function triggerInstantScreenshot() {
    showToast('📸 Capturing screenshot...');
    ws.send({ type: 'screenshot', action: 'capture' });
    if (window.navigator.vibrate) window.navigator.vibrate([20, 50, 20]);
  }

  // Snipping Tool Button
  const btnSnip = document.getElementById('btnSnip');
  if (btnSnip) {
    btnSnip.addEventListener('click', () => {
      ws.send({ type: 'screenshot', action: 'snip' });
      showToast('✂️ Snipping Tool opened on laptop');
    });
  }

  // PrintScreen Button
  const btnPrtScn = document.getElementById('btnPrtScn');
  if (btnPrtScn) {
    btnPrtScn.addEventListener('click', () => {
      ws.send({ type: 'shortcut', action: 'screenshot_prtscn' });
      showToast('📋 PrintScreen key triggered');
    });
  }

  // --- Touchpad Left / Right Buttons ---
  const btnMouseLeft = document.getElementById('btnMouseLeft');
  const btnMouseRight = document.getElementById('btnMouseRight');
  const btnMouseMiddle = document.getElementById('btnMouseMiddle');

  if (btnMouseLeft) {
    btnMouseLeft.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      ws.send({ type: 'mouse_down', button: 'left' });
      if (window.navigator.vibrate) window.navigator.vibrate(15);
    });
    btnMouseLeft.addEventListener('pointerup', (e) => {
      e.preventDefault();
      ws.send({ type: 'mouse_up', button: 'left' });
    });
  }

  if (btnMouseRight) {
    btnMouseRight.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      ws.send({ type: 'mouse_down', button: 'right' });
      if (window.navigator.vibrate) window.navigator.vibrate(25);
    });
    btnMouseRight.addEventListener('pointerup', (e) => {
      e.preventDefault();
      ws.send({ type: 'mouse_up', button: 'right' });
    });
  }

  if (btnMouseMiddle) {
    btnMouseMiddle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      ws.send({ type: 'mouse_down', button: 'middle' });
    });
    btnMouseMiddle.addEventListener('pointerup', (e) => {
      e.preventDefault();
      ws.send({ type: 'mouse_up', button: 'middle' });
    });
  }

  // --- Media & Volume Controls ---
  document.querySelectorAll('[data-shortcut]').forEach((el) => {
    el.addEventListener('click', () => {
      const action = el.dataset.shortcut;
      ws.send({ type: 'shortcut', action: action });
      if (window.navigator.vibrate) window.navigator.vibrate(15);
    });
  });

  // --- Unicode Text Input ---
  const textInputForm = document.getElementById('textInputForm');
  const textInputField = document.getElementById('textInputField');
  if (textInputForm && textInputField) {
    textInputForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = textInputField.value;
      if (text) {
        ws.send({ type: 'text_input', text: text });
        textInputField.value = '';
        showToast('Text sent to laptop');
      }
    });
  }

  // --- Clipboard Push / Pull ---
  const btnPushClipboard = document.getElementById('btnPushClipboard');
  if (btnPushClipboard && textInputField) {
    btnPushClipboard.addEventListener('click', async () => {
      const text = textInputField.value;
      if (!text) {
        showToast('Please type something first');
        return;
      }
      try {
        const res = await fetch('/api/clipboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Copied to laptop clipboard!');
        }
      } catch (err) {
        showToast('Failed to sync clipboard');
      }
    });
  }

  // --- Floating Controls on Screen Mirror ---
  const btnResetZoom = document.getElementById('btnResetZoom');
  if (btnResetZoom) {
    btnResetZoom.addEventListener('click', () => {
      streamer.resetZoom();
      showToast('Zoom reset (1x)');
    });
  }

  const btnToggleFullscreen = document.getElementById('btnToggleFullscreen');
  if (btnToggleFullscreen) {
    btnToggleFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  // Keep phone screen awake
  requestWakeLock();
});

// UI Helpers
function updateBatteryUI(battery) {
  const badge = document.getElementById('batteryBadge');
  if (!badge) return;
  const icon = battery.is_charging ? '⚡' : '🔋';
  badge.textContent = `${icon} ${battery.percent}%`;
}

function showToast(msg) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function playShutterSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  } catch (e) {}
}

function triggerFlashEffect() {
  const flash = document.createElement('div');
  flash.style.position = 'fixed';
  flash.style.inset = '0';
  flash.style.background = 'white';
  flash.style.opacity = '0.8';
  flash.style.zIndex = '999';
  flash.style.pointerEvents = 'none';
  flash.style.transition = 'opacity 0.25s ease-out';
  document.body.appendChild(flash);
  setTimeout(() => {
    flash.style.opacity = '0';
    setTimeout(() => flash.remove(), 250);
  }, 20);
}

function showScreenshotModal(imageUrl, filename) {
  const modal = document.getElementById('screenshotModal');
  const img = document.getElementById('screenshotPreviewImg');
  const btnDownload = document.getElementById('btnDownloadScreenshot');
  if (!modal || !img) return;

  img.src = imageUrl;
  modal.classList.add('active');

  btnDownload.onclick = () => {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = filename || 'screenshot.jpg';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const btnClose = document.getElementById('btnCloseModal');
  if (btnClose) {
    btnClose.onclick = () => modal.classList.remove('active');
  }
}

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      await navigator.wakeLock.request('screen');
      console.log('Screen WakeLock active');
    } catch (err) {}
  }
}
