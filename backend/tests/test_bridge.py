import httpx
from datetime import datetime,timezone,timedelta
from tradefly.runner import Bridge
from tradefly.config import bridge_target,bridge_headers,SITE_URL
import pytest

class Engine:
    paused=True
    last_command_id=None
    resumes=0
    pauses=0
    def snapshot(self):return {'schema':1,'mode':'alpaca-paper'}
    def resume(self):self.paused=False;self.resumes+=1;return True
    def pause(self,*_):self.paused=True;self.pauses+=1

def bridge():
    e=Engine();b=Bridge(e);b.client.close()
    b.config={'TRADEFLY_SITE_URL':'https://tradefly-test.vercel.app','TRADEFLY_BRIDGE_TOKEN':'test-bridge','TRADEFLY_SITES_TOKEN':'test-site'}
    return b,e

def respond(b,command,id,age=0,status=200):
    b.client=httpx.Client(transport=httpx.MockTransport(lambda _:httpx.Response(status,json={
        'received_at':datetime.now(timezone.utc).isoformat(),'command':command,'command_id':id,'command_at':(datetime.now(timezone.utc)-timedelta(seconds=age)).isoformat()})))
    return b.exchange()

def test_startup_does_not_replay_an_old_resume_and_new_commands_apply_once():
    b,e=bridge()
    assert respond(b,'resume','old') and e.paused and e.resumes==0
    assert respond(b,'resume','new') and not e.paused and e.resumes==1
    respond(b,'resume','new')
    assert e.resumes==1
    respond(b,'pause','pause')
    assert e.paused and e.pauses==1 and e.last_command_id=='pause'

def test_expired_resume_is_acknowledged_without_running():
    b,e=bridge();respond(b,'pause','initial')
    respond(b,'resume','expired',age=61)
    assert e.paused and e.resumes==0 and e.last_command_id=='expired'

def test_lost_control_connection_vetoes_submission():
    b,e=bridge();respond(b,'pause','initial');e.paused=False
    b.client=httpx.Client(transport=httpx.MockTransport(lambda _:httpx.Response(503)))
    assert not b.before_submit() and e.paused

def test_vercel_target_keeps_sites_bypass_off_other_hosts():
    config={'TRADEFLY_SITE_URL':'https://tradefly-test.vercel.app/','TRADEFLY_BRIDGE_TOKEN':'bridge','TRADEFLY_SITES_TOKEN':'private-sites-token'}
    assert bridge_target(config)=='https://tradefly-test.vercel.app'
    assert bridge_headers(config)=={'Authorization':'Bearer bridge'}
    assert bridge_target({})==SITE_URL
    assert bridge_headers({'TRADEFLY_BRIDGE_TOKEN':'bridge'}) is None
    for url in ('http://untrusted.example','https://user:password@example.com','https://example.com/path','https://example.com?x=1'):
        with pytest.raises(ValueError):bridge_target({'TRADEFLY_SITE_URL':url})

def test_delta_ack_resync_and_read_only_submission_control():
    import gzip,json
    b,e=bridge();seen=[]
    def handler(request):
        if request.method=='GET':
            assert not request.content
            return httpx.Response(200,json={'command':'pause','command_id':'stop','command_at':datetime.now(timezone.utc).isoformat()})
        assert request.headers['Content-Type']=='application/vnd.tradefly.telemetry+gzip'
        payload=json.loads(gzip.decompress(request.content));seen.append(payload)
        if len(seen)==2:
            assert payload['transport']=='delta-v1'
            return httpx.Response(409,json={'error':'Full snapshot required'})
        return httpx.Response(200,json={'received_at':datetime.now(timezone.utc).isoformat(),'command':'pause','command_id':'initial'})
    b.client=httpx.Client(transport=httpx.MockTransport(handler))
    assert b.exchange()
    assert b.exchange()
    assert len(seen)==3 and 'transport' not in seen[0] and 'transport' not in seen[2]
    e.paused=False
    assert not b.before_submit() and e.paused and e.last_command_id=='stop'
    assert len(seen)==3

def test_failed_upload_does_not_advance_delta_base():
    b,e=bridge();assert respond(b,'pause','initial')
    receipt=b.telemetry.receipt;previous=b.telemetry.previous
    assert not respond(b,'pause','initial',status=500)
    assert b.telemetry.receipt==receipt and b.telemetry.previous==previous


def test_legacy_sites_keeps_its_original_json_protocol():
    import json
    b,e=bridge();b.config.pop('TRADEFLY_SITE_URL')
    def handler(request):
        assert request.method=='POST' and request.headers['Content-Type']=='application/json'
        assert json.loads(request.content)['mode']=='alpaca-paper'
        return httpx.Response(200,json={'command':'pause','command_id':'legacy'})
    b.client=httpx.Client(transport=httpx.MockTransport(handler))
    assert b.exchange() and e.paused
