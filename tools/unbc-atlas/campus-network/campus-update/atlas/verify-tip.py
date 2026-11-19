"""Check if the previous Ground Floor seam treatment is still valid for current routes."""
from collections import Counter
from pathlib import Path
import os
import sys,json
scripts=Path(__file__).resolve().parent
here=Path(os.environ.get("UNBC_ATLAS_OUTPUT",scripts)).resolve()
campus=scripts.parents[1]
sys.path[:0]=[str(campus),str(campus/'hallway-review/release/display')]
from hallway_tip import tip,direct,LEVEL
from rebind import read,write,witnesses,graphic,LineString,unary_union
old=Path(os.environ.get('UNBC_ATLAS_PREVIOUS_AUDIT',campus/'hallway-review/release/audit'));new=(here.parent/os.environ.get('UNBC_ATLAS_RELEASE','format-replay'))/'audit';out=here/'display'
prior=read(old/'installed-receipt.json');current=read(new/'installed-receipt.json')
assert prior['source']==current['source'] and prior['datasetSha256']==current['datasetSha256']
bound=read(out/'rebind-proof.json')
assert current['compressedSha256']==bound['compressedSha256'] and current['runtimeSha256']==bound['runtimeSha256']
mask=unary_union([LineString([a,b]) for a,b in tip|{direct}]).buffer(.02)
left=witnesses(old,LEVEL,mask,graphic(old));right=witnesses(new,LEVEL,mask,graphic(new))
delta={k:{'added':sum((right[k]-left[k]).values()),'removed':sum((left[k]-right[k]).values())} for k in left}
proof={**{k:current[k] for k in ('datasetSha256','runtimeSha256','compressedSha256')},'previousRuntime':prior['runtimeSha256'],
       'sameLocalUses':all(not any(d.values()) for d in delta.values()),'changes':delta}
write(out/'floor1-tip-replay.json',proof)
print(proof)
