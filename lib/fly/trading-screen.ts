import type { BackendSnapshot } from '../backend';
import type { FlyActivity } from './activity';

const money = (value: number) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });

export function paintTradingScreen(
  c: CanvasRenderingContext2D,
  a: FlyActivity,
  s: BackendSnapshot | null,
) {
  const samples = (s?.equity_history ?? [])
    .map((p) => ({ at: Date.parse(p.at), equity: Number(p.equity) }))
    .filter((p) => Number.isFinite(p.at) && Number.isFinite(p.equity))
    .sort((p, q) => p.at - q.at);
  const equity = s?.account?.equity == null ? null : Number(s.account.equity);
  const change = s?.equity_change_usd;
  c.fillStyle = '#101626';
  c.fillRect(0, 0, 1200, 660);
  c.fillStyle = '#a3accb';
  c.font = '23px monospace';
  c.fillText('TRADEFLY  /  PAPER ACCOUNT', 35, 46);
  c.textAlign = 'right';
  c.fillStyle = a.mood === 'OFFLINE' ? '#f27886' : '#c4bedf';
  c.fillText(a.mood === 'OFFLINE' ? 'STALE / OFFLINE' : a.mood, 1165, 46);
  c.textAlign = 'left';
  c.fillStyle = '#eff3ff';
  c.font = 'bold 49px monospace';
  c.fillText(
    equity !== null && Number.isFinite(equity)
      ? money(equity)
      : 'Awaiting account',
    35,
    116,
  );
  c.font = '22px monospace';
  c.fillStyle =
    typeof change === 'number' && change < 0 ? '#f27886' : '#66d9aa';
  c.fillText(
    typeof change === 'number' && Number.isFinite(change)
      ? `${change >= 0 ? '+' : ''}${money(change)} since experiment start`
      : 'Waiting for measured performance',
    35,
    154,
  );
  const left = 138,
    right = 824,
    top = 210,
    bottom = 495;
  if (samples.length > 1) {
    const values = samples.map((p) => p.equity);
    const low = Math.min(...values),
      high = Math.max(...values);
    const pad = Math.max((high - low) * 0.12, 0.5);
    const min = low - pad,
      max = high + pad;
    const t0 = samples[0].at,
      t1 = samples.at(-1)!.at;
    const x = (time: number) =>
      left + ((time - t0) / Math.max(t1 - t0, 1)) * (right - left);
    const y = (v: number) =>
      bottom - ((v - min) / (max - min)) * (bottom - top);
    for (let i = 0; i < 5; i++) {
      const v = min + ((max - min) * i) / 4,
        py = y(v);
      c.strokeStyle = '#28334c';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(left, py);
      c.lineTo(right, py);
      c.stroke();
      c.fillStyle = '#9da7c1';
      c.font = '17px monospace';
      c.textAlign = 'right';
      c.fillText(
        v.toLocaleString('en-US', { maximumFractionDigits: 2 }),
        left - 12,
        py + 6,
      );
    }
    c.textAlign = 'left';
    c.lineWidth = 4;
    c.lineJoin = 'round';
    for (let i = 1; i < samples.length; i++) {
      const previous = samples[i - 1],
        current = samples[i];
      c.strokeStyle = current.equity >= previous.equity ? '#66d9aa' : '#f27886';
      c.beginPath();
      c.moveTo(x(previous.at), y(previous.equity));
      c.lineTo(x(current.at), y(current.equity));
      c.stroke();
    }
    c.fillStyle = '#a3accb';
    c.font = '18px monospace';
    const clock = (at: number) =>
      new Date(at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    c.fillText(clock(t0), left, 530);
    c.textAlign = 'right';
    c.fillText(clock(t1), right, 530);
    c.textAlign = 'left';
    c.fillText('ACCOUNT EQUITY / USD', left, 567);
  } else {
    c.fillStyle = '#9da7c1';
    c.font = '25px monospace';
    c.fillText('Waiting for equity history', 80, 345);
  }
  c.fillStyle = '#28334c';
  c.fillRect(865, 90, 1, 480);
  c.fillStyle = '#9da7c1';
  c.font = '21px monospace';
  c.fillText('WATCHING', 900, 126);
  c.fillStyle = '#eff3ff';
  c.font = 'bold 35px monospace';
  c.fillText(a.symbol.slice(0, 10), 900, 173);
  c.fillStyle = '#9da7c1';
  c.font = '21px monospace';
  c.fillText('DECISIONS', 900, 240);
  c.fillStyle = '#eff3ff';
  c.font = 'bold 32px monospace';
  c.fillText(s ? s.decision_count.toLocaleString() : '—', 900, 280);
  c.fillStyle = '#9da7c1';
  c.font = '21px monospace';
  c.fillText('BUY / SELL Hz', 900, 355);
  c.font = 'bold 28px monospace';
  c.fillStyle = '#66d9aa';
  c.fillText(a.buyHz?.toFixed(1) ?? '—', 900, 397);
  c.fillStyle = '#f27886';
  c.fillText(a.sellHz?.toFixed(1) ?? '—', 1030, 397);
  c.fillStyle = '#9da7c1';
  c.font = '19px monospace';
  c.fillText('LAST NEURAL OUTPUT', 900, 435);
  c.fillStyle = '#28334c';
  c.fillRect(32, 588, 1136, 1);
  c.fillStyle = '#a3accb';
  c.font = '19px monospace';
  const at = s?.updated_at ? new Date(s.updated_at).toLocaleTimeString() : '—';
  c.fillText(`AS OF ${at} · ${samples.length} REAL EQUITY SAMPLES`, 35, 628);
  if (s?.position_checks?.some((p) => p.quarantined)) {
    c.textAlign = 'right';
    c.fillStyle = '#f1be83';
    c.fillText('POSITION DISCREPANCY', 1165, 628);
    c.textAlign = 'left';
  }
}
