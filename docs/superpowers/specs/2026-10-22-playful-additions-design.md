# blockskin: playful additions beyond skinview3d

Date: 2026-10-22. Status: draft for approval. Builds on
`2026-10-22-skin-viewer-design.md` (v1, implemented on `feat/v1`).

## Intent

v1 reached parity with skinview3d. This round adds things skinview3d doesn't
have, chosen for one picture the owner described: a page shows a player that
turns slowly, can be spun by dragging, does random things by itself every few
seconds (puts on an elytra and flies, runs, crouches and so on), and reacts
in a funny, recognisably Minecraft way when poked. Around that sit a few
cheap, visible upgrades: the head follows the cursor, 3D outer layers, a
shadow, coloured name tags, and respect for "reduce motion".

The first consumer will use it on a page that today shows a random skin from
a list, walking and auto-rotating. Switching that page over is a separate
change in that project, after publishing. It is not part of this round.

Everything ships in the first public release. Nothing is published yet, so
the version stays 0.1.0.

## Goals

1. **Smooth transitions.** Every switch from one animation to another blends
   over a short time instead of snapping. This includes switching to "no
   animation", which blends back to the rest pose. Both viewers and
   `MinecraftPlayer` do this.
2. **Random actions.** An animation that keeps choosing actions from a pool,
   runs each for a few seconds, never repeats the same one twice in a row,
   and blends between them. Actions that need equipment put it on and take it
   off again: flying wears an elytra.
3. **Poke reactions.** A click or tap on the player (not a drag) finds the
   body part that was hit and plays a reaction. Afterwards the previous
   animation carries on (random actions included).
4. **Head follows the pointer.** The head turns towards the mouse or the last
   touch, within natural limits, and hands control back to the animation
   when the pointer is idle.
5. **3D skin layers.** The outer layer can be built from small pixel blocks,
   as the "3D Skin Layers" mod draws it, instead of flat inflated boxes.
6. **Shadow.** A soft round shadow on the ground under the player, as mobs
   have in the game.
7. **Formatted name tags.** Minecraft's `§` formatting codes (colours, bold,
   italic, underline, strikethrough, reset) in name tags, with the game's
   colour values and the game's drop shadow behind the text.
8. **Reduced motion.** Respect the user's "reduce motion" system setting.

### Default reactions (the owner approved this set)

- **Any poke:** the game's hurt effect. The player flashes red and is
  knocked back a small step, away from the viewer, with a little hop.
- **By body part, on top of that:**
  - head: shakes "no"
  - arm: waves back with that arm
  - leg: a small jump
  - body: the hurt effect only
- **Many pokes:** 5 within 3 seconds and the player gets annoyed and
  crouch-spams for about 2 seconds (the classic Minecraft "hello"), then
  carries on.
- Every part's reaction can be replaced or switched off, and so can the
  whole feature. A callback reports each poke with the part that was hit.

## Non-goals

- Armour and held items. They come later and need textures the user
  supplies. Nothing in this round may make them harder: the model keeps
  named, addressable parts with stable pivots.
- A skin editor, physics-based capes, or multiplayer scenes.
- Changing v1's default look. The comparison with skinview3d that the owner
  approved must still hold with default options.

## Anti-goals

- Bundling Mojang assets. Flying needs an elytra texture even when the
  player has no cape, so blockskin draws **its own original elytra texture
  in code**: plain, recognisably an elytra shape, not a copy of the game's.
  A loaded cape texture still wins.
- A feature that is on by default and changes how v1 looks. All visual
  additions are opt-in. Two are on by default because they change no still
  frame: transitions, and respect for reduced motion.
- Reactions that fire when the user meant to drag. A drag to spin the player
  must never count as a poke.
- Swallowing page interaction. Pointer following must not stop the page from
  scrolling or capture events outside the canvas.

## Behaviour details

**Transitions.**
- On a switch, snapshot every joint's position and rotation, plus the
  player's own transform and the back equipment's pose.
- For the transition time, apply the new animation, then blend from the
  snapshot towards it: rotations by quaternion slerp, positions linearly,
  with ease-out.
- Default time 0.25 s; `0` snaps as in v1.
- A transition interrupted by another switch starts from the pose currently
  shown, never from rest.

**Random actions.**
- The default pool is idle, walk, run, crouch, wave and fly. Idle is the
  most likely; fly and wave are rarer.
- Each action lasts 3–6 s, chosen at random. Configurable: the pool, a
  weight per action, the duration range, and the random source (so tests
  can fix the sequence).
- Fly shows the elytra and restores whatever back equipment was showing
  before once the action ends.
- With no cape loaded, fly uses blockskin's drawn elytra texture.
- Named `"random"` wherever animations are named (React's
  `animation="random"`).

**Poke reactions.**
- A poke is a pointer down and up within 300 ms with under 6 px of movement.
- Hit-testing uses the inner and outer layer boxes (and the 3D layer when it
  is on), plus ears and back equipment. Ears count as head; a cape or elytra
  counts as body.
- A reaction temporarily takes over from the current animation, with
  transitions, and hands back when it ends. The underlying animation keeps
  its own progress, so random actions resume their schedule.
- The red flash tints the whole player for about 0.4 s, at roughly the
  strength of the game's hurt overlay. It is applied without changing
  materials shared with anything else.
- Knockback moves the player about 3 px away from the camera and 2 px up,
  then back, over about 0.4 s.
- Reactions work on the vanilla `SkinViewer`, on R3F `SkinViewer`, and on
  `MinecraftPlayer` inside the user's own canvas.

**Head follows the pointer.**
- Targets the pointer anywhere on the page by default, or only over the
  canvas as an option.
- Limits: about ±60° yaw and ±40° pitch relative to the body, with smoothing
  so the head never snaps.
- After about 2 s without pointer movement, control blends back to the
  animation.
- Works with upside-down and with auto-rotate: the head looks at the pointer
  in world terms, not in screen terms that ignore the player's turn.

**3D skin layers.**
- When on, each non-transparent outer-layer pixel becomes a small block
  standing out from the body, and faces hidden by a neighbouring block are
  left out.
- Blocks are about as thick as the flat layer's inflation: around 1 px on the
  head and 0.5 px elsewhere. The builder matches the mod's look.
- Semi-transparent pixels keep blending, and HD skins use proportionally
  smaller blocks.
- Rebuilt when the skin, the model type or the setting changes, and disposed
  with the player.
- Off by default.

**Shadow.**
- A round, soft-edged shadow on the ground plane, centred under the player,
  following it but not its rotation. It fades and shrinks as the player
  leaves the ground (jumps, flying), as the game's does.
- No real-time shadow maps.
- Off by default.

**Formatted name tags.**
- `§0`–`§9`, `§a`–`§f` set colours, `§l` bold, `§o` italic, `§n` underline,
  `§m` strikethrough, `§r` reset.
- `§k` (obfuscated) renders its characters as random glyphs that change over
  time. If that turns out costly, it may render once.
- Colours are the game's exact chat palette.
- The text gets the game's shadow: the same text in a darker shade, one
  pixel down and to the right.
- On by default. Names containing `§` are rare, and plain names look exactly
  as before. Can be switched off.

**Reduced motion.**
- Modes: `'system'` (the default: follow `prefers-reduced-motion`),
  `'always'` and `'never'`.
- Reduced means:
  - no auto-rotate
  - random actions and looping animations hold a still pose
  - reactions show only the red flash, no movement
  - the head still follows the pointer, smoothed
- The setting is re-checked when the system setting changes.

## Shape

The core (framework-free) gets the logic; the viewers and React components
expose it:

- **The core holds everything:**
  - the transition blending
  - the random-action animation
  - the reaction set and poke detection (as plain functions over pointer
    events plus a raycast)
  - pointer-follow maths
  - the 3D-layer geometry builder
  - the shadow
  - the formatting-code parser and renderer
  - the drawn elytra texture
- **The two `SkinViewer`s and `MinecraftPlayer`** get options and props for
  each feature, named the same way across all three:
  - `transition`
  - `"random"` / `RandomActions`
  - `reactions` and `onPoke`
  - `lookAtPointer`
  - `layers3d`
  - `shadow`
  - `reducedMotion`
- **Name formatting** is a `NameTagOptions` setting.
- **Everything testable stays testable in Node**, in the v1 way:
  - pure functions for poke detection, pointer-follow angles, blending, the
    formatting parser, the voxel geometry from pixels, and the action
    scheduling with an injected random source
  - browser checks for the visual parts

## Constraints

Everything in the v1 design still applies: peer dependencies, no global
three state, no Mojang assets, the MIT licence, no first-consumer names in
the repo, MistralWolf commits, and no remote or publish until the owner says
so.

## Decided

- All of goals 1–8, and the default reaction set above (owner).
- Armour and items later (owner).

## My calls (the owner can veto)

- Everything new is off until switched on: random actions, reactions,
  pointer following, 3D layers and the shadow. Three things are on by
  default because they change nothing in v1's still frames: transitions,
  reduced-motion respect, and name formatting. A page like the first
  consumer's turns the rest on explicitly.
- Flying without a cape uses an original elytra texture drawn by blockskin.
- The default pool, durations and weights as listed.
- Pointer following targets the whole page by default.
- It all ships as part of 0.1.0.

## Left to the builder

- How poses are snapshotted and blended internally, and how reactions layer
  over the base animation, within the behaviour above.
- The voxel builder's corner handling and face culling, as long as the
  result looks like the mod's and stays responsive for 64×64 and 128×128
  skins.
- The shadow's drawing method, and the exact easing curves and reaction
  timings, within the approximate values given.
- The drawn elytra's exact look.
