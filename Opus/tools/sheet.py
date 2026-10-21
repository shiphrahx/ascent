# contact sheet: python tools/sheet.py out.png a.png b.png ... (2 columns, half size)
import sys
from PIL import Image
out, files = sys.argv[1], sys.argv[2:]
ims = [Image.open(f).convert('RGB') for f in files]
w, h = ims[0].size
s = 0.5
tw, th = int(w * s), int(h * s)
cols = 2 if len(ims) > 1 else 1
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (tw * cols, th * rows))
for i, im in enumerate(ims):
    sheet.paste(im.resize((tw, th), Image.LANCZOS), ((i % cols) * tw, (i // cols) * th))
sheet.save(out)
