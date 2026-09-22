import gzip,json
from tradefly.telemetry import Telemetry,difference


def apply(previous, patch):
    value=previous.copy()
    for key in patch['remove']: value.pop(key,None)
    value.update(patch['set'])
    for key,child in patch['children'].items():value[key]=apply(value[key],child)
    return value


def test_round_trip_preserves_records_nested_changes_empty_lists_and_nulls():
    old={'a':None,'b':2,'nested':{'keep':[1,2],'change':1},'gone':True}
    new={'a':{'x':None},'b':None,'nested':{'keep':[],'change':2},'new':None}
    assert apply(old,difference(old,new))==new
    assert old['nested']['change']==1


def test_unchanged_large_history_is_not_uploaded_again_and_restart_is_full():
    s={'updated_at':'old','decisions':[{'id':str(i),'neural':{'events':[[n,n*.1] for n in range(100)]}} for i in range(100)]}
    t=Telemetry();f,first,size=t.encode(s)
    assert json.loads(gzip.decompress(first))==s
    t.accepted(f,'receipt',len(first),size)
    s['updated_at']='new'
    _,second,_=t.encode(s)
    patch=json.loads(gzip.decompress(second))
    assert patch['base_received_at']=='receipt'
    assert apply(f,patch['patch'])==s and len(second)<200
    assert t.previous['updated_at']=='old'
    t.reset()
    assert 'transport' not in json.loads(gzip.decompress(t.encode(s)[1]))
