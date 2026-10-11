import re,sys
t=open('docs/integration-plan.md').read()
secs=re.split(r'\n(?=### \d+\. `)',t)
ph={}
for s in secs:
    m=re.match(r'### \d+\. `([^`]+)`',s)
    if not m: continue
    n=m.group(1)
    b=re.search(r'\*\*Blocked by:\*\*\s*([^\n]*)',s)
    mode=re.search(r'\*\*Mode:\*\*\s*(\w+)',s); tags=re.search(r'\*\*Tags:\*\*\s*([^·\n]*)',s)
    deps=re.findall(r'`([^`]+)`',b.group(1)) if b else []
    ph[n]=dict(deps=deps,mode=mode.group(1) if mode else '?',tags=(tags.group(1).strip() if tags else '?'))
names=set(ph)
bad=[(n,d) for n in ph for d in ph[n]['deps'] if d not in names]
print('phases',len(ph),'unknown edges',bad)
# cycle + ancestors
def anc(n,seen=None):
    seen=seen or set()
    for d in ph[n]['deps']:
        if d not in seen: seen.add(d); anc(d,seen)
    return seen
state={}
def cyc(n):
    state[n]=1
    for d in ph[n]['deps']:
        if state.get(d)==1: return True
        if not state.get(d) and cyc(d): return True
    state[n]=2; return False
print('cycle',any(cyc(n) for n in ph if not state.get(n)))
a=anc('release-bump'); print('release ancestors missing:',[x for x in ph if x not in a and x not in('release-bump','purge-git-history')])
sinks=[n for n in ph if not any(n in ph[m]['deps'] for m in ph)]; print('sinks',sinks)
lvl={}
def L(n):
    if n not in lvl: lvl[n]=1+max([L(d) for d in ph[n]['deps']],default=0)
    return lvl[n]
for n in ph: print(f"{L(n):>2} {n:34} {ph[n]['mode']:5} {ph[n]['tags']:30} <- {', '.join(ph[n]['deps']) or '—'}")
