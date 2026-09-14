import json,time,resource
import numpy as np
from tradefly.brain import FlyBrain
from tradefly.config import ROOT
b=FlyBrain();rates={k:50 for k in b.slices}
b.stimulate(rates)
p=ROOT/'runs/checkpoint-validation.bin';p.parent.mkdir(exist_ok=True)
t=time.monotonic();b.checkpoint(p);write_seconds=time.monotonic()-t
first=b.stimulate(rates);counts=b.monitor.count[:].copy()
b.restore(p);second=b.stimulate(rates)
exact=bool(np.array_equal(counts,b.monitor.count[:]))
report={'passed':exact,'checkpoint_bytes':p.stat().st_size,'write_seconds':write_seconds,
        'peak_rss_gib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024**3,
        'manifest_hash':b.manifest_hash,'first_rates':[first['buy_hz'],first['sell_hz']],
        'restored_rates':[second['buy_hz'],second['sell_hz']]}
(ROOT/'data/brain/checkpoint-validation.json').write_text(json.dumps(report,indent=2))
p.unlink()
print(json.dumps(report,indent=2))
assert exact
