"""Derive ID-matched display points from unmodified FlyWire v783 CSV exports."""
import argparse,csv,gzip,hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('coordinates',type=Path)
parser.add_argument('classification',type=Path)
args=parser.parse_args()
with (ROOT/'vendor/fly-reference/Completeness_783.csv').open() as f:
    model={r[0] for r in list(csv.reader(f))[1:]}
with gzip.open(args.classification,'rt') as f:
    classes={r['root_id']:r['super_class'] or 'unknown' for r in csv.DictReader(f)}
positions={}
with gzip.open(args.coordinates,'rt') as f:
    for r in csv.DictReader(f):
        rid=r['root_id']
        if rid not in model or rid in positions:continue
        xyz=[float(v) for v in r['position'].strip('[]').split()]
        if len(xyz)==3:positions[rid]=xyz
low=[min(p[i] for p in positions.values()) for i in range(3)]
high=[max(p[i] for p in positions.values()) for i in range(3)]
center=[(a+b)/2 for a,b in zip(low,high)]
scale=18/max(b-a for a,b in zip(low,high))
names=sorted(set(classes.get(r,'unknown') for r in positions))
rows=[[rid,*[round((v-center[i])*scale,5) for i,v in enumerate(p)],names.index(classes.get(rid,'unknown'))] for rid,p in sorted(positions.items())]
result={'schema':1,'dataset':'FlyWire FAFB v783','model_neurons':len(model),'mapped_neurons':len(rows),'unmapped_neurons':len(model)-len(rows),
    'coordinate_kind':'First published annotation coordinate per neuron; not a soma or skeleton reconstruction',
    'source_units':'nm','center_nm':center,'scale':scale,'classes':names,'points':rows,
    'sources':[{'url':'https://storage.googleapis.com/flywire-data/codex/data/fafb/783/'+name+'.csv.gz','sha256':hashlib.sha256(path.read_bytes()).hexdigest()} for name,path in [('coordinates',args.coordinates),('classification',args.classification)]],
    'attribution':'FlyWire Consortium; Dorkenwald et al., Nature (2024); Schlegel et al., Nature (2024). CC BY-NC 4.0.'}
out=ROOT/'public/brain';out.mkdir(exist_ok=True)
(out/'flywire-v783.json').write_text(json.dumps(result,separators=(',',':')))
print(json.dumps({k:result[k] for k in ['model_neurons','mapped_neurons','unmapped_neurons']}))
