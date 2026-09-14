"""Intraday pilot replay; next-bar fills, explicit costs, separate from Alpaca orders."""
from decimal import Decimal
from .domain import decode,encode,number,size_order

def replay(bars,previous,brain,initial='10000'):
    cash=number(initial);qty=Decimal(0);cost=Decimal(0);pending=None;frames=[];fills=[]
    asset={'status':'active','tradable':True,'fractionable':True}
    for index,bar in enumerate(bars):
        # Intent from previous bar fills only at this bar's open, never its known close.
        if pending:
            side,payload=pending
            price=number(bar['o'])*(Decimal('1.0002') if side=='BUY' else Decimal('.9998'))
            shares=(number(payload['notional'])/price if side=='BUY' else min(qty,number(payload['qty'])))
            value=shares*price;fee=value*Decimal('.0001');realized=Decimal(0)
            if side=='BUY' and value+fee<=cash:
                cash-=value+fee;qty+=shares;cost+=value+fee
            elif side=='SELL' and shares>0:
                removed=cost*shares/qty;cash+=value-fee;qty-=shares;cost-=removed;realized=value-fee-removed
            else: shares=Decimal(0)
            if shares:
                fills.append({'bar':bar['t'],'side':side,'shares':float(shares),'price':float(price),'fee':float(fee),'realized_pnl':float(realized)})
        equity=cash+qty*number(bar['c'])
        account={'status':'ACTIVE','cash':str(cash),'equity':str(equity)}
        position={'qty':str(qty),'market_value':str(qty*number(bar['c']))}
        rates=encode(bar,previous+bars[:index],account,position)
        neural=brain.stimulate(rates)
        action,reason=decode(neural['buy_hz'],neural['sell_hz'])
        payload,execution_reason=size_order(action,account,position,asset,bar['c'])
        pending=(action,payload) if payload else None
        frames.append({'bar':bar,'action':action,'reason':reason,'stimulus_hz':rates,'neural':neural,
                       'cash':float(cash),'shares':float(qty),'equity':float(equity),'execution_reason':execution_reason})
    equity=frames[-1]['equity'] if frames else float(initial)
    return {'source':'alpaca-iex-historical / measured-fly-v783','simulation':'local-next-bar-paper',
            'initial_cash':float(initial),'ending_equity':equity,'net_pnl':equity-float(initial),
            'fees':sum(f['fee'] for f in fills),'slippage_bps':2,'fee_bps':1,
            'pending_final_intent':pending[0] if pending else None,'frames':frames,'fills':fills,
            'scope':'Intraday integration pilot, not a held-out profitability evaluation. No broker orders.'}
