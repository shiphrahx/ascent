# Packs Poly Haven maps into two 1024 JPEGs per material:
#   <name>_alb.jpg : diffuse with a soft dose of the AO baked in
#   <name>_nh.jpg  : R,G = OpenGL normal xy, B = height (stretched to full range)
import sys
from PIL import Image, ImageChops
import numpy as np
src, dst = sys.argv[1], sys.argv[2]
mats = {'sandstone_cracks': 'tuff', 'grass_path_2': 'steppe', 'gravelly_sand': 'soil', 'brown_mud_dry': 'plowed'}
N = 1024
for ph, name in mats.items():
    ld = lambda m, mode: Image.open(f'{src}/{ph}_{m}.jpg').convert(mode).resize((N, N), Image.LANCZOS)
    diff = np.asarray(ld('diff', 'RGB')).astype(np.float32) / 255
    ao = np.asarray(ld('ao', 'L')).astype(np.float32) / 255
    alb = diff * (ao[..., None] ** 0.6)
    Image.fromarray((np.clip(alb, 0, 1) * 255 + 0.5).astype(np.uint8)).save(f'{dst}/{name}_alb.jpg', quality=84, subsampling=0)
    nor = np.asarray(ld('nor_gl', 'RGB')).astype(np.float32)
    h = np.asarray(ld('disp', 'L')).astype(np.float32)
    lo, hi = np.percentile(h, 1), np.percentile(h, 99)
    h = np.clip((h - lo) / max(hi - lo, 1) * 255, 0, 255)
    nh = np.stack([nor[..., 0], nor[..., 1], h], -1)
    Image.fromarray((nh + 0.5).astype(np.uint8)).save(f'{dst}/{name}_nh.jpg', quality=80, subsampling=0)
    print(name, 'mean albedo', alb.reshape(-1, 3).mean(0).round(3))
