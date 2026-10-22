# Offline parking render plates

The render pipeline uses a separate Blender background process. It never opens, overwrites or controls an existing interactive Blender session. No API key or paid cloud service is involved.

## Reproduce a demonstration plate

From the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/render-parking/render.py -- --manifest scripts/render-parking/demo-minus-1.json --width 2048 --height 1536 --samples 128
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/render-parking/render.py -- --manifest scripts/render-parking/demo-minus-2.json --width 2048 --height 1536 --samples 128
```

The script writes projection JSON to `public/parking-renders`, while raw PNGs, preview files and self-contained source `.blend` files stay in ignored `.data/render-parking`. Only the final WebP, JSON and attribution are public assets. The bundled Ferrari GLB imports through Blender's own Draco decoder. Cycles uses Apple Metal when available, with denoising and a deterministic seed. Add `--cpu` if the host cannot render with Metal. `--preview --width 1200 --height 900 --samples 32` creates a separate preview without replacing final plates.

Convert the lossless PNG to a WebP with the repository's installed Sharp package:

```sh
node scripts/render-parking/export-webp.mjs
```

The `.blend` (ignored working output), script, source fixtures, original GLB and licensed texture maps support reproduction; the browser does not download those source assets. The frontend loads only the compressed plate and projection JSON. Regenerate once per geometry, camera, style or source revision; selecting a place reuses the existing plate.

## Frontend contract

`/parking-renders/demo-level-minus-1.json` and `demo-level-minus-2.json` use `schemaVersion: gp-parking-render/1` and contain `level`, `isDemo`, `width`, `height`, `image`, and `spaces`. Each space has its display `number`, `polygon`, `anchor` on the floor and elevated `label` position. All image coordinates are normalized to [0, 1], with origin at the top-left. The exact image aspect ratio must be retained; for `object-fit: contain`, apply polygons inside the contained image bounds rather than the outer element.

Map `number` plus `level` to the current public parking group's aliases. Do not copy private physical IDs into these static assets. Availability remains a live API decision. The neutral base plate contains white stall markings and floor numbers but no selected tint, label, price, availability or interface. Gold fill and violet outlines are frontend overlays.

The JSON also records SHA-256 of the exact compressed WebP bytes (`renderHash`), source-file and renderer-script hashes, camera pose and world-to-camera matrix, Blender version, samples, denoising and attribution. Source XZ maps to Blender `(X, -Y)`; Blender Z is the vertical axis. Camera quaternion order is `[w, x, y, z]`.

## Evidence boundary

La qualité visuelle actuelle a été approuvée par le propriétaire pendant la recette du 21 octobre 2026. Une évolution ultérieure devra varier les voitures de contexte (citadines, SUV, Range Rover, Porsche, véhicules courants) ; ce changement est explicitement différé. Le prochain essai de fidélité utilisera les plans et photos d’un vrai parking fournis par le propriétaire.

`isDemo: true` is mandatory for the decorated fictional garage. The eight-space layout, concrete walls, columns, ramp, stair, luminaires and silver context cars are illustrative and do not describe a real property. Levels −1 and −2 have separately declared available numbers (12/13 and 24 respectively).

For a real input, the script rejects an uncalibrated manifest and renders only supplied floor, obstacle and space polygons. It does not infer walls, columns, stairs, cars, damage, lights, materials observed in photos, or accessibility facts. Neutral concrete shading is a visualization material, not a condition assessment. A production real-property render still requires a reviewed and current geometry/identity mapping before publication.

## Asset credit

Car geometry: **Ferrari 458 Italia by vicent091036, CC BY 4.0**. Neutral silver material and architectural context placement are modifications. Full sources, license links and changes are preserved in `scripts/render-parking/assets/ATTRIBUTION.md`, public `/parking-renders/ATTRIBUTION.txt` and each render JSON. The frontend must keep the credit reachable, for example through a “Crédits du rendu” link.

The photographed Garage Floor PBR maps by Jenelle van Heerden / Poly Haven are CC0 1.0: https://polyhaven.com/a/garage_floor. They are desaturated and mixed with neutral procedural concrete only for the fictional demo. Real measured manifests keep neutral procedural shading and do not inherit photographed cracks or wear. Original maps and download metadata remain under `scripts/render-parking/assets`.

## Occlusion masks and click regions

After both beauty plates and WebP exports exist:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/render-parking/render-masks.py
node scripts/render-parking/export-masks.mjs
```

This pass opens the ignored final `.blend` files in a new background process and never saves over them. It uses the exact final cameras and opaque geometry. A white emission patch sits on the same source footprint as each selectable stall; columns, cars, wheel stops and walls render black. Painted numbers and markings stay in the selectable region. No beauty image, camera or geometry is altered by this pass.

Each `spaces[]` entry gains:

- `mask`: canonical RGBA PNG URL, with exactly the same 2048×1536 frame as the beauty WebP. White RGB is constant; alpha is zero outside visible floor and across occluding objects, with antialiased edges.
- `maskHash`: SHA-256 of the exact public PNG bytes.
- `hitContours`: normalized `[x, y]` contour arrays. Build a closed path for every contour and use the `evenodd` fill/clip rule. This excludes occluders from pointer hit testing; an SVG mask alone does not reliably exclude masked-out pixels from hit testing.

Export bounds are at most **64 contours** and **512 points per contour**, with a 0.8-pixel contour simplification tolerance. Both axes stay in `[0, 1]`. Raster masks use alpha threshold 128 for the corresponding click contours. Map normalized coordinates to the image frame, including any `object-fit: contain` letterboxing; do not stretch masks independently. Root SVG masks should use alpha masking, `maskUnits="userSpaceOnUse"`, and the exact image dimensions.

The public payload includes only the active demo spaces 12/13 at level −1 and 24 at level −2. Context spaces remain painted into the plate and have no hotspot or clickable contour.

Run `node scripts/render-parking/verify.mjs` after exporting both plates and masks. It checks exact image/mask hashes, 2048×1536 frames, alpha, current source/script hashes, allowed numbers, normalized/bounded contours, visible-floor anchors, and that projected foreground column heads are excluded from both masks and click regions. It makes no network requests and does not modify the assets.
