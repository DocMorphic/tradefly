# Tradefly brain visualization data

`flywire-v783.json` is derived from the FlyWire v783 coordinates and classification releases, credited to the FlyWire Consortium, Dorkenwald et al. and Schlegel et al. (Nature, 2024). FlyWire data is licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/ . Source URLs and SHA-256 checksums are embedded in the JSON. The normalization transform is also recorded. Each point is the first available annotation coordinate for its root ID, not a skeleton or a guaranteed soma position.

Regenerate with `scripts/prepare-brain-geometry.py` and the two official compressed CSV source files. Only neurons present in Tradefly's v783 model are retained; original IDs remain strings to preserve 64-bit precision.

`validation-replay.json` contains measured simulated spikes from an isolated, controlled validation of Tradefly's model. It is not a stock evaluation and caused no broker orders. Its scope and recorder hash are embedded in the file. Regenerate with `scripts/check-neural-activity.py` while the model checkpoint is available.
