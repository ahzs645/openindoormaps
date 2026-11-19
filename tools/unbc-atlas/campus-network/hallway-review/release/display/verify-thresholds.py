"""Replay local-priority selection and check each accepted ordinary room tip in the shipped atlas."""
import argparse
import json
from collections import defaultdict
from pathlib import Path
from rebind import HERE, ROOT, read, graphic, edge,write

def key(row):
    return row[0],*edge(*row[1:])

def main(args):
    patches=args.display; local=defaultdict(set)
    info=read(patches/'rebind-proof.json');receipt=read(args.audit/'installed-receipt.json')
    current=graphic(args.audit)
    atlas=json.JSONDecoder().raw_decode(args.map.read_text().split('const data=',1)[1])[0]
    assert atlas['summary']['runtime']==info['runtimeSha256']==receipt['runtimeSha256']
    assert atlas['summary']['source']==info['sourceDataset']==receipt['datasetSha256']
    prior={l:set(map(key,v)) for l,v in current['visitorSegments'].items()}
    final={l:set(map(key,g['network'])) for l,g in atlas['geo'].items()}
    for name in ('junction','building08'):
        patch=read(patches/name/'display-patch.json')
        assert all(patch[k]==receipt[k] for k in ('runtimeSha256','datasetSha256'))
        l=str(patch['level'])
        local[l].update(map(key,patch['remove']+patch['add']))
    threshold=read(patches/'thresholds/patch.json')
    assert all(threshold[k]==receipt[k] for k in ('runtimeSha256','datasetSha256'))
    count=0;skipped=[]
    for l,level in threshold['levels'].items():
        for b in level['branches']:
            source,rm,add=(set(map(key,b[name])) for name in ('source','remove','add'))
            assert source<=prior[l]
            if source&local[l]:
                skipped.append(b['number']);continue
            assert add<=final[l] and not rm&final[l],b['number']
            count+=1
    result={'datasetSha256':receipt['datasetSha256'],'runtimeSha256':receipt['runtimeSha256'],'finalMapConfirmedThresholds':count,'localPriority':skipped,
            'localApproachesRebound':{name:q['applied'] for name,q in info['local'].items()}}
    write(args.out,result)
    print(result)
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--audit',type=Path,default=HERE.parent/'audit');p.add_argument('--display',type=Path,default=HERE)
    p.add_argument('--map',type=Path,default=ROOT/'campus-network/campus-network.html');p.add_argument('--out',type=Path,default=HERE/'verified-thresholds.json')
    main(p.parse_args())
