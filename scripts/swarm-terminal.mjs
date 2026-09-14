// Synthetic research feed; never imports the Alpaca worker or any signer.
import { FlySwarmEngine } from '../lib/swarm/engine.mjs';
const engine=new FlySwarmEngine();
console.log('TRADEFLY / SWARM RESEARCH — SYNTHETIC SCENARIO; NO BROKER ORDERS');
for(let i=0;i<18;i++){
 const s=engine.tick(),t=s.transfers[0],signal=s.signals[0];
 console.log(`${t.at} ${t.alias} → ${t.fresh} → ${t.token} · generated $${t.amount}`);
 if(signal?.id===`sig-${s.meta.tick}`)console.log(`  ${signal.status} ${signal.score}/100 · ${signal.evidence.join(' / ')}`);
}
