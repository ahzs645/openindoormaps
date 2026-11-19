"""Assemble the 12 native-level map views in physical elevation order."""
from pathlib import Path
import json,sys
from PIL import Image,ImageDraw,ImageFont,ImageChops,ImageOps
p=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parent
s=(p/'campus-network.html').read_text()
data=json.JSONDecoder().raw_decode(s.split('const data=',1)[1])[0]
fontroot=Path('/usr/share/fonts/truetype/dejavu')
def font(name,size):return ImageFont.truetype(str(fontroot/(name+'.ttf')),size)
out=Image.new('RGB',(1650,1460),'#f5f5ee')
draw=ImageDraw.Draw(out)
draw.line((38,27,1612,27),fill='#205448',width=5)
draw.text((38,42),'UNBC campus walking network',font=font('DejaVuSerif-Bold',43),fill='#193932')
draw.text((40,109),'All 12 native levels across Buildings 03–10. Each panel is fitted to its own extent.',font=font('DejaVuSans',21),fill='#395748')
for i,key in enumerate(data['levels']):
    g=data['geo'][str(key)];x=38+(i%4)*397;y=166+(i//4)*398
    draw.rounded_rectangle((x,y,x+378,y+380),radius=8,fill='#fafbf8',outline='#bccbc1',width=2)
    draw.text((x+12,y+8),g['name'],font=font('DejaVuSerif-Bold',23),fill='#193932')
    caption='Public hallway network' if g['network'] else ('Floorplan · no public hallway lines' if g['exported'] else 'Source geometry · no visitor floorplan')
    draw.text((x+12,y+44),caption,font=font('DejaVuSans',15),fill='#496351')
    im=Image.open(p/'floor-images'/f'{key}.png').convert('RGB')
    bounds=ImageChops.difference(im,Image.new('RGB',im.size,im.getpixel((0,0)))).getbbox()
    if bounds:
        im=im.crop(bounds)
        im=ImageOps.contain(im,(352,294),Image.Resampling.LANCZOS)
        out.paste(im,(x+(378-im.width)//2,y+70+(296-im.height)//2))
draw.text((40,1382),'Public pathways in green      Lifts in blue      Stairs and local steps in purple      Ramps in amber',font=font('DejaVuSans',18),fill='#193932')
draw.text((40,1418),'Open orange circles mark held stairs. Use the interactive map to zoom to a landing and inspect its connections.',font=font('DejaVuSans',17),fill='#395748')
out.save(p/'all-campus-levels.png')
