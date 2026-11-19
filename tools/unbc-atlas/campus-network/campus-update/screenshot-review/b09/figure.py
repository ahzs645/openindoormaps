"""Show the matched campus crop and equally scaled detail of the affected shared hallway."""
import json, math
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from inventory import unpack
here=Path(__file__).resolve().parent; update=here.parents[1];base=unpack(update/'final-atlas/campus-network.html');now=unpack(here/'campus-network.html');lv='1450417'
fontdir='/usr/share/fonts/truetype/dejavu/'
def font(size,bold=False):return ImageFont.truetype(fontdir+('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf'),size)
paper='#f6f7f2';body='#16382d';muted='#4d655e';ink='#196650';wall='#b3bcb4';amber='#b26316'
im=Image.new('RGB',(1640,1190),paper);draw=ImageDraw.Draw(im)
draw.text((55,32),'Building 09 · Floor 0.5',font=font(46,True),fill=body)
draw.text((56,100),'The east end of the ramp from Building 07 meets the shared hallway.',font=font(23),fill=muted)
def panel(data,frame,extent):
    l,t,r,b=frame; a,c,e,f=extent
    p=Image.new('RGB',(r-l,b-t),'#fafbf8');d=ImageDraw.Draw(p)
    scale=min((r-l-30)/(e-a),(b-t-30)/(f-c))
    def xy(q):return (round((r-l)/2+(q[0]-(a+e)/2)*scale),round((b-t)/2-(q[1]-(f+c)/2)*scale))
    def lines(pts,col,w=1):
        if len(pts)>1:d.line([xy(q) for q in pts],fill=col,width=w,joint='curve')
    g=data['geo'][lv]
    for ring in g['rings']:
        pts=[g['coords'][q] for q in ring];lines(pts+pts[:1],wall,1)
    for _,u,v in g['network']:lines([u,v],ink,3)
    for tr in data['transfers']:
        if int(lv) not in tr['layers']:continue
        typ=tr['type'];st=tr['status']
        path=tr['paths'].get(lv,[])
        if path and typ=='Ramp':lines(path,amber,3)
        for end in tr['ends']:
            if end['l']!=int(lv):continue
            x,y=xy(end['xy'])
            if typ=='Ramp':d.polygon([(x,y-6),(x+6,y),(x,y+6),(x-6,y)],fill=amber,outline='white')
            elif typ=='Local steps':d.polygon([(x,y-7),(x+7,y+6),(x-7,y+6)],fill='#704a96',outline='white')
            elif typ=='Lift':d.ellipse((x-6,y-6,x+6,y+6),fill='#215a99',outline='white',width=1)
            elif st=='Held':d.ellipse((x-6,y-6,x+6,y+6),fill='white',outline=amber,width=2)
    d.rectangle((0,0,r-l-1,b-t-1),outline='#bbc7bc',width=2)
    im.paste(p,(l,t))
draw.text((56,161),'Floor context',font=font(24,True),fill=body)
panel(now,(55,209,1585,484),(99,432,349,529))
draw.text((56,524),'Previous overview',font=font(27,True),fill=body)
draw.text((841,524),'Shared hallway overview',font=font(27,True),fill=body)
extent=(103,431,223,530)
panel(base,(55,578,802,1034),extent);panel(now,(837,578,1584,1034),extent)
draw.text((56,1063),'The previous view drew 13 alternative approaches from the same ramp landing.',font=font(21),fill=body)
draw.text((56,1101),'The revised view keeps one hallway network, the ramp connection, and the branches to individual doors.',font=font(21),fill=body)
draw.text((56,1148),'Green   Public walking network       Amber   Ramp       Purple   Local steps       Blue   Lift',font=font(18),fill=muted)
im.save(here/'building09-overview-comparison.png',optimize=True)
