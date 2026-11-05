import ijson, sys, json
src, out = sys.argv[1], sys.argv[2]
keys = sys.argv[3:]
for k in keys:
    with open(src,'rb') as f:
        for v in ijson.items(f, k, use_float=True):
            json.dump(v, open(f"{out}/{k}.json","w"), separators=(",",":"))
            print(k, "ok", flush=True)
            break
