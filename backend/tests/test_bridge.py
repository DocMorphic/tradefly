import httpx
from datetime import datetime,timezone,timedelta
from tradefly.runner import Bridge

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
    b.config={'TRADEFLY_BRIDGE_TOKEN':'test-bridge','TRADEFLY_SITES_TOKEN':'test-site'}
    return b,e

def respond(b,command,id,age=0,status=200):
    b.client=httpx.Client(transport=httpx.MockTransport(lambda _:httpx.Response(status,json={
        'command':command,'command_id':id,'command_at':(datetime.now(timezone.utc)-timedelta(seconds=age)).isoformat()})))
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
