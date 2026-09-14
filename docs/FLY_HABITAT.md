# Fly habitat body and animation

The body geometry is adapted from DesktopFly by Denis Shiryaev, MIT licensed, pinned to `32b00011e83c3dc85fa3ea0b3934155b04f1635d` (`windows/src/flymodel.js`). The joint hierarchy, material colors, abdominal texture, leg proportions and wings are retained; `groundLift` follows `LegDynamics.groundElevation`. The complete upstream license is distributed at `public/desktopfly-license.txt`. No upstream connectome data or neural/motor controller is imported.

Tradefly adds thoracic setae, wing veins, soft stage shadows and its own telemetry animation adapter. SCANNING and SELL use small stepping motions; HOLD/PENDING use front-leg grooming; BUY uses a reaching gesture; a new FILLED event produces one short flutter. PAUSED/OFFLINE/CLOSED rest with folded wings. Pose interpolation, ground clearance and reduced-motion controls prevent abrupt state snapping. These are illustrative mappings, not biological responses to markets.

The camera and model use +Z up and +Y forward. Geometry and textures are disposed on closing the window. The scene is lazy loaded, caps pixel ratio at 1.5, limits rendering to 45 fps and skips rendering while hidden.
