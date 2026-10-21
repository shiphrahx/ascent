# exact-substring replacement helper that keeps LF endings
# usage in python: from sub import sub; sub(path, old, new)
import sys
def sub(p, a, b, count=1):
    with open(p, 'r', encoding='utf-8', newline='') as f: s = f.read()
    if a not in s: raise SystemExit('MISSING in ' + p + ': ' + a[:80])
    s = s.replace(a, b, count)
    with open(p, 'w', encoding='utf-8', newline='') as f: f.write(s)
