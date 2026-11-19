"""Frame the proof copy on the matched ramp and update the two guide-visibility notes."""
from pathlib import Path
import json
here=Path(__file__).resolve().parent
page=here/'campus-network.html';header,token,txt=page.read_text().partition('const data=')
m,offset=json.JSONDecoder().raw_decode(txt);proof=json.loads((here/'checks.json').read_bytes())
assert proof['runtime']==m['summary']['runtime']
vanished={v['id'] for v in proof['oldGuideLoopsFullyVisible'] if v['previous'] and not v['current']}
for v in m['reviewedViews']:
    if v['id'] in vanished:
        v['note']='The returned public walk has no self-crossing here. The overview follows the shared native hallway. Choose a direction to overlay the measured walk.'
m['reviewedViews']=[v for v in m['reviewedViews'] if v['id']!='student-commons']+[dict(id='student-commons',name='09 · Student Commons shared hallway',level=1450417,building='09',box=[93,430,344,535],
        note='The shared hallway serves the east end of the ramp from Building 07. The room stops and all measured directions use their original coordinates.')]
page.write_text(header+token+json.dumps(m,separators=(',',':'),allow_nan=False).replace('</','<\\/')+txt[offset:])
