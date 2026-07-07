import sys, math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from svg2apng import render_svg_to_pil, save_apng, render_animation

ASSETS = Path(__file__).parent.parent
TIRED_SRC = (ASSETS / "tired-bored.svg").read_text()
SLEEPING_SRC = (ASSETS / "sleeping.svg").read_text()

# --- yawning: mouth grows into an open yawn ellipse (6 frames) ---
MOUTH_TARGET = '<path d="M 5.8 7.2 L 9.2 7.2" stroke="#1A1A1A" stroke-width="0.35" fill="none" stroke-linecap="round"/>'
assert MOUTH_TARGET in TIRED_SRC, "mouth path not found in tired-bored.svg"

N = 6
frames = []
for i in range(N):
    angle = 2 * math.pi * i / N
    rx = 0.4 + 0.5 * math.sin(angle)
    ry = 0.6 + 0.7 * math.sin(angle)
    replacement = f'<ellipse cx="7.5" cy="7.3" rx="{rx:.2f}" ry="{ry:.2f}" fill="#1A1A1A"/>'
    svg = TIRED_SRC.replace(MOUTH_TARGET, replacement)
    assert svg != TIRED_SRC, "yawn mouth replace failed"
    frames.append(render_svg_to_pil(svg, size=200))
save_apng(frames, str(ASSETS / "yawning.apng"), durations=500, loop=0)

# --- dozing: body-js bobs gently while sleeping (6 frames) ---
BODY_TARGET = '<g id="body-js" transform="translate(0 1) rotate(2 7.5 4)">'
assert BODY_TARGET in SLEEPING_SRC, "body-js transform not found in sleeping.svg"

N = 6
frames = []
for i in range(N):
    angle = 2 * math.pi * i / N
    dy = 1 + 0.6 * math.sin(angle)
    replacement = f'<g id="body-js" transform="translate(0 {dy:.2f}) rotate(2 7.5 4)">'
    svg = SLEEPING_SRC.replace(BODY_TARGET, replacement)
    assert svg != SLEEPING_SRC, "doze body-js replace failed"
    frames.append(render_svg_to_pil(svg, size=200))
save_apng(frames, str(ASSETS / "dozing.apng"), durations=450, loop=0)

# --- collapsing: whole doc tilts/falls, plays once (4 frames) ---
N = 4
specs = []
for i in range(N):
    dy = i * 0.8
    rot = i * 3
    specs.append({
        "outer_transform": f"translate(0 {dy:.2f}) rotate({rot:.2f} 7.5 4)",
        "duration": 200,
    })
render_animation(SLEEPING_SRC, specs, str(ASSETS / "collapsing.apng"), loop=1)
