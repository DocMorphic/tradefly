"""No broker: compare passive recording against the same saved full-brain state."""
import hashlib,json,time
from datetime import datetime,timezone
import numpy as np
from tradefly.brain import FlyBrain
from tradefly.neural_activity import instrument
from tradefly.config import ROOT
b=FlyBrain();checkpoint=ROOT/'runs/brain.checkpoint'
b.restore(checkpoint)
rates={k:10.0 for k in b.slices};rates['return_up']=100.;rates['cash']=90.
baseline=b.stimulate(rates)
counts=b.monitor.count[:].copy();voltage=b.neurons.v[:].copy()
b.restore(checkpoint);instrument(b)
started=time.monotonic();observed=b.stimulate(rates);seconds=time.monotonic()-started
passed=bool(np.array_equal(counts,b.monitor.count[:]) and np.array_equal(voltage,b.neurons.v[:]))
assert passed,'Passive recorder changed network results'
assert observed['activity']['recorded_events']==observed['spikes']
assert all(o.name!='visual_spikes' for o in b.net.objects)
# Verify a recorded run still writes and restores through the original checkpoint format.
test_checkpoint=ROOT/'runs/activity-checkpoint-test.bin'
b.checkpoint(test_checkpoint);b.restore(test_checkpoint);test_checkpoint.unlink()
record={'id':'validation-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'),'created_at':datetime.now(timezone.utc).isoformat(),
        'scope':'Controlled validation replay, no market decision or order. Fixed input rates on a copy of the saved brain state.',
        'symbol':'Validation','action':'HOLD','reason':'Isolated recorder validation; not a trading decision',
        'stimulus_hz':rates,'neural':observed}
(ROOT/'public/brain/validation-replay.json').write_text(json.dumps(record,separators=(',',':')))
report={'passed':passed,'original_model_hash':b.manifest_hash,'baseline_seconds':baseline['wall_seconds'],'observed_seconds':seconds,
        'spikes':observed['spikes'],'recorded_events':observed['activity']['recorded_events'],'displayed_events':observed['activity']['displayed_events'],
        'checkpoint_compatible':True,'no_broker_used':True}
(ROOT/'data/brain/activity-validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
