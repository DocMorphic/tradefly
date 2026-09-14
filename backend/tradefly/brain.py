"""Persistent Brian2 adaptation of Shiu & Spiller's MIT-licensed reference.

Neuron equations, delays, weights and Bernoulli input semantics follow the pinned
reference. Neurons are permuted so each stimulus population forms a contiguous
subgroup; the complete graph and original IDs are retained. See docs/BRAIN.md.
"""
from pathlib import Path
import hashlib
import json
import time
import pickle
import numpy as np
import pandas as pd
from .config import ROOT

class FlyBrain:
    def __init__(self, manifest_path=None):
        import brian2 as b
        self.b=b
        self.manifest_path=manifest_path or ROOT/'config/brain-manifest.json'
        self.manifest=json.loads(self.manifest_path.read_text())
        self.manifest_hash=hashlib.sha256(self.manifest_path.read_bytes()+Path(__file__).read_bytes()+(Path(__file__).parent/'domain.py').read_bytes()).hexdigest()
        source=ROOT/'vendor/fly-reference'
        for filename, expected in self.manifest['files'].items():
            h=hashlib.sha256()
            with (source/filename).open('rb') as f:
                while chunk:=f.read(1024*1024): h.update(chunk)
            if h.hexdigest()!=expected: raise ValueError('Brain source checksum mismatch')
        b.start_scope(); b.seed(self.manifest['parameters']['seed'])
        b.defaultclock.dt=.1*b.ms
        b.prefs.codegen.target='cython'
        original=pd.read_csv(source/'Completeness_783.csv',index_col=0).index.to_numpy(dtype=np.int64)
        head=[int(i) for ids in self.manifest['inputs'].values() for i in ids]
        headset=set(head)
        reordered=np.array(head+[int(i) for i in original if int(i) not in headset],dtype=np.int64)
        self.ids=reordered
        lookup={int(i):j for j,i in enumerate(reordered)}
        permutation=np.array([lookup[int(i)] for i in original],dtype=np.int32)
        self.output_indices={k:np.array([lookup[int(i)] for i in ids]) for k,ids in self.manifest['outputs'].items()}
        self.neurons=b.NeuronGroup(len(original), '''dv/dt = (v_0-v+g)/t_mbr : volt (unless refractory)
            dg/dt = -g/tau : volt (unless refractory)
            rfc : second''',method='linear',threshold='v>v_th',reset='v=v_rst; g=0*mV',
            refractory='rfc',name='fly_neurons',namespace={'v_0':-52*b.mV,'v_rst':-52*b.mV,
                'v_th':-45*b.mV,'t_mbr':20*b.ms,'tau':5*b.ms})
        self.neurons.v=-52*b.mV; self.neurons.g=0*b.mV; self.neurons.rfc=2.2*b.ms
        con=pd.read_parquet(source/'Connectivity_783.parquet',columns=['Presynaptic_Index','Postsynaptic_Index','Excitatory x Connectivity'])
        self.synapses=b.Synapses(self.neurons,self.neurons,'w:volt',on_pre='g+=w',delay=1.8*b.ms,name='fly_synapses')
        self.synapses.connect(i=permutation[con['Presynaptic_Index'].to_numpy()],j=permutation[con['Postsynaptic_Index'].to_numpy()])
        self.synapses.w=con['Excitatory x Connectivity'].to_numpy()* .275*b.mV
        del con, permutation, lookup
        self.monitor=b.SpikeMonitor(self.neurons,record=False,name='fly_counts')
        self.net=b.Network(self.neurons,self.synapses,self.monitor)
        self.slices={}; cursor=0
        for name, ids in self.manifest['inputs'].items():
            self.slices[name]=(cursor,cursor+len(ids));cursor+=len(ids)
        self.neurons.rfc[:cursor]=0*b.ms
        self.rng=np.random.default_rng(self.manifest['parameters']['seed'])
        self.input_neurons=b.SpikeGeneratorGroup(cursor,np.array([],dtype=int),np.array([])*b.ms,name='fly_stimulus')
        self.input_synapses=b.Synapses(self.input_neurons,self.neurons,on_pre='v_post += 0.06875*volt',name='fly_stimulus_edges')
        self.input_synapses.connect(i=np.arange(cursor),j=np.arange(cursor))
        self.input_synapses.pre.order=6
        self.net.add(self.input_neurons,self.input_synapses)
        self.steps=0
        self.ready=False
        self.report_path=ROOT/'data/brain/validation.json'
        if self.report_path.exists():
            r=json.loads(self.report_path.read_text())
            checkpoint_report=ROOT/'data/brain/checkpoint-validation.json'
            c=json.loads(checkpoint_report.read_text()) if checkpoint_report.exists() else {}
            self.ready=all(v.get('passed') is True and v.get('manifest_hash')==self.manifest_hash for v in (r,c))

    def stimulate(self, rates, duration_ms=500, readout_ms=250):
        b=self.b
        if set(rates)!=set(self.slices) or not all(np.isfinite(v) and 0<=v<=250 for v in rates.values()):
            raise ValueError('Invalid sensory rate vector')
        rate_vector=np.zeros(len(self.input_neurons))
        for name,(start,end) in self.slices.items():
            rate_vector[start:end]=float(rates[name])
        # Explicit Bernoulli(dt*rate) samples match N=1 reference input semantics.
        # A private NumPy generator avoids Brian Cython's pointer-based RNG buffers
        # in portable disk checkpoints. No random choice bypasses the neurons.
        ticks=int(round(duration_ms/.1))
        events=self.rng.random((ticks,len(rate_vector))) < rate_vector[None,:]*.0001
        tick_indices,neuron_indices=np.nonzero(events)
        times=self.net.t+tick_indices*.1*b.ms
        self.input_neurons.set_spikes(neuron_indices,times,sorted=True)
        started=time.monotonic()
        total_before=np.asarray(self.monitor.count[:],dtype=np.int64).sum()
        if duration_ms>readout_ms: self.net.run((duration_ms-readout_ms)*b.ms)
        before=np.asarray(self.monitor.count[:],dtype=np.int64).copy()
        self.net.run(readout_ms*b.ms)
        after=np.asarray(self.monitor.count[:],dtype=np.int64)
        counts=after-before
        self.steps+=1
        summary={'buy_hz':float(counts[self.output_indices['buy']].mean()/(readout_ms/1000)),
             'sell_hz':float(counts[self.output_indices['sell']].mean()/(readout_ms/1000)),
             'spikes':int(after.sum()-total_before),'active_neurons':int(np.count_nonzero(counts)),
             'wall_seconds':time.monotonic()-started,'neural_time_ms':float(self.net.t/b.ms),
             'state_id':f'{self.manifest_hash[:12]}:{self.steps}', 'manifest_hash':self.manifest_hash,
             'readout_ms':readout_ms,'window_ms':duration_ms,
             'output_neurons':{k:[{'id':str(self.ids[i]),'spikes':int(counts[i]),'hz':float(counts[i]/(readout_ms/1000))} for i in indices] for k,indices in self.output_indices.items()}}
        return summary

    def checkpoint(self,path):
        # Only locally generated checkpoints are deserialized. Includes delayed events.
        self.net.store('brain',filename=str(path))
        with Path(path).open('rb') as f: state=pickle.load(f)
        state['tradefly']={'rng':self.rng.bit_generator.state,'steps':self.steps,'manifest_hash':self.manifest_hash}
        with Path(path).open('wb') as f: pickle.dump(state,f,protocol=5)
    def restore(self,path):
        with Path(path).open('rb') as f: meta=pickle.load(f)['tradefly']
        if meta['manifest_hash']!=self.manifest_hash: raise ValueError('Checkpoint experiment mismatch')
        self.net.restore('brain',filename=str(path),restore_random_state=False)
        self.rng.bit_generator.state=meta['rng']
        self.steps=meta['steps']
