"""Full-graph stimulus/ablation benchmark. Does not submit orders or use market data."""
import json, resource, time
from tradefly.brain import FlyBrain
from tradefly.config import ROOT

started=time.monotonic()
brain=FlyBrain()
print('Loaded full graph',flush=True)
zero={k:0 for k in brain.slices}
silent=brain.stimulate(zero,500,250)
print('Silence complete',flush=True)
sugar=brain.stimulate({**zero,'return_up':100},1000,500)
print('Sugar stimulus complete',flush=True)
jon=brain.stimulate({**zero,'position':200,'cash':200},1000,500)
print('JON stimulus complete',flush=True)
# Disable all internal edges, then let currents settle before identical inputs.
brain.synapses.w=0*brain.b.mV
brain.stimulate(zero,500,250)
ablated=brain.stimulate({k:100 for k in zero},1000,500)
rss=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024**3
# This is a v783 engineering response check, not a statistical replication of the v630 publication.
passed=(silent['spikes']==0 and sugar['buy_hz']>0 and jon['sell_hz']>0 and
        ablated['buy_hz']==0 and ablated['sell_hz']==0 and rss<4 and
        max(sugar['wall_seconds'],jon['wall_seconds'])<240)
report={'manifest_hash':brain.manifest_hash,'passed':passed,
 'validation_kind':'v783 full-graph stimulus/edge-ablation engineering check',
 'not_a_published_replication':True,'silence':silent,'sugar':sugar,'jon':jon,'ablated':ablated,
 'peak_rss_gib':rss,'total_seconds':time.monotonic()-started}
p=ROOT/'data/brain/validation.json';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2),flush=True)
