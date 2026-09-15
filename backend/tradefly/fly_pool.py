"""Independent process-local brains; the coordinator alone owns broker and ledger."""
from concurrent.futures import ProcessPoolExecutor
import multiprocessing as mp
import json, os, shutil, time
from pathlib import Path

_brain=None
_path=None
_fly=None

def _initialize(path, fly_id):
    global _brain, _path, _fly
    import signal
    from .brain import FlyBrain
    from .neural_activity import instrument
    _path=Path(path);_fly=fly_id
    _brain=FlyBrain();_brain.restore(_path);instrument(_brain)
    # Brian installs its own handler during import. Set this afterwards so the
    # parent can drain/checkpoint work before shutting down the child processes.
    signal.signal(signal.SIGINT,signal.SIG_IGN)

def _status():
    return {'ready':_brain.ready,'manifest':_brain.manifest,'manifest_hash':_brain.manifest_hash,'steps':_brain.steps}

def _calculate(rates):
    started=time.monotonic()
    n=_brain.stimulate(rates)
    tmp=_path.with_suffix('.tmp');_brain.checkpoint(tmp);os.replace(tmp,_path)
    n['fly_id']=_fly;n['state_id']=_fly+':'+n['state_id']
    n['calculation_and_checkpoint_seconds']=round(time.monotonic()-started,4)
    return n

class FlyPool:
    def __init__(self, directory, source, count=2):
        if count not in (1,2):raise ValueError('This local pool supports one or two flies')
        directory=Path(directory);directory.mkdir(parents=True,exist_ok=True)
        source=Path(source)
        self.executors={};self.count=count
        try:
            for i in range(count):
                fly=f'fly-{i+1}';path=directory/(fly+'.checkpoint')
                if not path.exists():
                    tmp=path.with_suffix('.tmp');shutil.copyfile(source,tmp);os.replace(tmp,path)
                executor=ProcessPoolExecutor(max_workers=1,mp_context=mp.get_context('spawn'),initializer=_initialize,initargs=(str(path),fly))
                self.executors[fly]=executor
                # Sequential initialization avoids simultaneous compilation and allocation spikes.
                info=executor.submit(_status).result(timeout=180)
                if not info['ready']:raise ValueError('Brain validation has not passed')
                self.manifest=info['manifest'];self.manifest_hash=info['manifest_hash']
            self.ready=True
        except BaseException:
            self.close();raise
    def submit(self,fly,rates):return self.executors[fly].submit(_calculate,rates)
    def close(self):
        for e in self.executors.values():e.shutdown(wait=True,cancel_futures=True)
