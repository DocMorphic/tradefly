"""Pin source and validate the complete v783 graph and published populations."""
from pathlib import Path
import ast, hashlib, json, subprocess
import pandas as pd
import numpy as np

root = Path(__file__).resolve().parents[1]
source = root / 'vendor/fly-reference'
commit = '91bdd1e7dcf193f3e7ca5a8933497fcef63b7960'
if not source.exists():
    subprocess.run(['git','clone','https://github.com/philshiu/Drosophila_brain_model.git',str(source)],check=True)
actual = subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()
if actual != commit: raise SystemExit('Reference commit mismatch; refusing unpinned data')
# Parse literal assignments only. Never execute notebook cells or deserialize pickles.
populations = {}
for cell in json.loads((source/'figures.ipynb').read_text())['cells']:
    if cell['cell_type'] != 'code': continue
    try: tree = ast.parse(''.join(cell['source']))
    except SyntaxError: continue
    for node in tree.body:
        if isinstance(node,ast.Assign) and len(node.targets)==1 and isinstance(node.targets[0],ast.Name):
            name = node.targets[0].id
            if name in ['neu_sugar','neu_bitter','neu_water','neu_ir94e','neu_JON_CE','neu_JON_F']:
                try: populations[name] = ast.literal_eval(node.value)
                except (ValueError,TypeError): pass
ids = pd.read_csv(source/'Completeness_783.csv',index_col=0).index.to_numpy(dtype=np.int64)
lookup = {int(i): n for n,i in enumerate(ids)}
inputs = dict(zip(['return_up','return_down','range','volume','position','cash'],
                 [populations[k] for k in ['neu_sugar','neu_bitter','neu_water','neu_ir94e','neu_JON_CE','neu_JON_F']]))
outputs = {'buy':[720575940660219265], 'sell':[720575940616185531,720575940629806974]}
all_input = [i for group in inputs.values() for i in group]
all_output = [i for group in outputs.values() for i in group]
missing = set(all_input+all_output)-set(lookup)
if set(all_output) & missing: raise SystemExit('Missing output IDs')
# Explicit version migration: retain all graph neurons/edges, exclude these three
# absent v630 IDs from stimulation only. No replacement identities are invented.
inputs = {k:[i for i in group if i not in missing] for k,group in inputs.items()}
all_input = [i for group in inputs.values() for i in group]
if len(all_input)!=len(set(all_input)) or set(all_input)&set(all_output): raise SystemExit('Overlapping pools')
con = pd.read_parquet(source/'Connectivity_783.parquet')
pre=con['Presynaptic_Index'].to_numpy(); post=con['Postsynaptic_Index'].to_numpy()
if not np.array_equal(ids[pre],con['Presynaptic_ID']) or not np.array_equal(ids[post],con['Postsynaptic_ID']):
    raise SystemExit('Index to original ID mapping mismatch')
# Reachability is structural only; functional responses are checked separately.
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import breadth_first_order
graph=csr_matrix((np.ones(len(pre),dtype=np.int8),(pre,post)),shape=(len(ids),len(ids)))
reachable=set()
for i in [all_input[0],populations['neu_JON_CE'][0]]:
    reachable.update(breadth_first_order(graph,lookup[i],directed=True,return_predecessors=False).tolist())
if not all(lookup[i] in reachable for i in all_output): raise SystemExit('Output not reachable')
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        while chunk:=f.read(1024*1024): h.update(chunk)
    return h.hexdigest()
manifest = {'id':'TF-FLY-783-001','upstream_commit':commit,'dataset':'FlyWire female v783',
 'neuron_count':len(ids),'neuron_pair_edges':len(con),'synapse_count':int(con['Connectivity'].sum()),
 'files':{n:sha(source/n) for n in ['model.py','Completeness_783.csv','Connectivity_783.parquet','figures.ipynb']},
 'excluded_input_ids':[str(i) for i in sorted(missing)],
 'inputs':{k:[str(i) for i in v] for k,v in inputs.items()},
 'outputs':{k:[str(i) for i in v] for k,v in outputs.items()},
 'mapping_note':'Human-assigned: BUY=MN9; SELL=DN1/DN2 readouts. Six published sensory groups map to six market channels. Not native financial semantics, not profit-trained.',
 'input_types':dict(zip(inputs,['right sugar GRNs','right bitter GRNs','right water GRNs','right IR94e GRNs','JON CE','JON F'])),
 'parameters':{'dt_ms':0.1,'window_ms':500,'readout_ms':250,'seed':783,'threshold_hz':20,'margin_hz':8},
 'license_note':'Upstream code MIT; local data use only. See docs/BRAIN.md for dataset attribution. No dataset redistribution.'}
out=root/'data/brain';out.mkdir(parents=True,exist_ok=True)
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(root/'config/brain-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({k:manifest[k] for k in ['dataset','neuron_count','neuron_pair_edges','synapse_count']}))
print('All original IDs verified; input/output populations disjoint; outputs structurally reachable.')
