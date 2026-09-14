# Anatomical brain activity viewer research

Research only, 2026-09-14. The user wants a rotatable anatomical brain whose neurons light up from simulated activity. The current charts are not that experience. No simulator or trading changes were made for this investigation.

## References worth using

- [DesktopFly](https://github.com/DenisSergeevitch/desktop-fly): its README reports 23,210 FlyWire v783 positions in the background brain view, and a much smaller simulated female circuit (668 neurons). The background cloud and the actively simulated circuit are distinct. [BrainView.swift](https://github.com/DenisSergeevitch/desktop-fly/blob/master/BrainView.swift) draws a dim point cloud and a brighter circuit overlay. The render loop drains a spike-event bus, places pooled glowing markers at the firing neurons' positions, and fades them over 0.28 seconds (0.6 seconds for Giant Fibers). These visible durations are presentation choices, not biological spike lengths. Drag rotates; scroll zooms. Click stimulation changes the simulation, so Tradefly should use click-to-inspect instead.
- [SiliconFly](https://github.com/dawsonamf/siliconfly): a DesktopFly derivative whose README describes a whole-FlyWire GPU simulation with 139,255 neurons. Its [brain renderer](https://github.com/dawsonamf/siliconfly/blob/master/BrainView.swift) samples events across each batch and caps ordinary flashes per frame. This is useful for rendering efficiency, but a sampled display must disclose its coverage; every visible dot does not imply every spike was rendered.
- [NeuroNLP.FlyWire](https://flywire.neuronlp.fruitflybrain.org/) and the [FlyWire gallery](https://home.flywire.ai/gallery) are references for actual neuron geometry, cell-type selection and anatomical exploration. Structural connectome viewers alone do not supply Tradefly's simulated firing activity.

## Anatomy and provenance

DesktopFly's [extractor](https://github.com/DenisSergeevitch/desktop-fly/blob/master/etl.py) reads FlyWire v783 coordinates and classification by root ID. It takes the first coordinate for each ID, normalizes the positions and creates a compact display dataset. Verify what each coordinate represents before calling it a soma location: a point coordinate is not a neuron skeleton or complete morphology.

Use the same FlyWire specimen/version as Tradefly, and join positions to our original neuron IDs. Do not join by array index: Tradefly reorders neurons for its sensory populations. Retain original coordinates, units and the visualization transform; report mapped, unmapped and sampled counts. Missing coordinates must not be replaced with invented anatomical positions.

DesktopFly's code is MIT; its README identifies the FlyWire-derived files as CC BY-NC 4.0. Keep data provenance and attribution separate from code licensing. No external geometry or code was copied in this research change.

## What Tradefly currently has

`backend/tradefly/brain.py` runs a whole-network SpikeMonitor with `record=False`. The in-memory count vector covers every neuron, but each saved decision retains only aggregate spike totals, active-neuron counts and the three output neurons' individual counts/rates. The saved decisions cannot reconstruct the other firing neuron identities or their exact spike times.

The existing per-neuron readout count vector could support a real spatial activity-intensity snapshot with a small telemetry addition. It cannot support an honest time-ordered spike replay without additional recording. Total spikes currently cover 500 ms while active-neuron counts and output rates cover the last 250 ms; preserve these time-window distinctions.

## Proposed Tradefly viewer

1. A large, dark indigo, rotatable 3D point cloud using verified FlyWire coordinates. Quiet neurons remain faint; measured activity brightens corresponding IDs. Load geometry once and update a GPU buffer, using the existing Three.js dependency.
2. Add bounded, sparse firing telemetry: neuron ID plus count for spatial snapshots, or neuron ID plus simulation timestamp for an actual replay. Keep this observational: no stimulation controls, weight edits or trading changes. Benchmark recording overhead and checkpoint compatibility before restarting the worker.
3. Stream completed simulation batches and play them in simulation-time order. Label delayed playback and any time scaling. A 500 ms brain calculation can take several wall-clock seconds on this machine, so smooth real-time activity cannot be inferred from the current bridge cadence.
4. Selecting a neuron shows its ID, cell type when known, measured firing and whether it belongs to an input or output group. Keep buy/sell readings in a small secondary inspector.
5. Limit visual samples if needed for performance, but keep aggregate counts accurate and expose sampled/unmapped coverage. Pause visual playback independently of trading; support reduced motion and dispose GPU resources when the window closes.

This would replace the primary charts with the anatomical view the user described. A future implementation needs coordinate validation and additional backend telemetry; a cosmetic point cloud with random flashes would not satisfy the request.

## Implemented anatomical replay (2026-09-15)

The primary view now renders 138,639 neuron locations in Three.js, joined by original FlyWire root ID to the exact v783 model. All model IDs matched; none were invented. `scripts/prepare-brain-geometry.py` reproduces the compact coordinate file from the published coordinates and classification tables. The generated file records source URLs, SHA-256 checksums, source units and the normalization transform. These are annotation locations, not neuron skeletons or asserted soma positions. Dataset attribution is visible in the viewer.

`backend/tradefly/neural_activity.py` temporarily attaches a passive spike monitor for each existing calculation. It records neuron IDs and actual simulation timestamps, then removes itself before checkpointing. The original brain implementation and model hash remain unchanged. At most 4,000 evenly sampled events are sent per calculation; the viewer reports full recorded and visible counts. Each locally saved decision retains that bounded replay. Desktop snapshots include up to three replays within a 200 KB additional-data budget and 850 KB total payload target; older decisions retain aggregate readings.

Drag rotates, wheel zooms, and a click selects a neuron without stimulating it. Replay pause, speed and scrubbing act only on the visualization. A visible glow lasts 45 simulation milliseconds to make spikes readable; it does not depict the biological duration of an action potential. Reduced-motion settings disable automatic playback. Old decisions without timestamp records show anatomy only. A separately labeled controlled validation replay is available before any new trading calculations occur.

`uv run python scripts/check-neural-activity.py` restored the same checkpoint before baseline and recorded calculations, with identical fixed inputs. Both produced exactly equal per-neuron spike counts and membrane voltages. The recorded calculation captured all 8,204 spike events; the display retained 4,000. Temporary-monitor checkpoint save/restore also passed. This check used no broker and placed no orders. Warm-run wall times were 9.53 s baseline and 5.86 s observed; timing varies with compilation and machine load, so this is compatibility evidence, not a speedup claim.

Account equity, pilot comparison and neural traces now have pointer/touch inspection and keyboard navigation (arrows, Home/End, Escape), with time/bar positions and exact series values. Local browser verification used a temporary fixture route that is removed before publishing.
