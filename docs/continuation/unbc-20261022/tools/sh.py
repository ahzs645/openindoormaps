import subprocess, os
r = subprocess.run(['bash','-c',os.environ['CMD']], capture_output=True, text=True)
print(r.stdout[-6000:], r.stderr[-3000:], 'exit', r.returncode)
