"""
Windows Input Simulation Engine: Mouse, Touch, Stylus, Keyboard, and Shortcuts.
Uses Windows SendInput and user32 APIs directly for zero-latency response.
"""

import ctypes
from ctypes import wintypes
import time

user32 = ctypes.windll.user32

# Mouse flags
MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP = 0x0010
MOUSEEVENTF_MIDDLEDOWN = 0x0020
MOUSEEVENTF_MIDDLEUP = 0x0040
MOUSEEVENTF_WHEEL = 0x0800
MOUSEEVENTF_HWHEEL = 0x1000
MOUSEEVENTF_ABSOLUTE = 0x8000

# Keyboard flags
KEYEVENTF_EXTENDEDKEY = 0x0001
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004
KEYEVENTF_SCANCODE = 0x0008

INPUT_MOUSE = 0
INPUT_KEYBOARD = 1
INPUT_HARDWARE = 2

# Virtual Key Codes
VK_BACK = 0x08
VK_TAB = 0x09
VK_RETURN = 0x0D
VK_SHIFT = 0x10
VK_CONTROL = 0x11
VK_MENU = 0x12 # Alt
VK_PAUSE = 0x13
VK_CAPITAL = 0x14
VK_ESCAPE = 0x1B
VK_SPACE = 0x20
VK_PRIOR = 0x21 # Page Up
VK_NEXT = 0x22 # Page Down
VK_END = 0x23
VK_HOME = 0x24
VK_LEFT = 0x25
VK_UP = 0x26
VK_RIGHT = 0x27
VK_DOWN = 0x28
VK_SNAPSHOT = 0x2C # PrintScreen
VK_INSERT = 0x2D
VK_DELETE = 0x2E
VK_LWIN = 0x5B
VK_RWIN = 0x5C

# Multimedia Keys
VK_VOLUME_MUTE = 0xAD
VK_VOLUME_DOWN = 0xAE
VK_VOLUME_UP = 0xAF
VK_MEDIA_NEXT_TRACK = 0xB0
VK_MEDIA_PREV_TRACK = 0xB1
VK_MEDIA_STOP = 0xB2
VK_MEDIA_PLAY_PAUSE = 0xB3

# Structure definitions for SendInput
class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ('dx', wintypes.LONG),
        ('dy', wintypes.LONG),
        ('mouseData', wintypes.DWORD),
        ('dwFlags', wintypes.DWORD),
        ('time', wintypes.DWORD),
        ('dwExtraInfo', ctypes.c_size_t)
    ]

class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ('wVk', wintypes.WORD),
        ('wScan', wintypes.WORD),
        ('dwFlags', wintypes.DWORD),
        ('time', wintypes.DWORD),
        ('dwExtraInfo', ctypes.c_size_t)
    ]

class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [
        ('uMsg', wintypes.DWORD),
        ('wParamL', wintypes.WORD),
        ('wParamH', wintypes.WORD)
    ]

class INPUT(ctypes.Structure):
    class _INPUT(ctypes.Union):
        _fields_ = [
            ('mi', MOUSEINPUT),
            ('ki', KEYBDINPUT),
            ('hi', HARDWAREINPUT)
        ]
    _anonymous_ = ('_input',)
    _fields_ = [
        ('type', wintypes.DWORD),
        ('_input', _INPUT)
    ]

LPINPUT = ctypes.POINTER(INPUT)
user32.SendInput.argtypes = [wintypes.UINT, LPINPUT, ctypes.c_int]
user32.SendInput.restype = wintypes.UINT


class InputController:
    def __init__(self):
        self.screen_width = user32.GetSystemMetrics(0)
        self.screen_height = user32.GetSystemMetrics(1)

    def refresh_screen_size(self):
        self.screen_width = user32.GetSystemMetrics(0)
        self.screen_height = user32.GetSystemMetrics(1)
        return self.screen_width, self.screen_height

    # --- Mouse Movement & Clicking ---

    def move_mouse_relative(self, dx, dy):
        """Relative cursor movement (used for trackpad mode)."""
        user32.mouse_event(MOUSEEVENTF_MOVE, int(dx), int(dy), 0, 0)

    def move_mouse_absolute(self, x, y):
        """Absolute cursor placement (used for direct touch & stylus mode)."""
        w, h = self.refresh_screen_size()
        clamped_x = max(0, min(w - 1, int(x)))
        clamped_y = max(0, min(h - 1, int(y)))
        user32.SetCursorPos(clamped_x, clamped_y)

    def mouse_down(self, button='left'):
        flags = {
            'left': MOUSEEVENTF_LEFTDOWN,
            'right': MOUSEEVENTF_RIGHTDOWN,
            'middle': MOUSEEVENTF_MIDDLEDOWN
        }.get(button.lower(), MOUSEEVENTF_LEFTDOWN)
        user32.mouse_event(flags, 0, 0, 0, 0)

    def mouse_up(self, button='left'):
        flags = {
            'left': MOUSEEVENTF_LEFTUP,
            'right': MOUSEEVENTF_RIGHTUP,
            'middle': MOUSEEVENTF_MIDDLEUP
        }.get(button.lower(), MOUSEEVENTF_LEFTUP)
        user32.mouse_event(flags, 0, 0, 0, 0)

    def mouse_click(self, button='left'):
        self.mouse_down(button)
        time.sleep(0.01)
        self.mouse_up(button)

    def mouse_double_click(self, button='left'):
        self.mouse_click(button)
        time.sleep(0.05)
        self.mouse_click(button)

    def mouse_wheel(self, delta_y):
        """Vertical scroll (positive is up, negative is down)."""
        # Windows standard wheel delta is 120
        delta = int(delta_y * 120)
        user32.mouse_event(MOUSEEVENTF_WHEEL, 0, 0, delta, 0)

    def mouse_hwheel(self, delta_x):
        """Horizontal scroll."""
        delta = int(delta_x * 120)
        user32.mouse_event(MOUSEEVENTF_HWHEEL, 0, 0, delta, 0)

    # --- Keyboard & Text Input ---

    def send_key_event(self, vk_code, is_up=False, is_extended=False):
        """Send virtual key event via keybd_event."""
        flags = 0
        if is_up:
            flags |= KEYEVENTF_KEYUP
        if is_extended:
            flags |= KEYEVENTF_EXTENDEDKEY
        user32.keybd_event(vk_code, 0, flags, 0)

    def press_key(self, vk_code, is_extended=False):
        self.send_key_event(vk_code, is_up=False, is_extended=is_extended)
        time.sleep(0.01)
        self.send_key_event(vk_code, is_up=True, is_extended=is_extended)

    def type_unicode_text(self, text):
        """Types unicode string using SendInput (supports emojis and any language)."""
        inputs = []
        for char in text:
            code = ord(char)
            # Key down
            ki_down = KEYBDINPUT(0, code, KEYEVENTF_UNICODE, 0, 0)
            inp_down = INPUT(INPUT_KEYBOARD)
            inp_down.ki = ki_down
            inputs.append(inp_down)

            # Key up
            ki_up = KEYBDINPUT(0, code, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, 0, 0)
            inp_up = INPUT(INPUT_KEYBOARD)
            inp_up.ki = ki_up
            inputs.append(inp_up)

        if inputs:
            array_type = INPUT * len(inputs)
            inp_array = array_type(*inputs)
            user32.SendInput(len(inputs), inp_array, ctypes.sizeof(INPUT))

    # --- Shortcuts & Quick Actions ---

    def execute_shortcut(self, action_name):
        action = action_name.lower().strip()

        if action == "screenshot_snip":
            # Win + Shift + S (Windows Snipping Tool)
            self.send_key_event(VK_LWIN, False)
            self.send_key_event(VK_SHIFT, False)
            self.send_key_event(ord('S'), False)
            time.sleep(0.02)
            self.send_key_event(ord('S'), True)
            self.send_key_event(VK_SHIFT, True)
            self.send_key_event(VK_LWIN, True)

        elif action == "screenshot_prtscn":
            # Native PrintScreen key
            self.press_key(VK_SNAPSHOT, is_extended=True)

        elif action == "show_desktop":
            # Win + D
            self.send_key_event(VK_LWIN, False)
            self.press_key(ord('D'))
            self.send_key_event(VK_LWIN, True)

        elif action == "task_view":
            # Win + Tab
            self.send_key_event(VK_LWIN, False)
            self.press_key(VK_TAB)
            self.send_key_event(VK_LWIN, True)

        elif action == "alt_tab":
            # Alt + Tab
            self.send_key_event(VK_MENU, False)
            self.press_key(VK_TAB)
            self.send_key_event(VK_MENU, True)

        elif action == "lock_pc":
            # Win + L
            user32.LockWorkStation()

        elif action == "task_manager":
            # Ctrl + Shift + Esc
            self.send_key_event(VK_CONTROL, False)
            self.send_key_event(VK_SHIFT, False)
            self.press_key(VK_ESCAPE)
            self.send_key_event(VK_SHIFT, True)
            self.send_key_event(VK_CONTROL, True)

        # Media controls
        elif action == "volume_up":
            self.press_key(VK_VOLUME_UP, is_extended=True)
        elif action == "volume_down":
            self.press_key(VK_VOLUME_DOWN, is_extended=True)
        elif action == "volume_mute":
            self.press_key(VK_VOLUME_MUTE, is_extended=True)
        elif action == "play_pause":
            self.press_key(VK_MEDIA_PLAY_PAUSE, is_extended=True)
        elif action == "next_track":
            self.press_key(VK_MEDIA_NEXT_TRACK, is_extended=True)
        elif action == "prev_track":
            self.press_key(VK_MEDIA_PREV_TRACK, is_extended=True)

        # Editing
        elif action == "copy":
            self.send_key_event(VK_CONTROL, False)
            self.press_key(ord('C'))
            self.send_key_event(VK_CONTROL, True)
        elif action == "paste":
            self.send_key_event(VK_CONTROL, False)
            self.press_key(ord('V'))
            self.send_key_event(VK_CONTROL, True)
        elif action == "undo":
            self.send_key_event(VK_CONTROL, False)
            self.press_key(ord('Z'))
            self.send_key_event(VK_CONTROL, True)
        elif action == "select_all":
            self.send_key_event(VK_CONTROL, False)
            self.press_key(ord('A'))
            self.send_key_event(VK_CONTROL, True)

        # Windows Virtual Desktops
        elif action == "desktop_left":
            # Win + Ctrl + Left
            self.send_key_event(VK_LWIN, False)
            self.send_key_event(VK_CONTROL, False)
            self.press_key(VK_LEFT, is_extended=True)
            self.send_key_event(VK_CONTROL, True)
            self.send_key_event(VK_LWIN, True)
        elif action == "desktop_right":
            # Win + Ctrl + Right
            self.send_key_event(VK_LWIN, False)
            self.send_key_event(VK_CONTROL, False)
            self.press_key(VK_RIGHT, is_extended=True)
            self.send_key_event(VK_CONTROL, True)
            self.send_key_event(VK_LWIN, True)

        # Special individual keys
        elif action == "esc":
            self.press_key(VK_ESCAPE)
        elif action == "enter":
            self.press_key(VK_RETURN)
        elif action == "backspace":
            self.press_key(VK_BACK)
        elif action == "tab":
            self.press_key(VK_TAB)
        elif action == "win":
            self.press_key(VK_LWIN)
        elif action == "up":
            self.press_key(VK_UP, is_extended=True)
        elif action == "down":
            self.press_key(VK_DOWN, is_extended=True)
        elif action == "left":
            self.press_key(VK_LEFT, is_extended=True)
        elif action == "right":
            self.press_key(VK_RIGHT, is_extended=True)
        else:
            return False
        return True
