import numpy as np
from tradefly.neural_activity import pack_activity,bounded_activity_snapshot,MAX_EVENTS

def test_activity_preserves_ids_times_silence_and_sampling_coverage():
    ids=['neuron-b','neuron-a']
    a=pack_activity(ids,np.array([1,0,1]),np.array([0.1,20.2,40.3]),500,3)
    assert a['neuron_ids']==ids
    assert a['events']==[[1,0.1],[0,20.2],[1,40.3]]
    assert not a['sampled']
    empty=pack_activity(ids,np.array([],dtype=int),np.array([]),500,0)
    assert empty['events']==[] and empty['neuron_ids']==[]
    many=pack_activity(ids,np.zeros(MAX_EVENTS+10,dtype=int),np.linspace(0,499,MAX_EVENTS+10),500,MAX_EVENTS+10)
    assert many['sampled'] and len(many['events'])==MAX_EVENTS
    assert many['events'][0][1]==0 and many['events'][-1][1]==499

def test_desktop_trace_window_does_not_remove_aggregate_history():
    s={'decisions':[{'neural':{'spikes':4,'activity':{'events':[]}}} for _ in range(100)]}
    bounded_activity_snapshot(s)
    assert sum('activity' in d['neural'] for d in s['decisions'])==3
    assert all(d['neural']['spikes']==4 for d in s['decisions'])

def test_desktop_trace_budget_keeps_newest_and_respects_payload_headroom():
    import json
    s={'decisions':[{'neural':{'spikes':4,'activity':{'record':i,'data':'x'*80000}}} for i in range(5)]}
    bounded_activity_snapshot(s)
    assert [d['neural']['activity']['record'] for d in s['decisions'] if 'activity' in d['neural']]==[3,4]
    s['other']='x'*700000
    bounded_activity_snapshot(s)
    assert [d['neural']['activity']['record'] for d in s['decisions'] if 'activity' in d['neural']]==[4]
    assert len(json.dumps(s,separators=(',',':')))<850000
