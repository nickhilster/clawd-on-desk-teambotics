import math
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent))
from svg2apng import render_animation

ASSETS = Path(__file__).parent.parent
SRC = (ASSETS / "concerned-error.svg").read_text()

N_FRAMES = 6
specs = []
for i in range(N_FRAMES):
    angle = 2 * math.pi * i / N_FRAMES
    dx = 0.6 * math.sin(angle * 2)
    specs.append({"outer_transform": f"translate({dx:.2f} 0)", "duration": 350})

render_animation(SRC, specs, str(ASSETS / "concerned-error.apng"))
