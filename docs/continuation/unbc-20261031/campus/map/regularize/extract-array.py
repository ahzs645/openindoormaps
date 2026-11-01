"""Stream one top-level object array out of a large Reviter viewer/indoor.json
without loading the whole document (keeps memory to a few MB per buffer).
usage: extract-array.py INDOOR_JSON BYTE_OFFSET KEY OUT_JSON FIELD[,FIELD...]
BYTE_OFFSET is where '"KEY":[' starts (find it with: grep -bo '"KEY":.' FILE)."""
import json, sys
src, off, key, out, fields = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4], sys.argv[5].split(',')
dec = json.JSONDecoder(); rows = []
with open(src, 'rb') as f:
    f.seek(off)
    head = f.read(len(key) + 4).decode()
    assert head == '"%s":[' % key, head
    s = ''
    while True:
        s = s.lstrip()
        if s.startswith(','):
            s = s[1:].lstrip()
        if s.startswith(']'):
            break
        try:
            obj, end = dec.raw_decode(s)
        except json.JSONDecodeError:
            b = f.read(1 << 22)
            if not b:
                raise
            s += b.decode('utf-8'); continue
        rows.append([obj.get(k) for k in fields]); s = s[end:]
json.dump({'fields': fields, 'rows': rows}, open(out, 'w'), separators=(',', ':'))
print(key, len(rows))
