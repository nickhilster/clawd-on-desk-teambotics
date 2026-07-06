import sys, math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from svg2apng import render_animation

ASSETS = Path(__file__).parent.parent
SRC = (ASSETS / "playful-mischievous.svg").read_text()

N_FRAMES = 8
specs = []
for i in range(N_FRAMES):
    angle = 2 * math.pi * i / N_FRAMES
    jump = -2.5 * max(0, math.sin(angle))
    tilt = 8 * math.sin(angle)
    specs.append({
        "outer_transform": f"translate(0 {jump:.2f}) rotate({tilt:.2f} 7.5 4)",
        "duration": 350,
    })

render_animation(SRC, specs, str(ASSETS / "happy-excited.apng"))
