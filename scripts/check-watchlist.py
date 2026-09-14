"""Feed a shared real brain actual historical bars from the configured universe. No orders."""
import json
from datetime import datetime,timedelta
from tradefly.config import Settings,ROOT
from tradefly.alpaca import Alpaca
from tradefly.brain import FlyBrain
from tradefly.domain import NY,UTC,completed_bars,instant,encode,decode,now_iso
s=Settings.load();symbols=json.loads((ROOT/'config/watchlist.json').read_text())['symbols'];a=Alpaca(s);brain=FlyBrain()
if not brain.ready:raise SystemExit('Brain validation required')
day=datetime(2026,9,11,tzinfo=NY);start=day-timedelta(days=7);end=day+timedelta(days=1)
calendar=a.calendar(start.date().isoformat(),day.date().isoformat())
account={'status':'ACTIVE','equity':'100000','cash':'100000'}
frames=[]
for index,symbol in enumerate(symbols):
    bars=completed_bars(a.bars(symbol,start.isoformat(),end.isoformat()),calendar,end)
    target=day.replace(hour=9,minute=30)+timedelta(minutes=5*index)
    found=next((i for i,b in enumerate(bars) if instant(b['t'])==target),None)
    if found is None or found<20:raise SystemExit(f'Missing completed warmup or selected bar: {symbol}')
    bar=bars[found];rates=encode(bar,bars[:found],account,{})
    neural=brain.stimulate(rates);action,reason=decode(neural['buy_hz'],neural['sell_hz'])
    frames.append({'symbol':symbol,'bar':bar,'stimulus_hz':rates,'neural':neural,'action':action,'reason':reason})
    print(f'{symbol}: {action}; BUY {neural["buy_hz"]} Hz / SELL {neural["sell_hz"]} Hz',flush=True)
report={'source':'real IEX / isolated shared-brain input check','date':day.date().isoformat(),'created_at':now_iso(),
        'watchlist':list(symbols),'frames':frames,'fills':[], 'orders_submitted':0,
        'account_input':'Fixed $100,000 cash observation; no positions; not the production ledger',
        'scope':'Verifies symbols, causal inputs and shared neural state. No financial performance claim or broker orders.',
        'manifest_hash':brain.manifest_hash}
(ROOT/'runs/watchlist-check.json').write_text(json.dumps(report,indent=2))
a.close()
