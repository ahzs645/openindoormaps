#!/usr/bin/env python3
"""Restore one deduplicated CAD snapshot into a new directory.

ZIP entry bytes are preserved; reconstructed ZIP container metadata may differ.
"""
import argparse,hashlib,json,shutil,zipfile
from pathlib import Path

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--receipt',type=Path,required=True);p.add_argument('--archive',type=Path,required=True);p.add_argument('--current',type=Path,required=True);p.add_argument('--snapshot',required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
 if Path(a.snapshot).name!=a.snapshot or a.snapshot in ('.','..') or a.out.exists():raise ValueError('Choose a single snapshot name and a new output directory')
 r=json.loads(a.receipt.read_text());old=Path(r['archive']);current=Path(r['currentPackage']);snapshot=old/a.snapshot
 def retained(name,h):
  source=Path(name)
  if source.is_relative_to(old):source=a.archive/source.relative_to(old)
  elif source.is_relative_to(current):source=a.current/source.relative_to(current)
  else:raise ValueError('Retained source outside recorded archive/current package')
  if hashlib.sha256(source.read_bytes()).hexdigest()!=h:raise ValueError('Retained source changed: '+str(source))
  return source
 if not (a.archive/a.snapshot).is_dir() and not any(Path(d['path']).is_relative_to(snapshot) for d in r['deletes']):raise ValueError('Unknown snapshot')
 a.out.mkdir(parents=True)
 if (a.archive/a.snapshot).is_dir():
  for f in (a.archive/a.snapshot).rglob('*'):
   if f.is_file():q=a.out/f.relative_to(a.archive/a.snapshot);q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,q)
 for d in r['deletes']:
  path=Path(d['path'])
  if not path.is_relative_to(snapshot) or 'retainedPath' not in d:continue
  q=a.out/path.relative_to(snapshot);q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(retained(d['retainedPath'],d['sha256']),q)
 for d in r['deletes']:
  path=Path(d['path'])
  if not path.is_relative_to(snapshot) or 'entries' not in d:continue
  q=a.out/path.relative_to(snapshot);q.parent.mkdir(parents=True,exist_ok=True)
  with zipfile.ZipFile(q,'w',zipfile.ZIP_DEFLATED) as z:
   for e in d['entries']:z.write(retained(e['retainedPath'],e['sha256']),e['name'])
 print('Restored original file/ZIP payloads to '+str(a.out))
if __name__=='__main__':main()
