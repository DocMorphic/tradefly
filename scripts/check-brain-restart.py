"""Verify a fresh Python process restores all neuron counts and RNG exactly."""
import json,subprocess,sys
import numpy as np
from tradefly.brain import FlyBrain
from tradefly.config import ROOT
path=ROOT/'runs/restart-checkpoint.bin';expected=ROOT/'runs/restart-counts.npy'
b=FlyBrain();rates={k:50 for k in b.slices}
if '--child' in sys.argv:
    b.restore(path);b.stimulate(rates)
    assert np.array_equal(np.load(expected),b.monitor.count[:])
    print('Fresh-process neural restart: exact counts',flush=True)
else:
    b.stimulate(rates);b.checkpoint(path);b.stimulate(rates)
    np.save(expected,b.monitor.count[:])
    del b
    subprocess.run([sys.executable,__file__,'--child'],check=True)
    report_path=ROOT/'data/brain/checkpoint-validation.json'
    report=json.loads(report_path.read_text());report['fresh_process_exact']=True
    report_path.write_text(json.dumps(report,indent=2))
    path.unlink();expected.unlink()
