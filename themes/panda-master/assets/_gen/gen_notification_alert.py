import sys, math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from svg2apng import render_animation

ASSETS = Path(__file__).parent.parent
SRC = (ASSETS / "playful-mischievous.svg").read_text()

N = 6
specs = []
for i in range(N):
    angle = 2 * math.pi * i / N
    dx = 1.5 * math.sin(angle * 3)
    specs.append({
        "outer_transform": f"translate({dx:.2f} 0)",
        "duration": 250,
    })

render_animation(SRC, specs, str(ASSETS / "notification-alert.apng"))
