import argparse,json
from datetime import datetime,timedelta
from tradefly.alpaca import Alpaca
from tradefly.brain import FlyBrain
from tradefly.config import ROOT,Settings
from tradefly.domain import UTC,NY,completed_bars,now_iso
from tradefly.replay import replay
p=argparse.ArgumentParser();p.add_argument('--date',required=True);p.add_argument('--bars',type=int,default=6);args=p.parse_args()
if not 1<=args.bars<=78:raise SystemExit('Choose between 1 and 78 bars')
day=datetime.fromisoformat(args.date).replace(tzinfo=NY)
if day+timedelta(days=1)>datetime.now(UTC):raise SystemExit('Replay requires a completed historical date')
s=Settings.load();a=Alpaca(s)
start=day-timedelta(days=7);end=day+timedelta(days=1)
calendar=a.calendar(start.date().isoformat(),day.date().isoformat())
bars=completed_bars(a.bars(s.symbol,start.isoformat(),end.isoformat()),calendar,end)
selected=[b for b in bars if datetime.fromisoformat(b['t'].replace('Z','+00:00')).astimezone(NY).date()==day.date()][:args.bars]
prior=[b for b in bars if datetime.fromisoformat(b['t'].replace('Z','+00:00'))<day]
if len(prior)<20 or not selected:raise SystemExit('Not enough actual IEX data for replay')
brain=FlyBrain()
if not brain.ready:raise SystemExit('Brain response and checkpoint validation must pass first')
report=replay(selected,prior,brain)
report.update({'symbol':s.symbol,'date':args.date,'created_at':now_iso(),'manifest_hash':brain.manifest_hash})
out=ROOT/'runs/replays';out.mkdir(parents=True,exist_ok=True)
(out/f'{args.date}-pilot.json').write_text(json.dumps(report,indent=2))
(out/'latest.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:report[k] for k in ['source','ending_equity','net_pnl','fees','pending_final_intent','scope']}))
a.close()
