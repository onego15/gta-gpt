"""Convert actual browser capture frames into the README GIF (Pillow required)."""
import json
from pathlib import Path
from PIL import Image

entries = json.loads(Path('.local/capture/frames.json').read_text())
samples = entries[::max(1,len(entries)//20)][:20]
montage = Image.new('RGB', (1200,600))
for i,item in enumerate(samples):
    with Image.open(item['file']) as im:
        montage.paste(im.resize((240,150)), ((i%5)*240,(i//5)*150))
palette = montage.quantize(colors=256)
frames=[]
durations=[]
for i,item in enumerate(entries):
    with Image.open(item['file']) as im:
        frames.append(im.resize((768,480),Image.Resampling.LANCZOS).quantize(palette=palette,dither=Image.Dither.NONE))
    durations.append(max(40,round(((entries[i+1]['time']-item['time']) if i+1<len(entries) else 110)/10)*10))
frames[0].save('docs/demo.gif',save_all=True,append_images=frames[1:],duration=durations,loop=0,optimize=True,disposal=2)
print({'frames':len(frames),'duration_ms':sum(durations),'bytes':Path('docs/demo.gif').stat().st_size})

