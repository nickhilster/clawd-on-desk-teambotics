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
        svg = formula(src, angle, i, n)
        out.append(render_svg_to_pil(svg, size=200))
    return out

# yawning: mouth grows into an O
def yawn_formula(src, angle, i, n):
    r = 0.4 + 0.5 * max(0, math.sin(angle))
    new_svg = src.replace(
        '<path d="M 6.3 6.3 L 8.7 6.3" stroke="#1A1A1A" stroke-width="0.35" stroke-linecap="round"/>',
        f'<ellipse cx="7.5" cy="6.6" rx="{r:.2f}" ry="{r*1.4:.2f}" fill="#1A1A1A"/>'
    )
    assert new_svg != src, "yawn mouth substitution failed to match"
    return new_svg

yawn_frames = frames_for(TIRED, 6, yawn_formula)
save_apng(yawn_frames, str(ASSETS / "yawning.apng"), durations=500, loop=0)

# dozing: slow body bob from the sleeping pose
def doze_formula(src, angle, i, n):
    dy = 0.5 * math.sin(angle)
    new_svg = src.replace('transform="translate(0 0.8) rotate(3 7.5 4)"',
                        f'transform="translate(0 {0.8+dy:.2f}) rotate(3 7.5 4)"')
    assert new_svg != src, "doze body-js substitution failed to match"
    return new_svg

doze_frames = frames_for(SLEEP, 6, doze_formula)
save_apng(doze_frames, str(ASSETS / "dozing.apng"), durations=450, loop=0)

# collapsing: progressive slump, one-shot
collapse_frames = []
N = 4
for i in range(N):
    dy = i * 0.7
    rot = 3 + i * 2.5
    new_svg = SLEEP.replace('transform="translate(0 0.8) rotate(3 7.5 4)"',
                         f'transform="translate(0 {dy:.2f}) rotate({rot:.2f} 7.5 4)"')
    assert new_svg != SLEEP, "collapse body-js substitution failed to match"
    collapse_frames.append(render_svg_to_pil(new_svg, size=200))
save_apng(collapse_frames, str(ASSETS / "collapsing.apng"), durations=200, loop=1)

# waking: stretch out of tired pose, one-shot
wake_frames = []
N = 5
for i in range(N):
    t = i / (N - 1)
    stretch = 1 + 0.12 * t
    new_svg = TIRED.replace('<g id="body-js">', f'<g id="body-js" transform="scale(1 {stretch:.2f})">')
    assert new_svg != TIRED, "wake body-js substitution failed to match"
    wake_frames.append(render_svg_to_pil(new_svg, size=200))
save_apng(wake_frames, str(ASSETS / "waking-stretch.apng"), durations=250, loop=1)
