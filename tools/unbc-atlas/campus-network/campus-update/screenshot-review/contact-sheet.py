"""Label the five equal-extent current/previous geometry pairs for offline reading."""
from pathlib import Path
import json
from PIL import Image,ImageFont,ImageDraw,ImageOps
here=Path(__file__).resolve().parent/'atlas'
data=json.loads((here/'screenshot-panel-checks.json').read_bytes())
names={'conference-lobby':('06','Floor 2','Lecture theatres and lobby'),'agora-lecture':('07','Floor 1','Agora and lecture hall'),
       'raised-rotunda':('04','Floor 1','Approaching the raised rotunda'),'agora-switchback':('07','Floor 1','Ramps to Buildings 08 and 09'),
       'student-commons':('09','Floor 0.5','Student Commons hallway'),
       'stair-6-upper-hall':('06','Floor 3.5','Flat landing beside Stair 6')}
font='/usr/share/fonts/truetype/dejavu/DejaVuSans'
f=lambda sz,b=False:ImageFont.truetype(font+('-Bold' if b else '')+'.ttf',sz)
height=250+500*len(data['newScreens'])
im=Image.new('RGB',(1640,height),'#f4f6f0');d=ImageDraw.Draw(im)
d.text((45,24),'Campus walking connections',font=f(43,True),fill='#193a31')
d.text((47,90),'Previous and current hallway drawings at the same scale within each row.',font=f(23),fill='#425a50')
d.text((50,145),'Previous overview',font=f(25,True),fill='#264a40');d.text((840,145),'Current overview',font=f(25,True),fill='#264a40')
for i,r in enumerate(data['newScreens']):
    x0=50;y=195+i*500;b,lv,name=names[r['id']]
    d.text((x0,y),f'{name} · Building {b} · {lv}',font=f(25,True),fill='#193a31')
    for j,suffix in enumerate(['before','after']):
        p=Image.open(here/'focus-images'/f"{r['id']}-{suffix}.png").convert('RGB')
        tile=ImageOps.contain(p,(750,438),Image.Resampling.LANCZOS)
        x=50+790*j;d.rectangle((x,y+42,x+750,y+486),fill='#fafbf8',outline='#b3c4b8',width=1)
        im.paste(tile,(x+(750-tile.width)//2,y+44+(438-tile.height)//2))
d.text((50,height-50),'Open the interactive atlas to select an actual walk, change floors or inspect a transfer landing.',font=f(22),fill='#425a50')
im.save(here/'screenshot-locations.png',optimize=True)
