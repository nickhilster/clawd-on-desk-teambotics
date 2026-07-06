"""Reusable SVG-frame -> APNG pipeline for Spark animations.
Renders SVG strings via PyQt5's QSvgRenderer, then encodes the PNG sequence
as an APNG using Pillow. Run each animation script with this as a library.
"""
import sys
import io
from PyQt5.QtSvg import QSvgRenderer
from PyQt5.QtGui import QImage, QPainter
from PyQt5.QtCore import QByteArray
from PyQt5.QtWidgets import QApplication
from PIL import Image

_app = None


def get_app():
    global _app
    if _app is None:
        _app = QApplication.instance() or QApplication(sys.argv)
    return _app


def render_svg_to_pil(svg_text: str, size: int = 200) -> Image.Image:
    get_app()
    renderer = QSvgRenderer(QByteArray(svg_text.encode("utf-8")))
    if not renderer.isValid():
        raise ValueError("Invalid SVG")
    img = QImage(size, size, QImage.Format_ARGB32)
    img.fill(0)
    painter = QPainter(img)
    painter.setRenderHint(QPainter.Antialiasing, True)
    renderer.render(painter)
    painter.end()
    buf = QByteArray()
    from PyQt5.QtCore import QBuffer
    qbuf = QBuffer(buf)
    qbuf.open(QBuffer.WriteOnly)
    img.save(qbuf, "PNG")
    return Image.open(io.BytesIO(bytes(buf))).convert("RGBA")


import re


def wrap_outer(svg: str, transform: str) -> str:
    """Wrap everything inside <svg ...> in a <g transform="..."> so any
    source file (even ones without a pre-existing top group) can be
    bounced/rotated/scaled as a whole."""
    m = re.search(r"(<svg[^>]*>)(.*)(</svg>)", svg, re.S)
    head, body, tail = m.group(1), m.group(2), m.group(3)
    return f'{head}<g transform="{transform}">{body}</g>{tail}'


def apply_subs(svg: str, subs) -> str:
    """subs: list of (pattern, repl) pairs, applied with re.sub in order."""
    for pattern, repl in subs:
        svg = re.sub(pattern, repl, svg)
    return svg


def render_animation(svg_src, frame_specs, out_path, size=200, loop=0):
    """frame_specs: list of dicts with optional keys:
    - outer_transform: str, wraps whole doc in a <g transform=...>
    - subs: list of (regex, repl) applied before wrapping
    - duration: ms for this frame (defaults to 400)
    """
    frames = []
    durations = []
    for spec in frame_specs:
        svg = svg_src
        for pattern, repl in spec.get("subs", []):
            svg = re.sub(pattern, repl, svg)
        if "outer_transform" in spec:
            svg = wrap_outer(svg, spec["outer_transform"])
        frames.append(render_svg_to_pil(svg, size=size))
        durations.append(spec.get("duration", 400))
    save_apng(frames, out_path, durations, loop=loop)


def save_apng(frames, out_path: str, durations, loop: int = 0):
    """frames: list[PIL.Image], durations: int or list[int] (ms).

    Every frame is forced to fully replace the canvas (blend=OP_SOURCE).
    Pillow's default per-frame bbox diffing assumes disposal correctly
    clears untouched regions, but with disposal=BACKGROUND it can crop a
    frame down to just its changed pixels and drop static regions (e.g. the
    body) that were disposed to transparent a frame earlier. OP_SOURCE on
    every frame avoids that entirely.
    """
    from PIL import PngImagePlugin

    if isinstance(durations, int):
        durations = [durations] * len(frames)
    frames[0].save(
        out_path,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=loop,
        disposal=PngImagePlugin.Disposal.OP_BACKGROUND,
        blend=PngImagePlugin.Blend.OP_SOURCE,
    )
    print(f"wrote {out_path} ({len(frames)} frames)")
