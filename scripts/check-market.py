"""Read-only broad-universe smoke through the real engine with isolated state.

Broker writes are forbidden; neural state is shared. Production checkpoint
serialization is covered separately, so this disposable probe writes markers.
"""
import json,tempfile,time
from pathlib import Path
from datetime import datetime,timedelta
from unittest.mock import patch
from tradefly.config import Settings,ROOT
from tradefly.alpaca import Alpaca
from tradefly.brain import FlyBrain
from tradefly.market import MarketEngine
from tradefly.domain import UTC,now_iso
from dataclasses import replace
settings=Settings.load();live=Alpaca(settings);real_brain=FlyBrain()
if not real_brain.ready:raise SystemExit('Brain validation is required')
class Clock(datetime):
    @classmethod
    def now(cls,tz=None):return datetime(2026,9,11,19,55,15,tzinfo=UTC)
class ReadOnlyBroker:
    assets=live.assets
    bars_many=live.bars_many
    asset=live.asset
    calendar=live.calendar
    def account(self):return {'id':'isolated-market-probe','status':'ACTIVE','currency':'USD','cash':'100000','equity':'100000','portfolio_value':'100000'}
    def positions(self):return []
    def open_orders(self):return []
    def clock(self):return {'is_open':True}
    def submit(self,*_):raise AssertionError('Broker writes forbidden in this check')
    def cancel(self,*_):raise AssertionError('Broker writes forbidden in this check')
class ProbeBrain:
    ready=real_brain.ready;manifest_hash=real_brain.manifest_hash;manifest=real_brain.manifest
    @property
    def steps(self):return real_brain.steps
    def stimulate(self,rates):return real_brain.stimulate(rates)
    def checkpoint(self,path):Path(path).write_text(str(self.steps))
started=time.monotonic()
with tempfile.TemporaryDirectory() as directory,patch('tradefly.market.datetime',Clock):
    e=MarketEngine(replace(settings,database=Path(directory)/'probe.db'),broker=ReadOnlyBroker(),brain=ProbeBrain())
    e.resume();e.started=Clock.now()-timedelta(minutes=10)
    e.before_submit=lambda:False
    for i in range(64):
        e.tick(Clock.now())
        print(f'{i+1}/64 {e.symbol}: {e.ledger.coverage()[0]["status"]}',flush=True)
    snapshot=e.snapshot()
    report={'source':'Real IEX / isolated full-market engine smoke','date':'2026-09-11','created_at':now_iso(),
      'scope':'All-universe discovery; first 64 symbols in the unranked tour. Real shared brain. Fixed cash input, disposable checkpoint markers, no broker writes. Not a full-universe neural test or profitability estimate.',
      'universe_total':len(e.assets),'candidates_checked':64,'neural_evaluations':real_brain.steps,
      'coverage':snapshot['universe']['counts'],'frames':e.ledger.decisions(),'fills':[],'orders_submitted':0,
      'wall_seconds':time.monotonic()-started,'manifest_hash':real_brain.manifest_hash}
    (ROOT/'runs/market-check.json').write_text(json.dumps(report,indent=2));e.ledger.close()
live.close()
print(json.dumps({k:v for k,v in report.items() if k not in ('frames','manifest_hash')}),flush=True)
