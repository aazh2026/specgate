#!/usr/bin/env python3
"""
Render an animated terminal demo GIF for specgate.

Usage: python3 scripts/make-demo-gif.py <output.gif>

Pure stdlib + Pillow. No external capture tooling required, so the demo can be
regenerated on any machine that can run the CLI.
"""

import os
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

FONT_PATH = "/System/Library/Fonts/Menlo.ttc"
FONT_SIZE = 15
PAD = 18
LINE_HEIGHT = 22
TITLEBAR = 34

BG = (22, 24, 30)
TITLE_BG = (32, 35, 43)
FG = (222, 226, 233)
PROMPT = (108, 190, 130)
CMD = (240, 244, 250)
DIM = (128, 136, 150)
GREEN = (126, 200, 140)
YELLOW = (222, 178, 106)
RED = (226, 116, 116)
BLUE = (128, 178, 235)

CURSOR = (240, 244, 250)


def load_font(size):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except Exception:
        return ImageFont.load_default()


def run_specgate():
    """Run the CLI against the bundled example and capture real output."""
    example = os.path.join(ROOT, "examples", "invoice-export")
    result = subprocess.run(
        ["node", os.path.join(ROOT, "bin", "specgate.js"), example],
        capture_output=True,
        text=True,
        cwd=ROOT,
    )
    return result.stdout or result.stderr


def color_for(line):
    """Pick a colour per output line based on its content."""
    if "covered" in line and "uncovered" not in line:
        return GREEN
    if "uncovered" in line and "✗" in line:
        return RED
    if "untested" in line and "!" in line:
        return YELLOW
    if "Requirement coverage:" in line:
        return BLUE
    return FG


def build_frames(lines):
    """Build a list of frames: text appears progressively, then holds."""
    font = load_font(FONT_SIZE)
    mono = font  # Menlo is monospace

    # Measure the widest line to size the canvas.
    max_chars = max((len(l) for l in lines), default=40)
    char_w = mono.getlength("M")
    width = int(PAD * 2 + char_w * max(max_chars, 44)) + 20
    height = int(TITLEBAR + PAD * 2 + LINE_HEIGHT * (len(lines) + 3))

    frames = []

    def render(visible_lines, cursor_on):
        img = Image.new("RGB", (width, height), BG)
        d = ImageDraw.Draw(img)

        # Title bar
        d.rectangle([0, 0, width, TITLEBAR], fill=TITLE_BG)
        for i, col in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
            cx = 18 + i * 18
            d.ellipse([cx - 6, TITLEBAR // 2 - 6, cx + 6, TITLEBAR // 2 + 6], fill=col)
        d.text((width // 2, TITLEBAR // 2), "specgate — requirement coverage",
               font=load_font(13), fill=DIM, anchor="mm")

        y = TITLEBAR + PAD
        for idx, line in enumerate(visible_lines):
            if line.startswith("$ "):
                d.text((PAD, y), "$", font=mono, fill=PROMPT)
                d.text((PAD + char_w * 2, y), line[2:], font=mono, fill=CMD)
            elif line.startswith("  Requirement coverage"):
                d.text((PAD, y), line, font=mono, fill=BLUE)
            elif line.strip().startswith("✗") or "uncovered " in line:
                d.text((PAD, y), line, font=mono, fill=RED)
            elif line.strip().startswith("!") or "untested " in line:
                d.text((PAD, y), line, font=mono, fill=YELLOW)
            elif line.strip().startswith("✔") or line.strip().startswith("covered"):
                d.text((PAD, y), line, font=mono, fill=GREEN)
            elif line.strip() == "":
                pass
            else:
                d.text((PAD, y), line, font=mono, fill=color_for(line))
            y += LINE_HEIGHT

        # Blinking cursor on the last line
        if cursor_on and visible_lines:
            cy = TITLEBAR + PAD + LINE_HEIGHT * (len(visible_lines) - 1)
            d.rectangle([PAD, cy + 3, PAD + char_w * 0.6, cy + LINE_HEIGHT - 5], fill=CURSOR)

        return img

    # Frame 1: just the prompt, typed out character by character.
    cmd = "npx github:aazh2026/specgate"
    for i in range(1, len(cmd) + 1):
        frames.append(render(["$ " + cmd[:i]], True))

    # Then the output appears line by line.
    for i in range(1, len(lines) + 1):
        frames.append(render(["$ " + cmd] + lines[:i], True))

    # Hold on the final frame.
    final = render(["$ " + cmd] + lines, False)
    frames.extend([final] * 18)

    return frames


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "assets", "demo.gif")
    os.makedirs(os.path.dirname(out), exist_ok=True)

    raw = run_specgate()
    lines = raw.split("\n")
    while lines and lines[-1].strip() == "":
        lines.pop()

    frames = build_frames(lines)
    print(f"rendering {len(frames)} frames -> {out}")

    # ~40ms per frame while typing, slower for the hold.
    durations = [40] * (len(frames) - 18) + [120] * 18

    frames[0].save(
        out,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        optimize=True,
    )
    print(f"done: {out} ({os.path.getsize(out) // 1024} KB)")


if __name__ == "__main__":
    main()
