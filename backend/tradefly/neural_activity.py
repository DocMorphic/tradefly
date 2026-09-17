"""Passive, per-calculation spike recording; never enters the saved network state."""
import hashlib,json
from pathlib import Path
import numpy as np
MAX_EVENTS=4000

def pack_activity(ids, indices, times_ms, duration_ms, total_spikes):
    """Keep real timestamps and IDs, sampling evenly only when the transport cap is hit."""
    size=len(indices)
    chosen=np.linspace(0,size-1,min(size,MAX_EVENTS),dtype=np.int64) if size else []
    selected=indices[chosen] if size else []
    unique=sorted({int(i) for i in selected})
    lookup={i:j for j,i in enumerate(unique)}
    return {'schema':1,'duration_ms':duration_ms,'total_spikes':int(total_spikes),
            'recorded_events':size,'displayed_events':len(chosen),'sampled':size>MAX_EVENTS,
            'neuron_ids':[str(ids[i]) for i in unique],
            'events':[[lookup[int(indices[i])],round(float(times_ms[i]),2)] for i in chosen],
            'recorder_hash':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}

def observe_stimulation(brain, stimulate, rates, duration_ms=500, readout_ms=250):
    b=brain.b
    observer=b.SpikeMonitor(brain.neurons,record=True,name='visual_spikes')
    start=float(brain.net.t/b.ms)
    brain.net.add(observer)
    try:
        summary=stimulate(rates,duration_ms,readout_ms)
        summary['activity']=pack_activity(brain.ids,np.asarray(observer.i[:]),np.asarray(observer.t[:]/b.ms)-start,duration_ms,summary['spikes'])
        return summary
    finally:
        # Remove the passive observer before existing checkpoint logic runs.
        brain.net.remove(observer)

def instrument(brain):
    original=brain.stimulate
    brain.stimulate=lambda rates,duration_ms=500,readout_ms=250: observe_stimulation(brain,original,rates,duration_ms,readout_ms)
    return brain

def bounded_activity_snapshot(snapshot):
    """Retain full traces locally; ship at most three with the latest desktop records."""
    decisions=snapshot.get('decisions',[])
    candidates=[]
    for d in decisions:
        activity=d.get('neural',{}).pop('activity',None)
        if activity is not None:candidates.append((d,activity))
    budget=min(200000,max(0,850000-len(json.dumps(snapshot))))
    for d,activity in reversed(candidates[-3:]):
        size=len(json.dumps(activity))+16
        if size>budget:continue
        d['neural']['activity']=activity;budget-=size
    return snapshot
