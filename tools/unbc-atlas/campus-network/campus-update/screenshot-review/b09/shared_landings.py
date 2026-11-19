"""Apply the release-bound overview rule in isolation and write a focused review copy."""
import argparse,json,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
CAMPUS=HERE.parents[2]
sys.path.insert(0,str(CAMPUS))
from landing_overview import apply_reviewed_landings,digest

if __name__=='__main__':
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--audit',type=Path,default=HERE.parents[1]/'final-checked/audit')
    cli.add_argument('--atlas',type=Path,default=HERE.parents[1]/'final-atlas/campus-network.html')
    cli.add_argument('--output',type=Path,default=HERE)
    opt=cli.parse_args();out=opt.output;out.mkdir(exist_ok=True,parents=True)
    assert (out/'campus-network.html').resolve()!=opt.atlas.resolve()
    prefix,sep,suffix=opt.atlas.read_text().partition('const data=');assert sep
    data,end=json.JSONDecoder().raw_decode(suffix)
    proof=apply_reviewed_landings(data,opt.audit);proof['comparisonAtlasSha256']=digest(opt.atlas)
    (out/'proof.json').write_text(json.dumps(proof,indent=2)+'\n')
    b09=next(r for r in proof['landings'] if r['landing']=='ramp:1643796:lower')
    (out/'patch.json').write_text(json.dumps({**{k:proof[k] for k in ['runtime','dataset','cache','comparisonAtlasSha256']},**b09},indent=2)+'\n')
    (out/'campus-network.html').write_text(prefix+sep+json.dumps(data,separators=(',',':'),allow_nan=False).replace('</','<\\/')+suffix[end:])
    print(proof['surveyedEndpoints'],[(v['landing'],len(v['remove'])) for v in proof['landings']])
