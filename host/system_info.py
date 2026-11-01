"""
System utilities: Battery status, Clipboard sync, IP discovery, and Screenshot storage.
"""

import ctypes
from ctypes import wintypes
import socket
import os
import win32clipboard
import win32con

class SYSTEM_POWER_STATUS(ctypes.Structure):
    _fields_ = [
        ('ACLineStatus', wintypes.BYTE),
        ('BatteryFlag', wintypes.BYTE),
        ('BatteryLifePercent', wintypes.BYTE),
        ('SystemStatusFlag', wintypes.BYTE),
        ('BatteryLifeTime', wintypes.DWORD),
        ('BatteryFullLifeTime', wintypes.DWORD),
    ]

class SystemManager:
    @staticmethod
    def get_local_ip():
        """Returns the primary LAN IP address of this machine."""
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            # Connecting to a dummy external address queries the route table without sending packets
            s.connect(('8.8.8.8', 80))
            ip = s.getsockname()[0]
        except Exception:
            ip = '127.0.0.1'
        finally:
            s.close()
        return ip

    @staticmethod
    def get_battery_info():
        """Returns battery percentage and AC charging state."""
        sps = SYSTEM_POWER_STATUS()
        if ctypes.windll.kernel32.GetSystemPowerStatus(ctypes.byref(sps)):
            percent = int(sps.BatteryLifePercent)
            is_charging = (sps.ACLineStatus == 1)
            # 255 indicates unknown/no battery (e.g. desktop PC)
            return {
                "percent": percent if percent <= 100 else 100,
                "is_charging": is_charging,
                "has_battery": (sps.BatteryFlag != 128 and percent <= 100)
            }
        return {"percent": 100, "is_charging": True, "has_battery": False}

    @staticmethod
    def get_clipboard_text():
        """Reads text from Windows clipboard."""
        try:
            win32clipboard.OpenClipboard()
            if win32clipboard.IsClipboardFormatAvailable(win32con.CF_UNICODETEXT):
                data = win32clipboard.GetClipboardData(win32con.CF_UNICODETEXT)
                return str(data)
            return ""
        except Exception:
            return ""
        finally:
            try:
                win32clipboard.CloseClipboard()
            except Exception:
                pass

    @staticmethod
    def set_clipboard_text(text):
        """Copies text to Windows clipboard."""
        try:
            win32clipboard.OpenClipboard()
            win32clipboard.EmptyClipboard()
            win32clipboard.SetClipboardData(win32con.CF_UNICODETEXT, str(text))
            return True
        except Exception:
            return False
        finally:
            try:
                win32clipboard.CloseClipboard()
            except Exception:
                pass
