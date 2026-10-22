# Minecraft skin viewer for three.js and React Three Fiber: design

Date: 2026-10-22. Status: draft for approval.

## Intent

A Minecraft player-skin viewer that does everything skinview3d does, but runs
on the three.js the host app already has. skinview3d depends on and pins its
own three (`^0.156`), so an app on a current three loads two copies of it. It
crashes on current three (`SkinViewer.dispose()` calls `fxaaPass.fsQuad`,
which three renamed to `_fsQuad`), and its constructor sets
`ColorManagement.enabled = false`, a global change that alters colours in
every other scene sharing that three. Upstream has been dormant since
2026-05. No maintained package fills this gap: standalone viewers bundle or
pin three, and the React packages wrap skinview3d.

The first consumer is an existing React 19 / R3F 9 / three r186 site that
uses skinview3d today to show a walking, auto-rotating player on a page. The
real check is replacing skinview3d there and comparing the two side by side.
Beyond that, the audience is anyone who would reach for skinview3d, with or
without React.

Published publicly under the **afterhours-systems** GitHub org once
everything is done. MIT. No branding from the first consumer anywhere in
code, docs, package metadata or history.

## Goals

1. **Feature parity with skinview3d 3.4.2** (the whole list below).
2. **Uses the host's three.** `three` is a peer dependency, and so are
   `react` and `@react-three/fiber`, marked optional. Every import is from
   `three` or `three/addons/...` (`three/examples/jsm/...`), never
   `three/src/...`.
3. **No global three state is touched**: not `ColorManagement`, not
   `Cache`, not `DefaultLoadingManager`, not prototype patches. Output must
   look right with three's default colour management on.
4. **Visual fidelity first.** Side by side with skinview3d on the same skins
   it looks at least as good. Runtime performance is not a goal beyond
   "doesn't stutter on a laptop".
5. **Works on current three** (r186) and keeps working: no reliance on
   private three internals.

### Parity list (all in scope)

Skin and model
- 64×64 skins and legacy 64×32 skins. Legacy skins get the left arm and leg
  mirrored from the right ones, and a hat region with no transparent pixels
  is cleared (old skins often filled it opaque).
- HD skins: any width that is a multiple of 64 (scale = width / 64).
- Classic/slim model, detected from the pixels with an explicit override.
  Detection covers skins whose unused arm column is transparent, black or
  white.
- Inner and outer layer per part (head, body, both arms, both legs),
  individually showable or hideable.
- Outer layer slightly outside the base (about 0.5 px for the head, 0.25 px
  for body and limbs). It uses alpha testing, not blending, so transparent
  pixels stay transparent, and it renders both sides the way the game does.
- Sources: URL (with cross-origin), `HTMLImageElement`, canvas,
  `OffscreenCanvas`, `ImageBitmap`, `HTMLVideoElement`.

Back and head extras
- Cape: 64×32 layout, legacy 22×17 and OptiFine 46×22 formats, HD.
- Elytra from the cape texture; back equipment is one of cape, elytra or
  none.
- Ears: a standalone 14×7 texture (HD multiples) or the ear region of a skin
  (the deadmau5 layout).

Name tag
- A text label above the player: text, text style, background style,
  margin, font, height. It sits higher when ears are shown and follows the
  head during animations. It repaints once a web font has loaded.

Animations
- Idle, walking, running, flying (elytra pose), wave (left or right arm),
  crouch (optionally hitting, once or looping, with or without showing the
  transition), hit, swim.
- Custom animations from a function of (player, progress, delta).
- Speed, paused, progress. Extra motions can be stacked on a running
  animation and removed again.
- Switching animation resets the pose.

Viewer
- Size, pixel ratio (fixed or follows the device), pause and resume of the
  render loop, recovery after WebGL context loss.
- Background: colour, image, or equirectangular panorama. Transparent by
  default.
- Camera: vertical FOV plus zoom. The distance is derived from both so that
  zoom 1 puts the top of the head on the canvas edge. Reset camera pose.
- Orbit controls: rotate and zoom on, pan off, distance limits 10 to 256
  (skinview3d's defaults), all switchable.
- Auto-rotate with a speed in rad/s that pauses while the user drags.
- Default lights: ambient plus a light that follows the camera, both
  adjustable. Defaults look like skinview3d's under colour management.
- Anti-aliasing that leaves pixel edges at least as clean as skinview3d's
  FXAA.
- Screenshots (a data URL or blob of the current frame) and offscreen
  rendering of a single frame.

### Beyond parity

- `upsideDown`: renders the player upside down the way Minecraft does for
  players named Dinnerbone and Grumm. It is a prop or option only, because
  the library sees textures, not player names.

## Non-goals

- Fetching skins by player name or talking to any skin API. Consumers pass a
  URL or image.
- Runtime performance tuning, instancing, or many players at once beyond
  what falls out naturally.
- Items in hand, armour, other entities, block scenes.
- Any server-side or Node rendering.

## Anti-goals (fail even if it technically works)

- Changing any global three state, or depending on a specific three internal.
- Bundling, pinning or re-exporting three, react or R3F. Importing
  `three/src/...`.
- Bundling Mojang assets: no default Steve/Alex skins, no game textures. Test
  fixtures are generated, not copied from the game.
- Copying code from skinview3d or skinview-utils. They are fine for checking
  face orientation and behaviour; the implementation is our own.
- Anything from the first consumer in the public repo (names, URLs, jokes,
  the handoff note).

## Shape

One package, ESM only, TypeScript with shipped declarations, and two entry
points:

- **`.` (core, no React):** framework-free three.js. It contains:
  - The skin-format logic: UV tables, legacy conversion, HD scale, slim
    detection, hat clearing, ear extraction, cape format detection. It is
    pure functions over plain pixel data (`{ width, height, data }`) so it
    runs and tests in Node with no DOM.
  - The player model: a `Group` with named, addressable parts (each body
    part with its inner and outer layer, cape, elytra with both wings,
    ears), plus the per-texture setup (`NearestFilter`, `SRGBColorSpace`,
    no mipmaps, each texture owned and disposed by its player).
  - Animations as pure pose functions of time, which are unit-testable,
    applied to the model by a thin layer.
  - The name tag.
  - A `SkinViewer` class for plain three users that owns its canvas,
    renderer, scene, camera, controls, lights and loop, and covers the
    viewer list above. Its concepts and names follow skinview3d's where that
    reads naturally (`SkinViewer`, `loadSkin`, `animation`, `autoRotate`,
    `nameTag`, `zoom`, `fov`) so migration is mostly mechanical. It does
    not promise exact API compatibility. *(Builder's call within that.)*
- **`./react` (R3F):**
  - A model component (working name `<MinecraftPlayer>`) that renders the
    player group into the consumer's own `<Canvas>`. Props cover skin, model,
    layers, cape, back equipment, ears, name tag, animation, animation
    speed and pause, and upside-down. `animation` takes a built-in name
    (`"walk"`) or a custom function. A ref exposes the underlying group and
    parts for imperative use.
  - A viewer component (working name `<SkinViewer>`): an R3F `<Canvas>`
    with camera framing (FOV and zoom), controls, auto-rotate, lights,
    background, panorama, anti-aliasing, pixel ratio and screenshots, with
    `<MinecraftPlayer>` inside. Extra `children` go into the same scene.
    This is the drop-in for skinview3d in a React app.

Peer dependencies: `three` (required, with a range that includes 0.186);
`react` ^19 and `@react-three/fiber` ^9 (both optional, only for
`./react`). No dependency on drei: orbit controls come from
`three/addons`.

## Constraints

- Repo: its own git repo, branch `main`, no remote until the owner says
  go. Commits are authored as `MistralWolf <mistralwolf@proton.me>` (set in
  the repo's local git config) and end with the `Co-Authored-By` trailer.
- `HANDOFF.md` is git-excluded and stays that way. It also holds the
  integration and comparison steps for the first consumer, which must not be
  committed here.
- Package manager: pnpm, run in this folder only.
- Tests: vitest in Node for everything pure. A Vite + R3F playground in the
  repo exercises every feature (a control panel like skinview3d's demo
  page). Visual checks are headless-Chromium screenshots of the playground
  and, at the end, the side-by-side comparison in the first consumer.
- Skins for manual and visual testing are fetched at runtime (e.g.
  mc-heads.net), never committed. They cover classic, slim, legacy 64×32, HD,
  heavy outer layer, ears, cape (each format) and elytra.
- Every skin-format number is checked against https://minecraft.wiki/w/Skin
  (and the cape and elytra pages) before it goes into code.

## Decided

- Full skinview3d parity, nothing struck (owner).
- Public under afterhours-systems, no first-consumer branding, published only
  when everything is done (owner).
- Commit identity MistralWolf (owner).
- Name chosen by the builder at the owner's request (see Name).
- Three layers: plain three core, R3F model component, R3F viewer component
  (proposed in the conversation, owner said go).

## Name

**blockskin**, published as `@afterhours-systems/blockskin`, with the GitHub
repo `afterhours-systems/blockskin`. The npm org doesn't exist yet and is
created at publish time. The name deliberately leaves out "Minecraft":
Mojang's brand guidelines ask projects not to use it in product names. The
README can still say "Minecraft skin viewer" descriptively, with the usual
"not affiliated with Mojang" line. Checked 2026-10-22: `blockskin` and
`@afterhours-systems/blockskin` are free on npm, and the GitHub repo does
not exist.

Publishing goes to npmjs.com, not GitHub Packages: GitHub's npm registry
needs a token even to install a public package. A GitHub Actions workflow
publishes with npm trusted publishing (OIDC, no stored npm token, provenance
on every release). It is set up when the remote is created, not before.

## Order of finishing

"Done" means the parity list works in the playground and the owner has
approved the local side-by-side comparison in the first consumer, with the
package linked locally and that consumer's repo reverted afterwards. Then
the remote and npm publish, on the owner's go. Switching the first consumer
over is its own change, made after publishing, because its build installs
from the registry.

## Left to the builder

- Internal module layout, build tool (Vite library mode, tsup or tsc),
  lint and format setup, CI once a remote exists.
- Exact peer range for `three` (lowest version actually tested, must
  include 0.186).
- Units and origin. Recommendation: 1 unit = 1 skin pixel (as in
  skinview3d), with feet at the origin for the model component so it stands
  on the consumer's ground. The viewer centres the player itself.
- Loading behaviour in React (Suspense or an internal loading state). In
  both cases nothing renders until the skin is ready, and errors arrive
  through `onError`, never as a crash.
- Anti-aliasing technique, as long as the result is at least as clean as
  skinview3d's.
- Light types and intensities that match skinview3d's look under colour
  management (three's lights are physically based since r155, so the
  numbers will differ).
- Whether to ship the Minecraft web font for name tags. Ship it only if its
  licence clearly allows redistribution; otherwise document how to supply a
  font.
- Animation curves: match how they look in skinview3d and in the game, not
  its constants.
