"""Run locally: uv run python -m tradefly.runner. Starts paused, never trades a backlog."""
import argparse
import fcntl
import json
import signal
import time
from pathlib import Path
import httpx
from dotenv import dotenv_values
from .alpaca import BrokerError
from .config import ROOT, Settings, bridge_target, bridge_headers
from .domain import now_iso, instant, UTC
from .market import MarketEngine
from .neural_activity import instrument, bounded_activity_snapshot
from datetime import datetime

class Bridge:
    def __init__(self, engine):
        self.engine=engine
        self.config=dotenv_values(ROOT/'.env.bridge') if (ROOT/'.env.bridge').exists() else {}
        self.client=httpx.Client(timeout=12,follow_redirects=False)
        self.seen=None
    def exchange(self):
        headers=bridge_headers(self.config)
        if not headers: return False
        response=self.client.post(bridge_target(self.config)+'/api/bridge',json=bounded_activity_snapshot(self.engine.snapshot()),headers=headers)
        if response.status_code!=200: return False
        command=response.json()
        # On startup acknowledge existing command, but never replay an old resume.
        if self.seen is None:
            self.seen=command['command_id'];self.engine.last_command_id=self.seen;return True
        if self.seen!=command['command_id']:
            self.seen=command['command_id']
            self.engine.last_command_id=self.seen
            at=command.get('command_at')
            if command['command']=='pause': self.engine.pause()
            elif at and (datetime.now(UTC)-instant(at)).total_seconds()<60:
                try:
                    if command['command']=='resume': self.engine.resume()
                    elif command['command']=='decoder': self.engine.set_decoder((command.get('command_payload') or {}).get('mode'))
                    elif command['command']=='watchlist': self.engine.set_watchlist((command.get('command_payload') or {}).get('symbols'))
                except (ValueError,BrokerError) as e:
                    self.engine.message='Command rejected: '+str(e)
                    self.engine.ledger.event('command_rejected',{'reason':str(e)})
        return True
    def before_submit(self):
        try: healthy=self.exchange()
        except (httpx.HTTPError,ValueError,KeyError): healthy=False
        if not healthy: self.engine.pause('Desktop control connection unavailable')
        return healthy and not self.engine.paused

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--once',action='store_true',help='Verify read-only broker state and exit; never submits')
    parser.add_argument('--load-brain',action='store_true',help='Load a locally validated full network')
    parser.add_argument('--flies',type=int,choices=(1,2),default=2,help='Independent brain processes; defaults to two on this local setup')
    parser.add_argument('--export',type=Path,help='Export complete locally recorded history and exit')
    args=parser.parse_args()
    settings=Settings.load()
    settings.database.parent.mkdir(parents=True,exist_ok=True)
    lock=(settings.database.parent/'worker.lock').open('w')
    try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError: raise SystemExit('A Tradefly worker is already running')
    from .parallel_market import ParallelMarketEngine
    engine=(ParallelMarketEngine if args.flies==2 else MarketEngine)(settings)
    if args.export:
        snapshot=engine.snapshot();snapshot['decisions']=engine.ledger.decisions();snapshot['orders']=engine.ledger.orders();snapshot['events']=engine.ledger.events(1000000)
        args.export.write_text(json.dumps(snapshot,indent=2));print('Export saved');return
    if args.load_brain:
        from .brain import FlyBrain
        report=settings.brain_dir/'validation.json'
        if report.exists() and json.loads(report.read_text()).get('passed'):
            checkpoint=settings.database.parent/'brain.checkpoint'
            if args.flies==2:
                if engine.fatal:raise SystemExit('Interrupted checkpoint requires recovery before loading flies')
                from .fly_pool import FlyPool
                engine.brain=FlyPool(settings.database.parent/'flies',checkpoint,args.flies)
            else:
                engine.brain=FlyBrain()
                if checkpoint.exists() and not engine.fatal:
                    engine.brain.restore(checkpoint)
                    engine.brain.steps=engine.ledger.get('brain_steps') or 0
                instrument(engine.brain)
            print(f'{args.flies} full fly brain(s) loaded. Paper execution remains paused.',flush=True)
        else: print('Brain validation has not passed; monitoring only.',flush=True)
    bridge=Bridge(engine)
    from .chart_history import start_background
    chart_stop=start_background() if not args.once else None
    from .learning_lab import start_background as start_learning
    learning_stop=start_learning() if not args.once else None
    if not args.once:
        from .jev import Scout
        try: engine.scout=Scout(settings)
        except Exception:
            engine.ledger.event('news_scout_unavailable', {'reason':'Optional scout could not initialize; regular tour retained'})
    engine.before_submit=bridge.before_submit
    running=True
    def stop(*_):
        nonlocal running
        running=False
    signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
    next_bridge=0.
    while running:
        try:
            if settings.credentials_present: engine.tick()
            else: engine.message='Add Alpaca paper credentials locally'
        except (BrokerError,ValueError,KeyError) as error:
            engine.connected=False
            # BrokerError is sanitized. Do not log arbitrary exceptions containing request data.
            reason=str(error) if isinstance(error,BrokerError) else 'Invalid backend state; check local validation'
            engine.pause(reason)
        except Exception:
            engine.connected=False;engine.pause('Backend error; execution paused')
        if engine.scout:
            engine.scout.pulse(engine.assets, active=not engine.paused and bool(engine.market.get('is_open')))
        snapshot=bounded_activity_snapshot(engine.snapshot())
        temporary=settings.database.parent/'status.tmp'
        temporary.write_text(json.dumps(snapshot))
        temporary.replace(settings.database.parent/'status.json')
        if time.monotonic() >= next_bridge:
            try:
                if not bridge.exchange() and not engine.paused: engine.pause('Desktop control connection unavailable')
            except (httpx.HTTPError,ValueError,KeyError):
                if not engine.paused: engine.pause('Desktop control connection unavailable')
            next_bridge=time.monotonic()+10
        if args.once:
            print(json.dumps({'paper_connected':engine.connected,'paused':engine.paused,'credentials_configured':settings.credentials_present,
                'message':engine.message,'brain_loaded':engine.brain is not None}))
            break
        for _ in range(settings.poll_seconds if engine.paused or not engine.market.get('is_open') else 1):
            if not running:break
            time.sleep(1)
    if not args.once: engine.pause('Worker stopped')
    if args.flies==2 and engine.brain:
        engine.brain.close()
        engine.collect()
    if engine.scout: engine.scout.close()
    if chart_stop: chart_stop.set()
    if learning_stop: learning_stop.set()
    bridge.client.close();engine.broker.close();engine.ledger.close()

if __name__=='__main__': main()
