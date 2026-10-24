# blockskin Playful Additions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the features skinview3d lacks: smooth transitions, random
actions, poke reactions, a head that follows the pointer, 3D skin layers, a
ground shadow, formatted name tags and reduced-motion support, all to the
existing blockskin core and both viewers.

**Architecture:**
- **A new core class, `PlayerDriver`, runs each frame.** In order it:
  1. runs the base animation
  2. layers reactions on top
  3. applies pointer-following to the head
  4. blends any running transition
  5. applies the hurt tint
- It stores the pose before and after those overlays, so overlays never leak
  into the next frame. While nothing is overlaid, it touches nothing beyond
  what v1 did.
- All three front ends drive the player through it: the vanilla
  `SkinViewer`, R3F's `MinecraftPlayer`, and R3F's `SkinViewer`, which
  inherits from `MinecraftPlayer`.
- The rest is pure modules: poke detection, look angles, voxel geometry, the
  shadow, the formatting parser and the drawn elytra.

**Tech Stack:** unchanged from v1. TypeScript ~6.0, three ≥0.186, R3F 9,
React 19, vitest 5 in Node, Vite 8 for the playground.

**Spec:** `docs/superpowers/specs/2026-10-22-playful-additions-design.md`.
The v1 spec `docs/superpowers/specs/2026-10-22-skin-viewer-design.md` still
applies.

## Global Constraints

- All of v1's constraints still apply:
  - peers `three >=0.186.0`, optional `react ^19`, optional
    `@react-three/fiber ^9`
  - no `three/src`, no global three state, no drei
  - no Mojang assets
  - no first-consumer names (the pre-commit hook enforces this)
  - MistralWolf commits with the `Co-Authored-By` trailer
  - single quotes, no semicolons
  - model space: 1 unit = 1 skin px, +y up, the player faces +z with its
    right side at −x, feet at y = 0
  - no remote or publish
- Off by default: random actions, reactions, pointer following,
  `layers3d`, `shadow`.
- On by default: `transition` 0.25 s, `reducedMotion: 'system'`, name-tag
  formatting.
- With default options, every v1 still frame must look identical: the
  skinview3d comparison sheet must not change.
- Option and prop names are identical across the vanilla `SkinViewer`, R3F
  `SkinViewer` and `MinecraftPlayer`:
  - `transition`
  - `reactions`
  - `onPoke`
  - `lookAtPointer`
  - `layers3d`
  - `shadow`
  - `reducedMotion`
- The animation name is `'random'` (class `RandomActions`).
- The version stays 0.1.0.

## Review Focus

1. **Dragging never pokes.** Spinning the player with mouse or touch must
   never fire `onPoke` or a reaction, in either viewer (Task 5, browser
   check).
2. **Pointer following leaves the page alone.** It must not block page
   scrolling or touch panning, and it adds only passive listeners, never
   `preventDefault` (Task 6, listener-options test plus a browser check).
3. **No stuck state from overlapping events.** A poke during a fly action,
   or during a transition, must not leave a stuck elytra, tint or pose.
   Elytra visibility is restored when the action ends; the tint clears
   (Task 4, unit test).
4. **Clean teardown mid-reaction or mid-fly.** Unmount or dispose then
   leaves no listeners, no drawn-elytra texture and no tint behind (Task 4,
   `driver.dispose` test; Task 5, browser check of listener cleanup).
5. **3D layers follow skin changes.** Switching skin, or slim and classic,
   while `layers3d` is on rebuilds the voxel arms at the new width and
   disposes the old geometry (Task 7, unit test).

---

### Task 1: Pose snapshots and `PlayerDriver` with transitions

**Files:**
- Create: `src/driver/pose.ts`, `src/driver/PlayerDriver.ts`, `src/driver/pose.test.ts`, `src/driver/PlayerDriver.test.ts`
- Modify:
  - `src/model/PlayerObject.ts`: make `joints()` public as `poseJoints(): Object3D[]`
  - `src/animation/PlayerAnimation.ts`: add the switch signal
  - `src/index.ts`

**Interfaces:**
- Produces:
  ```ts
  // pose.ts
  type PoseSnapshot = Map<Object3D, { position: Vector3; quaternion: Quaternion }>
  capturePose(player: PlayerObject, into?: PoseSnapshot): PoseSnapshot
  restorePose(snapshot: PoseSnapshot): void
  /** weight 0 = snapshot, 1 = the pose currently on the joints */
  blendFrom(snapshot: PoseSnapshot, weight: number): void   // positions lerp, rotations slerp
  easeOut(t: number): number                                 // 1 - (1 - t)^3, t clamped to [0,1]
  // PlayerAnimation (addition)
  readonly switchCount: number          // incremented by protected markSwitch()
  protected markSwitch(): void
  // PlayerDriver.ts
  class PlayerDriver {
    constructor(player: PlayerObject, options?: { transition?: number })
    readonly player: PlayerObject
    transition: number                  // seconds, default 0.25; 0 snaps
    reducedMotion: boolean              // default false
    animation: PlayerAnimation | null   // setter: snapshot shown pose, resetPose() (as v1), start transition
    update(deltaSeconds: number): void
    dispose(): void
  }
  ```
- **Frame order in `update`:**
  1. If overlays ran last frame, `restorePose(base)`.
  2. Unless `reducedMotion`, call `animation?.update(player, dt)`. When
     `reducedMotion` turns on, call `resetPose()` once and hold.
  3. If `animation.switchCount` changed, start a transition from `shown`.
  4. If any overlay is active this frame, `capturePose(player, base)`. Later
     tasks add reactions, look-at and tint here.
  5. Blend the transition with `blendFrom(from, easeOut(t / transition))`.
  6. `capturePose(player, shown)`.
- Overlays this task: the transition only.

- [ ] **Step 1: Write tests:**
  - `blendFrom` at weight 0 restores the snapshot and at 1 leaves the
    current pose; at 0.5 a joint rotated 0 → π/2 about x sits at π/4.
  - A transition starts at the previous pose: after a switch from walk to
    idle, `update(0)` shows the walk pose, and `update(0.25)` shows pure
    idle.
  - `transition = 0` snaps: the first `update` after a switch shows the new
    animation.
  - An interrupted transition starts from what is shown: switching again
    mid-way, the next frame equals the pose shown last frame.
  - `animation = null` blends back to rest over 0.25 s.
  - v1 compatibility: with no animation and no transition running, a manual
    `player.skin.head.rotation.y = 1` survives 10 updates.
  - With an animation and no overlays, a joint the animation doesn't touch
    keeps a manual edit.
  - `markSwitch` from inside an animation starts a transition.
  - `reducedMotion = true` holds the rest pose while an animation is set.
- [ ] **Step 2:** Implement, run `pnpm test`, and commit
  `feat(driver): pose snapshots, PlayerDriver and smooth transitions`.

### Task 2: Wire `PlayerDriver` into the three front ends

**Files:**
- Modify: `src/viewer/SkinViewer.ts`, `src/react/MinecraftPlayer.tsx`, `src/react/SkinViewer.tsx`, `playground/main.tsx`, `playground/state.ts`, `playground/Panel.tsx`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - **Vanilla `SkinViewer`:**
    - `readonly driver: PlayerDriver`
    - option and property `transition`
    - its `animation` getter/setter delegates to the driver
    - `step()` calls `driver.update(dt)`
  - **`MinecraftPlayer`:**
    - prop `transition?: number`
    - creates its driver in the same effect as its player
    - `useFrame` calls `driver.update(delta)`
    - an animation prop change sets `driver.animation`
  - **R3F `SkinViewer`** passes `transition` through.
  - **Playground:** `transition` in state and on the panel (0–1 s).

- [ ] **Step 1:** Implement. Run `pnpm test && pnpm typecheck && pnpm lint`.
  Expected: PASS.
- [ ] **Step 2:** Run the browser checks from v1 (faces, Review Focus,
  skinview3d comparison) against the playground. Expected: unchanged, all
  passing. Rotate the face-check script's turns through the wrapper, because
  the driver now owns the player's own transform during transitions.
  Visually: switching the animation in the playground glides instead of
  snapping.
- [ ] **Step 3: Commit** `feat: smooth animation transitions in both viewers`.

### Task 3: `RandomActions` and the drawn elytra

**Files:**
- Create: `src/animation/RandomActions.ts`, `src/animation/RandomActions.test.ts`, `src/model/defaultElytra.ts`, `src/model/defaultElytra.test.ts`
- Modify: `src/model/PlayerObject.ts`, `src/animation/index.ts` (add `'random'`), `src/index.ts`

**Interfaces:**
- Consumes: Task 1 (`markSwitch`), and v1's `createAnimation` and
  animations.
- Produces:
  ```ts
  drawDefaultElytra(): Pixels             // 64×32; original art in the elytra region (22,0,24,22) only, the cape region transparent
  // PlayerObject additions
  get hasCapeTexture(): boolean
  /** Shows the elytra, using the drawn texture when no cape is loaded; returns a restore function. */
  wearElytra(): () => void
  interface RandomAction { name: Exclude<AnimationName, 'random'>; weight: number }
  const DEFAULT_RANDOM_ACTIONS: RandomAction[] // idle 3, walk 2, run 1, crouch 1, wave 0.5, fly 0.5
  class RandomActions extends PlayerAnimation {
    constructor(options?: { actions?: RandomAction[]; minDuration?: number; maxDuration?: number; random?: () => number })
    readonly current: Exclude<AnimationName, 'random'> | null
  }
  ```
- **Behaviour:**
  - Defaults: `minDuration` 3, `maxDuration` 6, `random` `Math.random`.
  - Picking is weighted and excludes the previous action. A pool of one
    repeats it.
  - Each switch calls `markSwitch()` and `player.resetPose()` before the new
    sub-animation's first frame.
  - `fly` calls `wearElytra()` when it starts and the restore function when
    it ends.
  - Sub-animation progress starts at 0 for each action.

- [ ] **Step 1: Write tests** (seeded `random`, stepping with `runTo`):
  - Over 200 switches, never the same action twice in a row, and every
    duration within [3, 6].
  - Frequencies roughly follow the weights: idle above 25%, and fly and
    wave each under 15% over 1000 picks.
  - A fly action shows the elytra, with the drawn texture when no cape is
    loaded. After it ends, the elytra is hidden and the previous back
    equipment is back.
  - With a cape loaded, fly uses the cape texture and leaves
    `hasCapeTexture` true.
  - Every switch increments `switchCount`.
  - `createAnimation('random')` returns a `RandomActions`.
  - `drawDefaultElytra`: an opaque pixel at the wing front (24,2) and a
    transparent cape region (1,1).
- [ ] **Step 2:** Implement, run `pnpm test`, and commit
  `feat(animation): random actions with automatic elytra`.

### Task 4: Reactions, poke parts and the hurt tint

**Files:**
- Create: `src/interaction/poke.ts`, `src/interaction/poke.test.ts`, `src/driver/reactions.ts`, `src/driver/reactions.test.ts`
- Modify: `src/driver/PlayerDriver.ts`, `src/model/PlayerObject.ts` (`setTint`), `src/index.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  ```ts
  type PokePart = 'head' | 'body' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg'
  interface PointerSample { x: number; y: number; time: number }   // css px, ms
  isPoke(down: PointerSample, up: PointerSample): boolean           // < 300 ms and < 6 px
  partFromObject(object: Object3D): PokePart | null                 // walks parents; ears → head, cape/elytra → body; null if any ancestor is invisible
  // PlayerObject
  setTint(color: Color | null): void   // multiplies every skin, ears, cape and elytra material colour; null restores white
  // reactions.ts
  interface ReactionContext { part: PokePart; away: Vector3 }       // away: unit vector in the player's parent space
  interface Reaction { duration: number; motion: boolean; apply(player: PlayerObject, t: number, ctx: ReactionContext): void }
  const hurt: Reaction       // knockback 3 px along away and a 2 px hop, back to 0 by 0.4 s (motion)
  const shakeHead: Reaction  // head yaw ±0.5 rad, 3 shakes over 0.6 s
  const waveBack: Reaction   // the poked arm raised and waving for 1 s (ctx.part picks the arm)
  const jump: Reaction       // root hop 4 px, 0.5 s
  const crouchSpam: Reaction // crouch pose toggled at 4 Hz for 2 s
  interface ReactionSet { any?: Reaction | null; head?: Reaction | null; body?: Reaction | null; arm?: Reaction | null; leg?: Reaction | null; annoyed?: Reaction | null }
  const DEFAULT_REACTIONS: ReactionSet   // any: hurt, head: shakeHead, body: null, arm: waveBack, leg: jump, annoyed: crouchSpam
  // PlayerDriver additions
  reactions: ReactionSet | null          // default null (off)
  poke(part: PokePart, away: Vector3): void
  ```
- **Behaviour:**
  - A poke starts `any` plus the part's reaction.
  - It also flashes the tint `(1, 0.45, 0.45)` for 0.4 s, fading out
    linearly.
  - The 5th poke within 3 s, counted on the driver's clock, starts
    `annoyed` instead of the part reaction.
  - Each active reaction blends in over the first 0.08 s and out over the
    last 0.08 s, against the pose beneath it.
  - The base animation keeps running underneath.
  - With `reducedMotion`, reactions where `motion` is true are skipped, and
    the flash still shows.
  - `dispose()` clears the tint and calls any pending elytra restore.

- [ ] **Step 1: Write tests:**
  - `isPoke`: 299 ms with 5 px moved is a poke; 301 ms is not; 6 px is not.
  - `partFromObject`:
    - the head's outer mesh → `'head'`
    - an ear → `'head'`
    - the cape mesh → `'body'`
    - the right leg's inner mesh → `'rightLeg'`
    - a mesh outside the player → `null`
    - a hidden cape → `null`
  - Poking the head: the head's yaw is non-zero mid-reaction and back to the
    base after 0.6 s.
  - Poking the left arm raises the left hand above its shoulder, and the
    right arm follows the base animation.
  - Hurt: the player moves along `away` (dot product > 1 at 0.1 s) and is
    back to base at 0.4 s. The tint is red at 0 s and white at 0.4 s.
  - The 5th poke within 3 s starts the crouch spam; a 5th poke after 3.5 s
    does not.
  - `reactions = null`: a poke changes nothing.
  - A custom `{ head: myReaction }` runs instead of `shakeHead`.
  - Reduced motion: a poke tints but doesn't move the player.
  - Review Focus 3: poke during a `RandomActions` fly, then run past the
    action's end; the elytra is hidden and the tint white.
  - Review Focus 4: `driver.dispose()` mid-reaction clears the tint and
    restores back equipment.
- [ ] **Step 2:** Implement, run `pnpm test`, and commit
  `feat(driver): poke reactions and hurt flash`.

### Task 5: Pokes in the viewers

**Files:**
- Modify: `src/viewer/SkinViewer.ts`, `src/react/MinecraftPlayer.tsx`, `src/react/SkinViewer.tsx`, `playground/*`

**Interfaces:**
- Consumes: Task 4.
- Produces:
  - The option/prop `reactions?: boolean | ReactionSet`, where `true` means
    `DEFAULT_REACTIONS`, and `onPoke?: (part: PokePart) => void`. Both are
    on all three front ends.
  - **Vanilla:** `pointerdown` and `pointerup` on the canvas, then
    `isPoke`, then a `Raycaster` against `playerObject`, using the first hit
    where `partFromObject` isn't null.
  - **R3F:** the group's `onPointerDown` and `onPointerUp` with `e.object`,
    then `isPoke`, then `stopPropagation` on a hit.
  - **`away`:** the horizontal direction from the camera to the player,
    normalised in the player's parent space.
  - `onPoke` fires even when `reactions` is off.
  - **Playground:** a reactions checkbox, a poke log under the panel, and
    `window.__playground.pokes`.

- [ ] **Step 1:** Implement, run `pnpm typecheck && pnpm lint && pnpm test`.
- [ ] **Step 2: Browser checks, in both viewers:**
  - Clicking the head's centre logs `head`, and the screenshot shows red
    tint pixels.
  - A drag of 40 px across the body logs nothing (Review Focus 1, mouse and
    touch).
  - Five quick clicks crouch-spam.
  - After unmounting, a click on where the canvas was logs nothing and
    there are no console errors (Review Focus 4).
- [ ] **Step 3: Commit** `feat: poke reactions in both viewers`.

### Task 6: Head follows the pointer

**Files:**
- Create: `src/interaction/look.ts`, `src/interaction/look.test.ts`
- Modify: `src/driver/PlayerDriver.ts`, `src/viewer/SkinViewer.ts`, `src/react/MinecraftPlayer.tsx`, `src/react/SkinViewer.tsx`, `playground/*`

**Interfaces:**
- Produces:
  ```ts
  const LOOK_LIMITS = { yaw: (60 * Math.PI) / 180, pitch: (40 * Math.PI) / 180 }
  /** Head yaw/pitch that face `target` (world space), measured in the head's parent space, clamped. */
  lookAngles(head: Object3D, target: Vector3): { yaw: number; pitch: number }
  pointerTarget(camera: Camera, ndc: Vector2, distance: number): Vector3   // a point on the pointer ray, `distance` from the camera
  addPointerListener(target: Window | HTMLElement, onMove: (event: PointerEvent) => void): () => void // passive listener, returns cleanup
  // PlayerDriver additions
  lookAt(target: Vector3 | null): void   // the world point; records the time of the last call
  ```
- **Behaviour:**
  - In `update`, look-at runs after reactions.
  - Head yaw and pitch move toward `lookAngles` exponentially, at rate 10/s.
  - The look's weight goes to 1 while input is fresh, and back to 0 after
    2 s without `lookAt`, over 0.4 s, blending to the animation's head pose.
  - Positive yaw turns the head toward +x of its parent; positive pitch
    (`rotation.x`) tilts it down.
- **Option/prop `lookAtPointer?: boolean | 'window' | 'canvas'`:**
  - `true` means `'window'`.
  - In window mode the NDC are computed against the canvas rect and may lie
    outside [-1, 1].
  - `distance` is the camera-to-head distance.

- [ ] **Step 1: Write tests:**
  - A target straight ahead gives yaw 0 and pitch 0.
  - A target to the player's left (+x) gives positive yaw.
  - A target above gives negative pitch.
  - A target behind is clamped to ±60° yaw, and a target far below to 40°
    pitch.
  - With the player turned π/2 about y (auto-rotate), a world target at +z
    still gives the correct yaw relative to the body.
  - With `upsideDown`, a target above the player in world terms gives
    positive pitch in head space, so it looks toward it.
  - Driver: after 2.5 s without `lookAt`, the head is back at the
    animation's pose.
  - `addPointerListener` registers with `{ passive: true }` (spy on
    `addEventListener`) and its cleanup removes it (Review Focus 2).
- [ ] **Step 2:** Implement and wire it into both viewers and
  `MinecraftPlayer`. Run `pnpm test`.
- [ ] **Step 3: Browser check:**
  - Moving the mouse to the far left of the page turns the head that way in
    both viewers.
  - Page scrolling with the mouse wheel over the canvas still scrolls a long
    page (Review Focus 2).
- [ ] **Step 4: Commit** `feat: head follows the pointer`.

### Task 7: 3D skin layers

**Files:**
- Create: `src/model/voxelLayer.ts`, `src/model/voxelLayer.test.ts`
- Modify: `src/model/PlayerObject.ts`, the three front ends, `playground/*`

**Interfaces:**
- Consumes: v1's `boxUV`, `partLayout`, `Pixels`.
- Produces:
  ```ts
  /** Outer layer of one part as pixel blocks, positioned like the part's outer mesh (relative to the pivot). */
  buildVoxelLayer(skin: Pixels, scale: number, part: PartName, model: ModelType): BufferGeometry
  // PlayerObject
  layers3d: boolean   // default false; true swaps each part's outer geometry for the voxel one
  ```
- **Geometry:**
  - Every outer-layer texel with alpha > 0 becomes a block. Its footprint is
    the texel's square on the inner box face, extruded outward by
    `2 × inflate`: 1 px on the head, 0.5 px elsewhere. On HD skins the
    footprint is 1/scale px.
  - The outer face is always emitted, the inner face never.
  - A side face is emitted only when the neighbouring texel on the same box
    face is transparent, or the texel sits on the face's edge.
  - Every face of a block uses the texel centre's UV.
- **Lifecycle:** PlayerObject keeps the last normalised skin pixels. It
  rebuilds when `layers3d` turns on, and on `applySkin` and model changes
  while it's on, disposing the old geometry. Turning it off restores the
  flat boxes.
- Option/prop `layers3d?: boolean` on all three front ends.

- [ ] **Step 1: Write tests:**
  - A single opaque texel at the hat front's top-left (40,8) gives 5 quads
    (10 triangles). Its bounds: x [−4,−3], y [7,8] relative to the head's
    box offset, and z [4,5].
  - Two horizontally adjacent texels give 8 quads: the shared side is
    culled.
  - A fully transparent outer layer gives an empty geometry.
  - HD scale 2 gives 0.5-px footprints.
  - A semi-transparent texel (alpha 128) still produces a block.
  - Review Focus 5: with `layers3d` on, a slim skin and then a classic one
    widen the voxel arm bounds from 3 to 4 px, and the old geometry's
    `dispose` is called.
  - Turning `layers3d` off restores the 9×9×9 flat hat.
- [ ] **Step 2:** Implement and run `pnpm test`.
- [ ] **Step 3: Browser check:** a Technoblade close-up with `layers3d`
  shows raised pixels on the crown and jacket. The skinview3d comparison is
  unchanged with the option off.
- [ ] **Step 4: Commit** `feat(model): 3D skin layers`.

### Task 8: Ground shadow

**Files:**
- Create: `src/model/shadow.ts`, `src/model/shadow.test.ts`
- Modify: the three front ends, `playground/*`

**Interfaces:**
- Produces:
  ```ts
  createShadow(): Mesh       // 16×16 px plane at y = 0.01, a radial-gradient DataTexture drawn in code, MeshBasicMaterial transparent, depthWrite false, opacity 0.35
  updateShadow(shadow: Mesh, player: PlayerObject): void  // x/z follow player.position; height h = max(0, player.position.y + lowest foot y); opacity 0.35·max(0, 1 − h/16); scale max(0.4, 1 − h/32)
  ```
- **Placement:** the shadow is a sibling of the player, so it doesn't turn
  with it. Option/prop `shadow?: boolean` on all three front ends. The
  front ends call `updateShadow` each frame after `driver.update`.

- [ ] **Step 1: Write tests:**
  - At rest, opacity 0.35, scale 1, centred under the player.
  - A player at y = 8 gives opacity 0.175 and scale 0.75.
  - At y ≥ 16, opacity 0.
  - The shadow follows `player.position.x/z`.
  - Turning the player doesn't turn the shadow.
  - The texture centre is darker than its edge, and the corners are fully
    transparent.
- [ ] **Step 2:** Implement, wire it in, run `pnpm test`, and commit
  `feat: ground shadow`.

### Task 9: Formatted name tags

**Files:**
- Create: `src/nametag/format.ts`, `src/nametag/format.test.ts`
- Modify: `src/nametag/NameTagObject.ts`, `src/index.ts`

**Interfaces:**
- Produces:
  ```ts
  const MC_COLORS: Record<string, string>  // '0'…'9','a'…'f' → the game's chat palette, below
  interface Segment { text: string; color: string | null; bold: boolean; italic: boolean; underline: boolean; strikethrough: boolean; obfuscated: boolean }
  parseFormatted(text: string): Segment[]  // § codes, case-insensitive; a colour code resets styles (as in the game); §r resets all; unknown codes are dropped; a trailing § stays literal
  hasFormatting(text: string): boolean
  // NameTagOptions addition
  formatting?: boolean   // default true
  ```
- **Palette:** 0 `#000000`, 1 `#0000AA`, 2 `#00AA00`, 3 `#00AAAA`,
  4 `#AA0000`, 5 `#AA00AA`, 6 `#FFAA00`, 7 `#AAAAAA`, 8 `#555555`,
  9 `#5555FF`, a `#55FF55`, b `#55FFFF`, c `#FF5555`, d `#FF55FF`,
  e `#FFFF55`, f `#FFFFFF`.
- **Rendering:** segments are measured and drawn one after another. Bold
  uses a bold font weight, italic an italic style; underline and
  strikethrough are 1/8-font-size lines.
- **Shadow:** only when `hasFormatting(text)`. It is the segment colour at
  0.25 brightness, offset fontSize/8 px right and down.
- **`§k`:** random printable glyphs, drawn once. Plain text renders exactly
  as v1 did.

- [ ] **Step 1: Write tests:**
  - `'§6[Admin] §rSteve'` gives 2 segments: `'[Admin] '` gold and `'Steve'`
    uncoloured.
  - `'§l§cHi'`: the colour code resets bold, so `'Hi'` is red and not bold.
  - `'§c§lHi'` is red and bold.
  - `'§zX'` gives `'X'` uncoloured.
  - `'a§'` keeps the trailing `'§'`.
  - Uppercase `'§C'` works.
  - `hasFormatting('Steve')` is false.
  - The palette has 16 entries and `c` is `#FF5555`.
- [ ] **Step 2:** Implement and run `pnpm test`.
- [ ] **Step 3: Browser check:** `§6[Admin] §cSteve` renders gold and red
  with a shadow, and plain `Steve` is unchanged.
- [ ] **Step 4: Commit** `feat(nametag): Minecraft formatting codes`.

### Task 10: Reduced motion

**Files:**
- Create: `src/interaction/motion.ts`, `src/interaction/motion.test.ts`
- Modify: the three front ends, `playground/*`

**Interfaces:**
- Produces:
  ```ts
  type ReducedMotionMode = 'system' | 'always' | 'never'
  isReduced(mode: ReducedMotionMode, systemPrefersReduced: boolean): boolean
  watchReducedMotion(mode: ReducedMotionMode, onChange: (reduced: boolean) => void): () => void  // matchMedia('(prefers-reduced-motion: reduce)') when present; calls onChange immediately; returns cleanup
  ```
- **Option/prop `reducedMotion?: ReducedMotionMode`, default `'system'`.**
  When reduced:
  - `driver.reducedMotion = true`
  - auto-rotate is suspended, without changing the `autoRotate` value
  - look-at stays on

- [ ] **Step 1: Write tests:**
  - The `isReduced` truth table.
  - `watchReducedMotion` with a stubbed `matchMedia` calls `onChange(true)`
    at once and again on a change event, and its cleanup removes the
    listener.
  - Without `matchMedia` (Node), `'system'` reports `false`.
- [ ] **Step 2:** Implement and wire it in. Browser check with emulated
  `reducedMotion: 'reduce'`: random actions hold still, auto-rotate stops,
  and a poke only flashes.
- [ ] **Step 3: Commit** `feat: respect reduced motion`.

### Task 11: Playground tour, docs and final checks

**Files:**
- Modify: `playground/*`, `README.md`, `CHANGELOG.md`

- [ ] **Step 1: The playground panel** gains every new option: transition,
  random, reactions, look-at mode, layers3d, shadow, reduced motion. Add a
  "Showcase" preset: a random skin, auto-rotate, `animation="random"`,
  reactions, look-at, layers3d and shadow.
- [ ] **Step 2: Browser:**
  - Re-run all v1 checks (faces 12/12, Review Focus 16/16, the five fixes,
    the minor-fix checks) and the skinview3d comparison. Expected:
    unchanged.
  - Take a showcase contact sheet with each feature on.
- [ ] **Step 3: README**, one section per feature:
  - `transition`
  - random actions (the pool, weights, durations, the drawn elytra)
  - reactions (the defaults, a custom set, `onPoke`)
  - `lookAtPointer`
  - `layers3d`
  - `shadow`
  - formatting codes
  - `reducedMotion`
  - add to the skinview3d table: "switching animations snaps" vs "blends
    (`transition`)"
- [ ] **Step 4: CHANGELOG** entry under 0.1.0. Run
  `pnpm test && pnpm typecheck && pnpm lint && pnpm build`, then commit
  `docs: playful additions`.
