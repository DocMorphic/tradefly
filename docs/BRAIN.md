# Full-network implementation and validation

Reference: [Shiu and colleagues' research implementation](https://github.com/philshiu/Drosophila_brain_model), pinned to `91bdd1e7dcf193f3e7ca5a8933497fcef63b7960`. Code attribution and MIT license are retained in `licenses/SHIU_MODEL_MIT.txt`. Downloaded research code/data remain under ignored `vendor/`; no connectivity data is redistributed in the repository or deployed site. The upstream code license is not a substitute for dataset attribution or the [FlyWire data terms](https://flywire.ai/).

The v783 files in that pinned repository contain **138,639 neurons, 15,091,983 neuron-pair rows, and 54,492,922 synapses**. These are measured counts, not interchangeable descriptions. We preserve every listed neuron, row, sign, synapse count, and index-to-root-ID mapping. Connectivity weights are the supplied signed synapse counts multiplied by 0.275 mV. A permutation puts sensory groups in contiguous ranges; it changes indexing only, with original FlyWire IDs retained in the manifest.

The published notebook describes v630 populations. Three input IDs are absent from the v783 neuron list: `720575940618600651`, `720575940620900446`, `720575940626307902`. They are explicitly excluded from stimulation in `config/brain-manifest.json`; no replacement identities or missing neuron reconstructions are invented. The complete v783 graph is retained. This is a documented v783 adaptation, not a literal reproduction of the original v630 experiment.

## Frozen artificial interface

| Observation | Published sensory group | Encoding |
| --- | --- | --- |
| Positive one-bar return | Right sugar GRNs | Return / 1% |
| Negative one-bar return | Right bitter GRNs | Negative return magnitude / 1% |
| Intrabar range | Right water GRNs | (High − low) / previous close / 2% |
| Relative volume | Right IR94e GRNs | Volume / mean of preceding 20 bars − 1 |
| Position fraction | JON CE | Position market value / account equity |
| Cash fraction | JON F | Cash / account equity |

Each nonnegative observation is clipped to [0, 1] and converted to **10 + 90 × value Hz**. These are human-designed numerical mappings, not natural financial senses or learned representations. Inputs are independent Bernoulli trials per 0.1 ms step, matching the reference's N=1 Poisson-input discretization. The random input spikes only stimulate the network; they cannot choose a trade.

BUY reads MN9 (`720575940660219265`). SELL averages the notebook's DN1/DN2 outputs (`720575940616185531`, `720575940629806974`). Population membership is fixed, disjoint from stimuli, and structurally reachable. Labels are assigned by us. Threshold 20 Hz and margin 8 Hz were inherited from the pre-financial experiment plan; no parameters have been tuned for profit. A 500 ms neural window uses the final 250 ms for decision rates.

## Adapter differences

The leaky integrate-and-fire equations, -52 mV resting/reset potential, -45 mV threshold, 20 ms membrane constant, 5 ms conductance constant, 2.2 ms refractory period (zero for stimulated neurons), 1.8 ms internal synaptic delay, and fixed signed weights follow the reference. The reference reset string's assignment to undeclared `w` is omitted; synaptic `w` is never reset by a neuron spike. Neuron resets set voltage and conductance only.

The trial-oriented reference creates PoissonInput objects and records all spikes. The persistent adapter uses a fixed SpikeGeneratorGroup supplied by an explicit NumPy generator, with the same per-timestep Bernoulli probability and 68.75 mV stimulus. Input delivery occurs after internal synapse delivery. This is a documented scheduling/RNG adaptation, not a claim of bitwise equality with upstream random trials.

Brian2's installed Cython disk RNG restore did not reproduce a minimal Poisson-only test reliably. Tradefly therefore checkpoints its own NumPy generator state and restores Brian's deterministic network state without its pointer-based RNG buffers. Same-process and fresh-process tests compare the complete vector of neuron spike counts. These tests are required before use; a model/encoder/manifest hash change invalidates earlier readiness reports.

Only aggregate spike counts are kept during the run. Full spike trains are not continuously accumulated. About 250 MB is checkpointed per completed market decision; local disk needs headroom for atomic replacement. No learned weights, rewards, dopamine learning, financial predictor, or LLM has been added.

## What validation establishes

The local reports under `data/brain/` record: silent-input behavior, sugar-to-MN9 response, mechanosensory-to-DN response, an all-internal-edges-disabled control, peak memory/runtime, checkpoint size, and deterministic restart checks. Exact reports are visible in the desktop and summarized in `docs/VALIDATION.md`.

These are engineering and causal-connectivity checks. They do not reproduce every published stimulus-response curve, establish biological completeness, prove profitability, or evaluate an unseen financial period. The measured dataset is the adult female brain, not Google's newer male CNS connectome.
