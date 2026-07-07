import math
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent))
from svg2apng import render_svg_to_pil, save_apng

ASSETS = Path(__file__).parent.parent
TIRED = (ASSETS / "tired-bored.svg").read_text()
SLEEP = (ASSETS / "sleeping.svg").read_text()

def frames_for(src, n, formula):
    out = []
    for i in range(n):
        angle = 2 * math.pi * i / n
        out.append(render_svg_to_pil(formula(src, angle, i, n), size=200))
    return out

def yawn_formula(src, angle, i, n):
    r = 0.35 + 0.4 * max(0, math.sin(angle))
    new_svg = src.replace(
        '<path d="M 6.2 2.5 L 8.8 2.5" stroke="#33422A" stroke-width="0.3" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="7.5" cy="2.7" rx="{r:.2f}" ry="{r*1.3:.2f}" fill="#33422A"/>'
    )
    assert new_svg != src, "yawn mouth substitution failed to match"
    return new_svg

yawn_frames = frames_for(TIRED, 6, yawn_formula)
save_apng(yawn_frames, str(ASSETS / "yawning.apng"), durations=600, loop=0)

def doze_formula(src, angle, i, n):
    dy = 0.4 * math.sin(angle)
    new_svg = src.replace('transform="translate(0 0.5)"', f'transform="translate(0 {0.5+dy:.2f})"')
    assert new_svg != src, "doze body-js substitution failed to match"
    return new_svg

doze_frames = frames_for(SLEEP, 6, doze_formula)
save_apng(doze_frames, str(ASSETS / "dozing.apng"), durations=500, loop=0)

collapse_frames = []
N = 4
for i in range(N):
    dy = i * 0.6
    new_svg = SLEEP.replace('transform="translate(0 0.5)"', f'transform="translate(0 {dy:.2f})"')
    assert new_svg != SLEEP, "collapse body-js substitution failed to match"
    collapse_frames.append(render_svg_to_pil(new_svg, size=200))
save_apng(collapse_frames, str(ASSETS / "collapsing.apng"), durations=220, loop=1)

wake_frames = []
N = 5
for i in range(N):
    t = i / (N - 1)
    stretch = 1 + 0.1 * t
    new_svg = TIRED.replace('<g id="body-js">', f'<g id="body-js" transform="scale(1 {stretch:.2f})">')
    assert new_svg != TIRED, "wake body-js substitution failed to match"
    wake_frames.append(render_svg_to_pil(new_svg, size=200))
save_apng(wake_frames, str(ASSETS / "waking-stretch.apng"), durations=280, loop=1)
