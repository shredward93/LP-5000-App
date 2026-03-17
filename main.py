"""
LP 5000 AI Assistant Video Editor – entry point.
"""
import tkinter as tk

from gui import LP5000SmartEngine


if __name__ == "__main__":
    root = tk.Tk()
    app = LP5000SmartEngine(root)
    root.mainloop()
