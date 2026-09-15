"""Compare isolated one/two-fly throughput. No broker, no production checkpoints."""
import json,time,tempfile
from pathlib import Path
from tradefly.fly_pool import FlyPool
from tradefly.config import ROOT

def main():
    results={}
    with tempfile.TemporaryDirectory(prefix='tradefly-pool-') as tmp:
        pool=FlyPool(Path(tmp),ROOT/'runs/brain.checkpoint',2)
        try:
            rates={k:10. for k in pool.manifest['inputs']};rates['return_up']=100.;rates['cash']=90.
            for fly in pool.executors:pool.submit(fly,rates).result() # compile/warm each process
            start=time.monotonic()
            serial=[pool.submit('fly-1',rates).result() for _ in range(4)]
            results['one_fly_seconds']=time.monotonic()-start
            start=time.monotonic();parallel=[]
            for _ in range(2):
                jobs=[pool.submit(fly,rates) for fly in pool.executors]
                parallel.extend(f.result() for f in jobs)
            results['two_flies_seconds']=time.monotonic()-start
            results['calculations_per_trial']=4
            results['speedup']=results['one_fly_seconds']/results['two_flies_seconds']
            results['no_broker_used']=True
            results['model_hash']=pool.manifest_hash
            assert all(n['activity']['recorded_events']==n['spikes'] for n in serial+parallel)
            (ROOT/'runs/pool-benchmark.json').write_text(json.dumps(results,indent=2));print(json.dumps(results),flush=True)
        finally:pool.close()
if __name__=='__main__':main()
