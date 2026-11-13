/**
 * Main Application Controller (v1.0.3)
 * Features: Multi-Laptop Switcher & Profile Manager, Multi-Monitor Switcher,
 * Real-Time Keystroke Typing, Laptop Brightness, Click & Hold (Drag Lock), and Reverse Scrolling.
 */

class WebSocketClient {
  constructor() {
    this.ws = null;
    this.currentHost = window.location.host;
    this.handlers = new Map();
    this.binaryHandler = null;
    this.reconnectTimer = null;
    this.connect(this.currentHost);
  }

  connect(targetHost) {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
    }

    this.currentHost = targetHost || window.location.host;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${this.currentHost}/ws`;

    this.ws = new WebSocket(wsUrl);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      console.log(`Connected to host: ${this.currentHost}`);
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
        if (!this.isOpen()) this.connect(this.currentHost);
      }, 2500);
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

document.addEventListener('DOMContentLoaded', () => {
  const ws = new WebSocketClient();

  // Screen Streamer (Affinity Drawing Pad)
  const canvas = document.getElementById('screenCanvas');
  const overlayCanvas = document.getElementById('drawingOverlayCanvas');
  const streamer = new ScreenStreamer(canvas, overlayCanvas, ws);
  ws.onBinary((data) => streamer.handleBinaryFrame(data));

  // --- Drawing Pad & Pressure Meter Bindings ---
  const pressureMeterFill = document.getElementById('pressureMeterFill');
  const pressureValueText = document.getElementById('pressureValueText');

  streamer.onPressureChange = (pressure) => {
    const pct = Math.round(pressure * 100);
    if (pressureMeterFill) pressureMeterFill.style.width = `${pct}%`;
    if (pressureValueText) pressureValueText.textContent = `${pct}%`;
  };

  const btnTogglePalm = document.getElementById('btnTogglePalm');
  const palmStatusText = document.getElementById('palmStatusText');
  if (btnTogglePalm && palmStatusText) {
    btnTogglePalm.addEventListener('click', () => {
      const isStrict = !streamer.palmRejectionStrict;
      streamer.setPalmRejection(isStrict);
      btnTogglePalm.classList.toggle('active', isStrict);
      palmStatusText.textContent = isStrict ? 'STRICT' : 'OFF';
      showToast(isStrict ? '🖐️ Palm Rejection: STRICT (Stylus only draws)' : '🖐️ Palm Rejection: OFF (Finger draws too)');
    });
  }

  // Artist Toolbar (Affinity Deck)
  const artistToolbar = document.getElementById('artistToolbar');
  const btnCollapseToolbar = document.getElementById('btnCollapseToolbar');
  const btnSwitchDock = document.getElementById('btnSwitchDock');

  if (btnCollapseToolbar && artistToolbar) {
    btnCollapseToolbar.addEventListener('click', () => {
      artistToolbar.classList.toggle('collapsed');
    });
  }

  if (btnSwitchDock && artistToolbar) {
    btnSwitchDock.addEventListener('click', () => {
      const isLeft = artistToolbar.classList.contains('dock-left');
      artistToolbar.classList.toggle('dock-left', !isLeft);
      artistToolbar.classList.toggle('dock-right', isLeft);
      showToast(isLeft ? 'Toolbar docked to Right' : 'Toolbar docked to Left');
    });
  }

  // Active Tool Highlighting for Drawing buttons
  const artistToolBtns = document.querySelectorAll('.artist-tool-btn');
  artistToolBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const shortcut = btn.dataset.shortcut;
      if (['affinity_brush', 'affinity_eraser', 'affinity_pen', 'affinity_node', 'affinity_select', 'affinity_hand'].includes(shortcut)) {
        artistToolBtns.forEach((b) => {
          if (['affinity_brush', 'affinity_eraser', 'affinity_pen', 'affinity_node', 'affinity_select', 'affinity_hand'].includes(b.dataset.shortcut)) {
            b.classList.remove('active');
          }
        });
        btn.classList.add('active');
      }
    });
  });

  // Touchpad Controller
  const touchpadSurface = document.getElementById('touchpadSurface');
  const scrollStrip = document.getElementById('scrollStrip');
  const touchpad = new TouchpadController(touchpadSurface, scrollStrip, ws);

  // Reverse Scrolling Checkbox Sync
  const chkReverseScroll = document.getElementById('chkReverseScroll');
  if (chkReverseScroll) {
    chkReverseScroll.checked = touchpad.reverseScroll;
    chkReverseScroll.addEventListener('change', (e) => {
      touchpad.setReverseScroll(e.target.checked);
      showToast(e.target.checked ? 'Reverse scrolling ON' : 'Standard scrolling ON');
    });
  }

  // --- Multi-Laptop Switcher & Profile Storage ---
  const currentPcName = document.getElementById('currentPcName');
  const pcSwitcherModal = document.getElementById('pcSwitcherModal');
  const btnPcSwitcher = document.getElementById('btnPcSwitcher');
  const btnClosePcModal = document.getElementById('btnClosePcModal');
  const savedLaptopsList = document.getElementById('savedLaptopsList');
  const btnAddPc = document.getElementById('btnAddPc');
  const inputNewPcName = document.getElementById('inputNewPcName');
  const inputNewPcIp = document.getElementById('inputNewPcIp');

  function getSavedLaptops() {
    try {
      const data = localStorage.getItem('pcremote_saved_laptops');
      if (data) return JSON.parse(data);
    } catch (e) {}

    // Default to current host
    const currentHost = window.location.host;
    return [{
      name: 'Personal Laptop',
      host: currentHost
    }];
  }

  function saveLaptopsList(list) {
    localStorage.setItem('pcremote_saved_laptops', JSON.stringify(list));
  }

  function renderLaptopsList() {
    if (!savedLaptopsList) return;
    const laptops = getSavedLaptops();
    const activeHost = ws.currentHost;

    savedLaptopsList.innerHTML = '';
    laptops.forEach((pc) => {
      const item = document.createElement('div');
      const isActive = (pc.host === activeHost);
      item.className = `laptop-item ${isActive ? 'active' : ''}`;

      item.innerHTML = `
        <div class="laptop-item-info">
          <div class="laptop-item-name">
            <span>💻</span>
            <span>${pc.name}</span>
            ${isActive ? '<span style="font-size:0.68rem; color:#10b981;">(Connected)</span>' : ''}
          </div>
          <div class="laptop-item-ip">${pc.host}</div>
        </div>
        <div class="laptop-item-actions">
          ${laptops.length > 1 ? `<button class="btn-delete-pc" title="Remove" data-host="${pc.host}">🗑️</button>` : ''}
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.btn-delete-pc')) return;
        switchLaptop(pc.host, pc.name);
      });

      const delBtn = item.querySelector('.btn-delete-pc');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteLaptop(pc.host);
        });
      }

      savedLaptopsList.appendChild(item);
    });
  }

  function switchLaptop(targetHost, name) {
    if (ws.currentHost === targetHost) {
      if (pcSwitcherModal) pcSwitcherModal.classList.remove('active');
      return;
    }

    showToast(`Switching to ${name}...`);
    streamer.stop();

    // If running inside Android APK native webview
    if (window.AndroidHost && typeof window.AndroidHost.switchLaptop === 'function') {
      window.AndroidHost.switchLaptop(targetHost);
      return;
    }

    // Hot-reconnect websocket directly
    ws.connect(targetHost);
    if (currentPcName) currentPcName.textContent = name;
    if (pcSwitcherModal) pcSwitcherModal.classList.remove('active');

    setTimeout(() => {
      if (currentTab === 'mirror') streamer.start(30, 65, 0.75);
      renderLaptopsList();
    }, 500);
  }

  function deleteLaptop(hostToDelete) {
    let laptops = getSavedLaptops().filter((p) => p.host !== hostToDelete);
    if (laptops.length === 0) {
      laptops = [{ name: 'Default PC', host: window.location.host }];
    }
    saveLaptopsList(laptops);
    renderLaptopsList();
    showToast('Laptop profile removed');
  }

  if (btnPcSwitcher) {
    btnPcSwitcher.addEventListener('click', () => {
      renderLaptopsList();
      if (pcSwitcherModal) pcSwitcherModal.classList.add('active');
    });
  }

  if (btnClosePcModal) {
    btnClosePcModal.addEventListener('click', () => {
      if (pcSwitcherModal) pcSwitcherModal.classList.remove('active');
    });
  }

  if (btnAddPc) {
    btnAddPc.addEventListener('click', () => {
      const name = (inputNewPcName.value || 'Laptop 2').trim();
      let ip = (inputNewPcIp.value || '').trim();

      if (!ip) {
        showToast('Please enter an IP address');
        return;
      }

      if (!ip.includes(':')) {
        ip = `${ip}:5000`;
      }

      const laptops = getSavedLaptops();
      // Check if already exists
      const existing = laptops.find((p) => p.host === ip);
      if (existing) {
        existing.name = name;
      } else {
        laptops.push({ name: name, host: ip });
      }

      saveLaptopsList(laptops);
      inputNewPcName.value = '';
      inputNewPcIp.value = '';
      switchLaptop(ip, name);
    });
  }

  const btnOpenHub = document.getElementById('btnOpenHub');
  if (btnOpenHub) {
    btnOpenHub.addEventListener('click', () => {
      if (window.AndroidHost && typeof window.AndroidHost.openDashboard === 'function') {
        window.AndroidHost.openDashboard();
      } else {
        if (btnPcSwitcher) btnPcSwitcher.click();
      }
    });
  }

  // --- Multi-Monitor Setup ---
  const monitorSelect = document.getElementById('monitorSelect');
  
  function populateMonitors(monitors, activeIndex) {
    if (!monitorSelect || !monitors) return;
    monitorSelect.innerHTML = '';
    monitors.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      if (m.id === activeIndex) opt.selected = true;
      monitorSelect.appendChild(opt);
    });
  }

  if (monitorSelect) {
    monitorSelect.addEventListener('change', (e) => {
      const idx = parseInt(e.target.value);
      ws.send({ type: 'select_monitor', index: idx });
      showToast(`Switched to ${monitorSelect.options[monitorSelect.selectedIndex].text}`);
    });
  }

  ws.on('monitor_changed', (data) => {
    if (data.screen) {
      streamer.setNativeResolution(data.screen.width, data.screen.height);
    }
  });

  // --- WebSocket Initialization Handler ---
  ws.on('init', (data) => {
    if (data.name) {
      if (currentPcName) currentPcName.textContent = data.name;
      // Auto-update friendly name in saved list if default
      const laptops = getSavedLaptops();
      const current = laptops.find((p) => p.host === ws.currentHost);
      if (current && (current.name === 'Personal Laptop' || current.name === 'My PC' || current.name === 'Default PC')) {
        current.name = data.name;
        saveLaptopsList(laptops);
      }
    }
    if (data.monitors) {
      populateMonitors(data.monitors, data.active_monitor);
    }
    if (data.screen) {
      streamer.setNativeResolution(data.screen.width, data.screen.height);
    }
    if (data.battery) {
      updateBatteryUI(data.battery);
    }
    if (data.brightness !== undefined) {
      updateBrightnessUI(data.brightness);
    }
    if (currentTab === 'mirror') {
      streamer.start(45, 75, 0.85);
    }
  });

  ws.on('system_info', (data) => {
    if (data.battery) updateBatteryUI(data.battery);
    if (data.brightness !== undefined) updateBrightnessUI(data.brightness);
  });

  // --- Real-Time Mobile Keyboard Input (Stroke by Stroke) ---
  const realtimeKbInput = document.getElementById('realtimeKbInput');
  const activeTypingPill = document.getElementById('activeTypingPill');

  function openNativeKeyboard() {
    if (!realtimeKbInput) return;
    realtimeKbInput.focus();
    if (activeTypingPill) activeTypingPill.classList.add('visible');
    showToast('⌨️ Mobile keyboard active! Start typing...');
    if (window.navigator.vibrate) window.navigator.vibrate(15);
  }

  function closeNativeKeyboard() {
    if (!realtimeKbInput) return;
    realtimeKbInput.blur();
    if (activeTypingPill) activeTypingPill.classList.remove('visible');
  }

  const btnHeaderKb = document.getElementById('btnHeaderKb');
  const btnFloatingKb = document.getElementById('btnFloatingKb');
  const btnTouchpadKb = document.getElementById('btnTouchpadKb');
  const btnLaunchRealtimeKb = document.getElementById('btnLaunchRealtimeKb');

  [btnHeaderKb, btnFloatingKb, btnTouchpadKb, btnLaunchRealtimeKb].forEach((btn) => {
    if (btn) btn.addEventListener('click', () => openNativeKeyboard());
  });

  if (activeTypingPill) {
    activeTypingPill.addEventListener('click', () => closeNativeKeyboard());
  }

  if (realtimeKbInput) {
    realtimeKbInput.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        ws.send({ type: 'realtime_key', is_backspace: true });
        if (window.navigator.vibrate) window.navigator.vibrate(8);
      } else if (e.key === 'Enter') {
        ws.send({ type: 'realtime_key', is_enter: true });
        if (window.navigator.vibrate) window.navigator.vibrate(12);
      }
    });

    realtimeKbInput.addEventListener('input', (e) => {
      const val = realtimeKbInput.value;
      if (val) {
        for (let char of val) {
          ws.send({ type: 'realtime_key', char: char });
        }
        realtimeKbInput.value = '';
        if (window.navigator.vibrate) window.navigator.vibrate(8);
      }
    });

    realtimeKbInput.addEventListener('blur', () => {
      if (activeTypingPill) activeTypingPill.classList.remove('visible');
    });
  }

  // --- Click & Hold / Drag Lock ---
  const btnDragLock = document.getElementById('btnDragLock');
  const btnFloatingDrag = document.getElementById('btnFloatingDrag');

  function toggleDragLock() {
    ws.send({ type: 'drag_lock_toggle' });
  }

  if (btnDragLock) btnDragLock.addEventListener('click', toggleDragLock);
  if (btnFloatingDrag) btnFloatingDrag.addEventListener('click', toggleDragLock);

  ws.on('drag_lock_status', (data) => {
    const active = !!data.active;
    if (btnDragLock) {
      btnDragLock.classList.toggle('drag-lock-active', active);
    }
    if (btnFloatingDrag) {
      btnFloatingDrag.classList.toggle('active', active);
    }
    showToast(active ? '✋ Drag Lock ON (Click & Hold)' : '✋ Drag Lock OFF');
    if (window.navigator.vibrate) window.navigator.vibrate([20, 40]);
  });

  // --- Brightness Controls ---
  const brightnessSlider = document.getElementById('brightnessSlider');
  const brightnessValueText = document.getElementById('brightnessValueText');
  const btnDim = document.getElementById('btnDim');
  const btnBrighten = document.getElementById('btnBrighten');

  function updateBrightnessUI(val) {
    if (brightnessSlider) brightnessSlider.value = val;
    if (brightnessValueText) brightnessValueText.textContent = `${val}%`;
  }

  if (brightnessSlider) {
    let brightnessThrottle = null;
    brightnessSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      if (brightnessValueText) brightnessValueText.textContent = `${val}%`;

      if (!brightnessThrottle) {
        brightnessThrottle = setTimeout(() => {
          ws.send({ type: 'brightness', action: 'set', value: val });
          brightnessThrottle = null;
        }, 80);
      }
    });
  }

  if (btnDim) {
    btnDim.addEventListener('click', () => {
      ws.send({ type: 'brightness', action: 'adjust', delta: -10 });
      if (window.navigator.vibrate) window.navigator.vibrate(15);
    });
  }

  if (btnBrighten) {
    btnBrighten.addEventListener('click', () => {
      ws.send({ type: 'brightness', action: 'adjust', delta: 10 });
      if (window.navigator.vibrate) window.navigator.vibrate(15);
    });
  }

  ws.on('brightness_update', (data) => {
    if (data.value !== undefined && data.value !== null) {
      updateBrightnessUI(data.value);
    }
  });

  // --- Screenshot Handlers ---
  ws.on('screenshot_ready', (data) => {
    playShutterSound();
    triggerFlashEffect();
    showScreenshotModal(data.url, data.filename);
  });

  ws.on('notification', (data) => {
    showToast(data.message);
  });

  const headerScreenshotBtn = document.getElementById('btnHeaderScreenshot');
  const floatingScreenshotBtn = document.getElementById('btnFloatingScreenshot');

  function triggerInstantScreenshot() {
    showToast('📸 Capturing active monitor screenshot...');
    ws.send({ type: 'screenshot', action: 'capture' });
    if (window.navigator.vibrate) window.navigator.vibrate([20, 50, 20]);
  }

  if (headerScreenshotBtn) headerScreenshotBtn.addEventListener('click', triggerInstantScreenshot);
  if (floatingScreenshotBtn) floatingScreenshotBtn.addEventListener('click', triggerInstantScreenshot);

  const btnSnip = document.getElementById('btnSnip');
  if (btnSnip) {
    btnSnip.addEventListener('click', () => {
      ws.send({ type: 'screenshot', action: 'snip' });
      showToast('✂️ Snipping Tool opened on laptop');
    });
  }

  const btnPrtScn = document.getElementById('btnPrtScn');
  if (btnPrtScn) {
    btnPrtScn.addEventListener('click', () => {
      ws.send({ type: 'shortcut', action: 'screenshot_prtscn' });
      showToast('📋 PrintScreen key triggered');
    });
  }

  // --- Touchpad Left / Right / Middle Buttons ---
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

  // --- Navigation & Media Shortcuts ---
  document.querySelectorAll('[data-shortcut]').forEach((el) => {
    el.addEventListener('click', () => {
      const action = el.dataset.shortcut;
      ws.send({ type: 'shortcut', action: action });
      if (window.navigator.vibrate) window.navigator.vibrate(15);
    });
  });

  // --- Full Text Input & Clipboard Sync ---
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

  const btnPushClipboard = document.getElementById('btnPushClipboard');
  if (btnPushClipboard && textInputField) {
    btnPushClipboard.addEventListener('click', async () => {
      const text = textInputField.value;
      if (!text) {
        showToast('Please type something first');
        return;
      }
      try {
        const protocol = window.location.protocol;
        const res = await fetch(`${protocol}//${ws.currentHost}/api/clipboard`, {
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
      streamer.resetView();
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

    if (target === 'mirror') {
      streamer.start(45, 75, 0.85);
    } else {
      streamer.stop();
    }

    if (window.navigator.vibrate) window.navigator.vibrate(10);
  }

  // Auto-Update Check
  const btnCheckUpdate = document.getElementById('btnCheckUpdate');
  const updateStatusText = document.getElementById('updateStatusText');

  if (btnCheckUpdate) {
    btnCheckUpdate.addEventListener('click', async () => {
      if (window.AndroidHost && typeof window.AndroidHost.checkForUpdates === 'function') {
        window.AndroidHost.checkForUpdates();
        return;
      }

      showToast('Checking for updates...');
      if (updateStatusText) updateStatusText.textContent = 'Checking...';

      try {
        const protocol = window.location.protocol;
        const res = await fetch(`${protocol}//${ws.currentHost}/api/check-update`);
        const data = await res.json();

        if (data.has_update) {
          if (updateStatusText) updateStatusText.textContent = `New: v${data.latest_version}`;
          if (confirm(`A new update (v${data.latest_version}) is available!\n\nWould you like to download the updated APK?`)) {
            window.location.href = data.download_url || '/PCRemote.apk';
          }
        } else {
          if (updateStatusText) updateStatusText.textContent = 'Up to date';
          showToast(`PC Remote is up to date (v${data.current_version})!`);
        }
      } catch (err) {
        showToast('Could not check updates');
        if (updateStatusText) updateStatusText.textContent = 'Offline';
      }
    });
  }

  requestWakeLock();
});

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
    } catch (err) {}
  }
}
