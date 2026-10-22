# blockskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Minecraft skin viewer with full skinview3d 3.4.2 parity that runs on the host app's own three.js. It ships as a framework-free core plus React Three Fiber components.

**Architecture:**
- **Pure logic, testable in Node with no DOM:** skin, cape and ear normalisation over plain RGBA pixel buffers; UV tables; camera framing; name-tag layout.
- **The three.js model:** a `PlayerObject` group built from `BoxGeometry` with `DataTexture` maps, so it also builds and animates in Node. Animations mutate it directly, as in skinview3d.
- **Two viewers on top:** a vanilla `SkinViewer` class, and an R3F `<SkinViewer>` that wraps `<MinecraftPlayer>`.

**Tech Stack:** TypeScript ~6.0, three ≥0.186, @react-three/fiber 9, React 19, vitest 5 (node environment), Vite 8 (playground only), pnpm, eslint with typescript-eslint, prettier.

**Spec:** `docs/superpowers/specs/2026-10-22-skin-viewer-design.md`

## Global Constraints

- Package `@afterhours-systems/blockskin`, MIT, ESM only, `"sideEffects": false`, entry points `.` and `./react`.
- Peer dependencies: `three` `>=0.186.0` (never `^0.186`: on 0.x a caret range stops at 0.187), plus `react` `^19.0.0` and `@react-three/fiber` `^9.0.0`. The last two are listed in `peerDependenciesMeta` as optional.
- Import only from `three` and `three/addons/...`. Never `three/src/...`, and no drei.
- Never write global three state: `ColorManagement`, `Cache`, `DefaultLoadingManager`, prototypes.
- No Mojang assets in the repo. Fixtures are generated in code, and real skins are fetched at runtime only.
- No first-consumer names anywhere. The local pre-commit hook from `HANDOFF.md` enforces this.
- Commits are authored by `MistralWolf <mistralwolf@proton.me>` (already in local config) and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Code style: single quotes, no semicolons, 2-space indent, and comments that explain why (enforced by prettier).
- Model space: 1 unit = 1 skin pixel, +y up, the player faces +z, the player's right side is at −x, feet at y = 0, top of the head at y = 32.
- No remote, no `git push`, no `npm publish` in this plan.

## Review Focus

1. **Overlapping loads:** changing the skin twice in quick succession must show the newer skin, even if the older request resolves last (Task 5, `latest-wins`).
2. **Failed loads:** a 404, a CORS error, or an image that isn't a valid skin size rejects with a clear error and keeps the previous skin on screen; it never throws during render (Tasks 3 and 9).
3. **React StrictMode:** the double mount/unmount must not leave a disposed `PlayerObject` on screen, or two of them (Task 10).
4. **Transparent background:** with antialiasing on, the default background stays fully transparent, so the corner pixel of a screenshot has alpha 0 (Task 12).
5. **Outer-layer artefacts:** where an arm's outer layer touches the body's, there must be no z-fighting or flicker, and the hat must not hide the face through its own transparent pixels (Task 12).

---

### Task 1: Package scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc`, `.gitignore`, `LICENSE`, `src/index.ts`, `src/react/index.ts`, `src/guards.test.ts`
- Local only: `.git/hooks/pre-commit` (copy the script from `HANDOFF.md`, `chmod +x`)

**Interfaces:**
- Produces: `pnpm test` (`vitest run`), `pnpm build` (`tsc -p tsconfig.build.json` into `dist/`), `pnpm lint`, `pnpm typecheck`. Every later task's tests run through `pnpm test`.

- [ ] **Step 1:** Write `package.json`:
  - `name` `@afterhours-systems/blockskin`, `version` `0.0.0`, `type` `module`, `license` `MIT`, `files` `["dist"]`.
  - `exports`:
    ```json
    {
      ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
      "./react": { "types": "./dist/react/index.d.ts", "import": "./dist/react/index.js" }
    }
    ```
  - Peers as in Global Constraints.
  - Dev dependencies: `three@~0.186.1`, `@types/three@~0.186.0`, `react@^19.3.1`, `react-dom@^19.3.1`, `@types/react`, `@types/react-dom`, `@react-three/fiber@^9.8.2`, `typescript@~6.0.3`, `vitest@^5.0.5`, `vite@^8.3.5`, `@vitejs/plugin-react`, `eslint`, `typescript-eslint`, `prettier`.
  - Then `pnpm install`. It's safe here: this folder has no workspace above it.
- [ ] **Step 2:** Configure the build and tests:
  - `tsconfig.json`: `strict`, `module`/`moduleResolution` `nodenext`, `jsx` `react-jsx`, `verbatimModuleSyntax`, `noEmit`, `include` `src`, `playground`, `vitest.config.ts`.
  - `tsconfig.build.json` extends it with `noEmit` false, `declaration`, `outDir` `dist`, `rootDir` `src`, and excludes `**/*.test.ts`.
  - Relative imports use `.js` extensions.
  - `vitest.config.ts`: `include: ['src/**/*.test.ts']`, `environment: 'node'`.
- [ ] **Step 3: Write the guard test** `src/guards.test.ts`. It reads every `src/**/*.ts(x)` file except itself and asserts:
  - no `from 'three/src`
  - no `ColorManagement.` and no `Cache.enabled`
  - no `@react-three/drei`
  - no `import` of `react` or `@react-three/fiber` outside `src/react/`
- [ ] **Step 4:** Make `src/index.ts` and `src/react/index.ts` placeholder modules. Run `pnpm test && pnpm typecheck && pnpm lint && pnpm build`. Expected: everything passes and `dist/index.js` exists.
- [ ] **Step 5:** Install the pre-commit hook. Check it: stage a scratch file containing one of the hook's words, run `git commit --dry-run`, and expect a refusal. Then unstage the file.
- [ ] **Step 6: Commit** `chore: scaffold package, tooling and source guards`.

### Task 2: Pixel buffers

**Files:**
- Create: `src/format/pixels.ts`, `src/format/pixels.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface Pixels { width: number; height: number; data: Uint8ClampedArray } // RGBA, row 0 = top
  createPixels(width: number, height: number): Pixels                         // all transparent
  getPixel(p: Pixels, x: number, y: number): [number, number, number, number]
  setPixel(p: Pixels, x: number, y: number, rgba: readonly [number, number, number, number]): void
  copyRect(src: Pixels, sx, sy, w, h, dst: Pixels, dx, dy, opts?: { flipX?: boolean }): void
  clearRect(p: Pixels, x, y, w, h): void
  hasTransparency(p: Pixels, x, y, w, h): boolean   // any alpha < 255
  isUniform(p: Pixels, x, y, w, h, rgba): boolean   // every pixel equals rgba
  ```
  All coordinates are in pixels of `p` (callers multiply by the HD scale).

- [ ] **Step 1: Write tests:**
  - `copyRect with flipX mirrors columns`: copying a 4×1 strip `[A,B,C,D]` gives `[D,C,B,A]`.
  - `clearRect zeroes RGBA`.
  - `hasTransparency is false on a fully opaque area and true with one alpha-254 pixel`.
  - `isUniform detects all-black and rejects one off pixel`.
  - Out-of-range coordinates throw a `RangeError`.
- [ ] **Step 2:** Implement and run `pnpm test`. Expected: PASS.
- [ ] **Step 3: Commit** `feat(format): RGBA pixel buffer helpers`.

### Task 3: Skin normalisation and model detection

**Files:**
- Create: `src/format/skin.ts`, `src/format/skin.test.ts`, `src/format/errors.ts`, `src/format/testPixels.ts` (fixture builders, test-only, not exported)

**Interfaces:**
- Consumes: Task 2.
- Produces:
  ```ts
  class TextureFormatError extends Error { kind: 'skin' | 'cape' | 'ears'; width: number; height: number }
  type ModelType = 'classic' | 'slim'
  interface NormalizedSkin { pixels: Pixels; scale: number; legacy: boolean } // pixels is 64s×64s
  normalizeSkin(src: Pixels): NormalizedSkin
  detectModel(skin: Pixels): ModelType // expects a normalised 64s×64s skin
  ```

Rules. All coordinates are in 64-px units, multiplied by `scale = width / 64`:
- **Valid sizes:** width = height, or width = 2 × height. The width must be a positive multiple of 64. Anything else throws `TextureFormatError` with `kind: 'skin'`.
- **Legacy (w = 2h):** copy the image into the top half of a square buffer. Then fill the left limbs by mirroring the right ones, each copy with `flipX`, as (source x, y, w, h) → (target x, y):
  - legs: (4,16,4,4)→(20,48), (8,16,4,4)→(24,48), (0,20,4,12)→(24,52), (4,20,4,12)→(20,52), (8,20,4,12)→(16,52), (12,20,4,12)→(28,52)
  - arms: (44,16,4,4)→(36,48), (48,16,4,4)→(40,48), (40,20,4,12)→(40,52), (44,20,4,12)→(36,52), (48,20,4,12)→(32,52), (52,20,4,12)→(44,52)

  These match Mojang's legacy conversion: outer side to outer side, inner side to inner side.
- **Opaque-background fix** (matches skinview3d behaviour that users know):
  - Legacy: if the original 64×32 image has no transparent pixel, clear the hat rectangle (32,0,32,16).
  - 64×64: if the whole image has no transparent pixel, clear every outer-layer rectangle: (32,0,32,16), (0,32,64,16), (0,48,16,16), (48,48,16,16).
- **`detectModel`:** check the four slim-unused areas (50,16,2,4), (54,20,2,12), (42,48,2,4) and (46,52,2,12).
  - It's `slim` if any of them has transparency.
  - It's also `slim` if all four are uniformly opaque black, or all four are uniformly opaque white.
  - Otherwise `classic`.
  - Legacy skins always count as `classic` (the caller enforces that, Task 9).

- [ ] **Step 1: Write fixture builders** in `testPixels.ts`: `opaqueSkin(size, rgba)`, `transparentSkin(size)`, `paint(p, x, y, w, h, rgba)`.
- [ ] **Step 2: Write tests:**
  - `rejects 64×48, 65×65, 0×0 and 32×32 with TextureFormatError kind skin`
  - `accepts 64×64, 128×128, 512×512, 64×32, 128×64 with scale 1, 2, 8, 1, 2`
  - `legacy right-leg front pixel lands mirrored on the left-leg front`: paint (4,20) red in a 64×32 skin and expect (23,52) red. Repeat at scale 2: (8,40) → (47,104).
  - `legacy right-arm outer column maps to left-arm outer column`: (40,20) → (43,52).
  - `legacy fully-opaque skin gets its hat cleared but keeps the head`
  - `64×64 fully-opaque skin loses all outer layers, inner layers untouched`
  - `64×64 skin with one transparent pixel keeps its outer layers`
  - `detectModel: transparent (54,20) → slim; all four areas black → slim; all four white → slim; one area black and the others skin-coloured → classic; HD 128 slim detected`
- [ ] **Step 3:** Implement and run `pnpm test`. Expected: PASS.
- [ ] **Step 4: Commit** `feat(format): skin normalisation, legacy conversion, slim detection`.

### Task 4: Cape and ear normalisation

**Files:**
- Create: `src/format/cape.ts`, `src/format/ears.ts`, `src/format/cape.test.ts`, `src/format/ears.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 3 (`TextureFormatError`).
- Produces:
  ```ts
  normalizeCape(src: Pixels): { pixels: Pixels; scale: number } // pixels is 64s×32s, src copied to the top-left corner
  normalizeEars(src: Pixels): { pixels: Pixels; scale: number } // standalone 14s×7s
  earsFromSkin(skin: Pixels): { pixels: Pixels; scale: number } // the (24,0,14,7)·s region of a 64s×64s or 64s×32s skin
  ```
- **Cape sizes:**
  - 64×32 (w = 2h): s = w/64
  - 22×17 (17w = 22h): s = w/22
  - 46×22 (11w = 23h, OptiFine with the elytra region): s = w/46
  - Anything else throws with `kind: 'cape'`.
- **Ear sizes:** w = 2h and h a multiple of 7, giving s = h/7. Anything else throws with `kind: 'ears'`.

- [ ] **Step 1: Write tests:**
  - Each cape format and its HD double normalises to a 64s×32s buffer, with the source's (0,0) pixel at (0,0).
  - 22×17 at 44×34 gives scale 2 and a 128×64 buffer.
  - 50×30 is rejected.
  - Ears 14×7 and 28×14 are accepted, 14×8 is rejected.
  - `earsFromSkin` of a 128×128 skin copies (48,0,28,14).
- [ ] **Step 2:** Implement, run `pnpm test`, and commit `feat(format): cape and ear normalisation`.

### Task 5: Image input, textures and latest-wins loading

**Files:**
- Create: `src/textures/input.ts`, `src/textures/texture.ts`, `src/textures/sequence.ts`, `src/textures/texture.test.ts`, `src/textures/sequence.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type TextureSource = HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap | HTMLVideoElement
  type RemoteImage = string | URL | { src: string | URL; crossOrigin?: '' | 'anonymous' | 'use-credentials'; referrerPolicy?: ReferrerPolicy }
  type ImageInput = RemoteImage | TextureSource
  isTextureSource(value: unknown): value is TextureSource   // checks globalThis constructors exist before instanceof, so it is safe in Node
  readPixels(input: ImageInput, signal?: AbortSignal): Promise<Pixels> // loads a URL with crossOrigin 'anonymous' by default, draws to a 2D canvas, getImageData
  createPixelTexture(pixels: Pixels): DataTexture
  createLatestWins(): <T>(task: (signal: AbortSignal) => Promise<T>) => Promise<{ stale: boolean; value?: T }>
  ```
- **`createPixelTexture`:** `DataTexture` from a row-reversed copy of `pixels`, so image row 0 maps to v = 1 and the UVs in Task 6 can use `v = 1 − y/H`. Settings:
  - `flipY` false
  - `magFilter` and `minFilter` `NearestFilter`
  - `generateMipmaps` false
  - `colorSpace` `SRGBColorSpace`
  - `needsUpdate` true
- **`createLatestWins`:** each call aborts the previous signal. A result from a superseded call comes back `{ stale: true }`, and its rejection is swallowed.

- [ ] **Step 1: Write tests:**
  - `createPixelTexture stores row 0 last and keeps sRGB/nearest/no-mipmaps`.
  - `latest-wins: first task resolves after the second → first is stale, second is not`.
  - `latest-wins: earlier call's signal is aborted when a new call starts`.
  - `latest-wins: rejection of a stale task does not surface`.
  - `isTextureSource is false for strings and plain objects in Node`.
- [ ] **Step 2:** Implement. `readPixels` is DOM-only and has no unit test; Task 12 covers it in the browser. Run `pnpm test`.
- [ ] **Step 3: Commit** `feat(textures): image input, pixel textures, latest-wins loads`.

### Task 6: Box UVs

**Files:**
- Create: `src/model/uv.ts`, `src/model/uv.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type Face = 'top' | 'bottom' | 'right' | 'front' | 'left' | 'back'
  interface Rect { x: number; y: number; w: number; h: number }
  boxUV(u: number, v: number, w: number, h: number, d: number): Record<Face, Rect>
  applyBoxUV(geometry: BoxGeometry, rects: Record<Face, Rect>, texWidth: number, texHeight: number): void // in 64-px units, texWidth 64, texHeight 64 or 32
  ```

The rectangles, with `right` meaning the player's right (the −x face):
- top (u+d, v, w, d)
- bottom (u+d+w, v, w, d)
- right (u, v+d, d, h)
- front (u+d, v+d, w, h)
- left (u+d+w, v+d, d, h)
- back (u+2d+w, v+d, w, h)

Each face's image top-left corner `(x/W, 1 − y/H)` must land on this box corner:

| face | three group | top-left corner at |
|---|---|---|
| left | px (0) | (+x, +y, +z) |
| right | nx (1) | (−x, +y, −z) |
| top | py (2) | (−x, +y, −z) |
| bottom | ny (3) | (−x, −y, −z) |
| front | pz (4) | (−x, +y, +z) |
| back | nz (5) | (+x, +y, −z) |

Every face's top-right corner is the corner one image-width further along. The test pins that too.

- [ ] **Step 1: Write tests:**
  - `boxUV(0,0,8,8,8)` (the head) gives top (8,0,8,8), bottom (16,0,8,8), right (0,8,8,8), front (8,8,8,8), left (16,8,8,8), back (24,8,8,8).
  - For a head box with applied UVs: for every face, the vertex at the table's corner has uv `(rect.x/64, 1 − rect.y/64)`, and the vertex across the face's width has uv `((rect.x + rect.w)/64, 1 − rect.y/64)`.
- [ ] **Step 2:** Implement, run `pnpm test`, and commit `feat(model): box UV layout`.

### Task 7: Player model

**Files:**
- Create: `src/model/layout.ts`, `src/model/materials.ts`, `src/model/PlayerObject.ts`, `src/model/PlayerObject.test.ts`
- Modify: `src/index.ts` (export the model API)

**Interfaces:**
- Consumes: Tasks 3–6.
- Produces:
  ```ts
  type PartName = 'head' | 'body' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg'
  type BackEquipment = 'cape' | 'elytra'
  class BodyPart extends Group { readonly inner: Mesh; readonly outer: Mesh }      // the group origin is the joint pivot
  class SkinObject extends Group { head; body; rightArm; leftArm; rightLeg; leftLeg: BodyPart
    modelType: ModelType; map: Texture | null
    setInnerLayerVisible(v: boolean): void; setOuterLayerVisible(v: boolean): void }
  class CapeObject extends Group { readonly mesh: Mesh }                          // pivot at the top edge
  class ElytraObject extends Group { readonly leftWing: Group; readonly rightWing: Group; updateRightWing(): void } // mirrors the left wing
  class EarsObject extends Group { readonly rightEar: Mesh; readonly leftEar: Mesh }
  class PlayerObject extends Group {
    readonly skin: SkinObject; readonly cape: CapeObject; readonly elytra: ElytraObject; readonly ears: EarsObject
    backEquipment: BackEquipment | null; upsideDown: boolean
    applySkin(pixels: Pixels | null, opts?: { model?: ModelType | 'auto-detect'; ears?: boolean | 'load-only' }): ModelType | null
    applyCape(pixels: Pixels | null, opts?: { backEquipment?: BackEquipment; makeVisible?: boolean }): void
    applyEars(pixels: Pixels | null, opts?: { textureType?: 'standalone' | 'skin'; makeVisible?: boolean }): void
    resetPose(): void                // restores every joint, plus this group's own position and rotation, to the rest pose
    headTop(target: Vector3): Vector3 // the head top in this.parent's space; the name tag uses it
    dispose(): void
  }
  ```
- **Structure:** `PlayerObject` > `flip` group (upside-down) > skin, cape, elytra and ears. Animations may move `PlayerObject` itself; `upsideDown` touches only `flip`, which rotates π about z around y = 16.

`layout.ts` holds the rest layout as data. All values are pivot positions in model space; box offsets are relative to the pivot:

| part | pivot | inner box (w×h×d) / top of box relative to pivot | UV inner / outer | outer inflation |
|---|---|---|---|---|
| head | (0,24,0) | 8×8×8, spans y 0..8 | (0,0) / (32,0) | +0.5 per side |
| body | (0,24,0) | 8×12×4, spans y −12..0 | (16,16) / (16,32) | +0.25 |
| rightArm classic | (−5,22,0) | 4×12×4, x −3..1, y −10..2 | (40,16) / (40,32) | +0.25 |
| rightArm slim | (−5,21.5,0) | 3×12×4, x −2..1, y −10..2 | same | +0.25 |
| leftArm | mirror of the right in x | same sizes | (32,48) / (48,48) | +0.25 |
| rightLeg | (−1.9,12,0) | 4×12×4, x −2..2, y −12..0 | (0,16) / (0,32) | +0.25 |
| leftLeg | (1.9,12,0) | same | (16,48) / (0,48) | +0.25 |
| cape | (0,24,−2) | 10×16×1 hanging down, behind the pivot; rest rotation.x 6° so the hem is behind the back; front UV faces −z | (0,0) on 64×32 | – |
| elytra wings | (±5,24,−2) | 10×20×2, inflation +1 | (22,0) on 64×32 | – |
| ears | centres (±6,34,+2/3) | 6×6×1 scaled 4/3 | (24,0) on 14×7 | – |

- Slim arms are 0.5 px lower, as in the game.
- Elytra rest pose: left wing rotation x 15°, z −15° (π/12), right wing mirrored.

**Materials** (`materials.ts`), all `MeshStandardMaterial`:
- inner: `FrontSide`, not transparent
- outer: `DoubleSide`, `transparent: true`, `alphaTest: 1e-5`, `depthWrite: true`. Semi-transparent outer pixels blend, as the game has done since 15w47a.
- limb outer layers: also `polygonOffset` (factor 1, units 1), so they don't z-fight with the body's outer layer
- cape and elytra: `DoubleSide`, alpha-tested
- Every `PlayerObject` owns its own materials and textures. `applySkin` with a new texture disposes the old one.

**`applySkin`:**
1. `normalizeSkin`.
2. Pick the model: an explicit `model`, otherwise `detectModel` (forced to `classic` for legacy).
3. Rebuild the arm geometry if the model changed.
4. `createPixelTexture`, assign the map.
5. `skin.visible = true`.
6. For `ears: true` or `'load-only'`, call `applyEars(earsFromSkin(...))`; `'load-only'` leaves the ears hidden.
7. Return the model type. `null` clears and hides the skin.

**`applyCape`:** sets the cape and elytra maps and shows `backEquipment` (default `'cape'`) unless `makeVisible` is false.

**`applyEars`:** shows the ears unless `makeVisible` is false.

- [ ] **Step 1: Write tests.** All of them build `new PlayerObject()` in Node, with generated pixels.
  - Rest geometry: feet at y = 0 and the head top at y = 32, checked from a `Box3` of the skin with outer layers hidden. The outer head is 9×9×9 and the outer body 8.5×12.5×4.5.
  - `applySkin` of a slim fixture returns `'slim'`, and `rightArm.inner` is 3 wide. Applying a classic fixture afterwards makes it 4 wide.
  - An explicit `model: 'classic'` overrides detection. A legacy skin is always classic.
  - `applySkin` replaces and disposes the previous texture (spy on `dispose`).
  - `backEquipment = 'elytra'` shows the elytra and hides the cape; `null` hides both.
  - `upsideDown = true` puts the head below the feet (Box3 of the head in `PlayerObject` space has max y < 16), but the overall `Box3` keeps the same height.
  - `resetPose` restores a moved arm, a rotated body and a moved `PlayerObject`.
  - `headTop` returns y ≈ 32.5 at rest, accounting for the hat.
  - `dispose` disposes every geometry, material and texture.
- [ ] **Step 2:** Implement and run `pnpm test`. Expected: PASS.
- [ ] **Step 3: Commit** `feat(model): player object with layers, cape, elytra, ears, upside-down`.

### Task 8: Animations

**Files:**
- Create: `src/animation/PlayerAnimation.ts`, `src/animation/locomotion.ts` (Idle, Walking, Running, Flying, Swim), `src/animation/actions.ts` (Wave, Crouch, Hit), `src/animation/index.ts`, `src/animation/testProbe.ts` (helpers that read world positions, test-only), and one `*.test.ts` per source file
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: Task 7 (`PlayerObject`, joints, `resetPose`).
- Produces:
  ```ts
  type AnimationFn = (player: PlayerObject, progress: number, delta: number) => void
  abstract class PlayerAnimation { speed = 1; paused = false; progress = 0
    update(player: PlayerObject, deltaSeconds: number): void          // no-op when paused; delta = deltaSeconds·speed
    protected abstract animate(player: PlayerObject, delta: number): void
    addAnimation(fn: (player: PlayerObject, progress: number, id: number) => void): number // progress counts from 0 at add time
    removeAnimation(id: number | undefined): void }
  class FunctionAnimation extends PlayerAnimation { constructor(fn: AnimationFn) }
  class IdleAnimation, WalkingAnimation, RunningAnimation, FlyingAnimation, SwimAnimation, HitAnimation extends PlayerAnimation
  class WaveAnimation extends PlayerAnimation { constructor(opts?: { arm?: 'left' | 'right' }) }  // default right
  class CrouchAnimation extends PlayerAnimation { runOnce = false; showProgress = false; addHitAnimation(speed?: number): void }
  type AnimationName = 'idle' | 'walk' | 'run' | 'fly' | 'swim' | 'wave' | 'crouch' | 'hit'
  createAnimation(name: AnimationName): PlayerAnimation
  ```
- **Curves:** match the look of skinview3d and the game, not skinview3d's constants. The game's limb swing (arms and opposite legs in counter-phase, legs about 1.4× the arm amplitude) and the game's crouch offsets are fine to use. Crouch at full depth:
  - body tilts forward by 0.5 rad around the neck
  - arms rotate a further 0.4 rad forward
  - head lowers by 4.2 px, body by 3.2 px, arms by 3.2 px
  - legs sit 4 px behind and 0.2 px lower
  - elytra wings spread
- **Every cyclic animation exports its period** in progress units: `WALK_PERIOD`, `RUN_PERIOD`, `SWIM_PERIOD`, `HIT_PERIOD`, `CROUCH_PERIOD`.

- [ ] **Step 1: Write tests.** They use `testProbe.ts`: `hand(player, side)`, `foot(player, side)` and `bodyBottom(player)` return world positions of the limb ends.
  - Base class: `paused` stops progress. `speed = 2` doubles it. `addAnimation` receives progress from 0, and `removeAnimation` stops calls.
  - Walk: a quarter-period in, one foot is in front of its hip (z > 0.5) while the other is behind. The hand on the same side as the forward foot is behind. The pose repeats after `WALK_PERIOD`. No limb rotates more than 0.9 rad.
  - Run: peak leg angle and cape lift are larger than walk's, and its period is shorter.
  - Idle: arms sway on z by at most 0.1 rad and never cross into the body (right hand x < −4).
  - Crouch with `showProgress` false: the pose is either fully standing or fully crouched. At full crouch, `bodyBottom.z < 0` and the head pivot is 4.2 below rest. With `runOnce`, it stays crouched after the first transition.
  - Wave: the chosen hand stays above its shoulder; the other arm stays at rest.
  - Hit: the right hand reaches z > 3 and comes back to rest within one period.
  - Fly: the head-to-feet axis is more than 60° from vertical, and the wings are spread further than rest.
  - Swim: the body is near horizontal and the arms complete a loop each period.
  - `createAnimation` maps every `AnimationName`.
- [ ] **Step 2:** Implement and run `pnpm test`. Expected: PASS.
- [ ] **Step 3: Commit** `feat(animation): idle, walk, run, fly, swim, wave, crouch, hit, custom`.

### Task 9: Name tag, framing and the vanilla `SkinViewer`

**Files:**
- Create: `src/nametag/layout.ts`, `src/nametag/NameTagObject.ts`, `src/nametag/layout.test.ts`, `src/viewer/framing.ts`, `src/viewer/framing.test.ts`, `src/viewer/SkinViewer.ts`, `src/viewer/loadInto.ts`, `src/viewer/loadInto.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: Tasks 5, 7 and 8.
- Produces:
  ```ts
  interface NameTagOptions { font?: string; repaintAfterLoaded?: boolean; margin?: [number, number, number, number]
    textStyle?: string | CanvasGradient | CanvasPattern; backgroundStyle?: string | CanvasGradient | CanvasPattern; height?: number }
  class NameTagObject extends Sprite { constructor(text?: string, options?: NameTagOptions); readonly text: string; readonly painted: Promise<void> }
  nameTagLayout(textWidth: number, fontHeight: number, margin: [number, number, number, number], height: number): { canvasWidth: number; canvasHeight: number; spriteWidth: number; spriteHeight: number }
  NAME_TAG_GAP = 4.3; EARS_EXTRA = 5   // tag centre = headTop + gap (+ extra when the ears are visible)
  cameraDistance(fovDegrees: number, zoom: number): number
  // loadInto: shared by both viewers, so the error/stale handling is written once
  loadSkinInto(player: PlayerObject, input: ImageInput | null, opts?: Parameters<PlayerObject['applySkin']>[1],
    signal?: AbortSignal, read = readPixels): Promise<ModelType | null>
  loadCapeInto(player, input, opts?: Parameters<PlayerObject['applyCape']>[1], signal?, read = readPixels): Promise<void>
  loadEarsInto(player, input, opts?: Parameters<PlayerObject['applyEars']>[1], signal?, read = readPixels): Promise<void>
  ```
- **Name tag defaults:** font `'48px Minecraft'`, `repaintAfterLoaded` true, margin `[5,10,5,10]`, text style `'white'`, background `'rgba(0,0,0,.25)'`, height 4. The Minecraft font is **not** shipped, because its licence is unclear; the README says how to supply one.
- **`cameraDistance`:** `4.5 + 16.5 / tan(fov/2) / zoom`, clamped to [10, 256]. This puts the head top on the canvas edge at zoom 1: the half-height is 16.5 including the hat, measured at the front of the head, 4.5 in front of the centre.
- **`SkinViewerOptions`** is skinview3d's option set: `canvas`, `width`, `height`, `pixelRatio` (`number | 'match-device'`, default `'match-device'`), `skin`, `model` (`ModelType | 'auto-detect'`), `cape`, `ears` (`'current-skin' | { textureType: 'standalone' | 'skin'; source: ImageInput }`), `preserveDrawingBuffer`, `renderPaused`, `background` (`ColorRepresentation | Texture | null`, default transparent), `panorama`, `fov` (default 50), `zoom` (default 0.9), `enableControls` (default true), `animation`, `nameTag`. It adds `antialias` (default true, renderer MSAA, no composer) and `upsideDown`.
- **`SkinViewer` members:**
  - read-only: `canvas`, `scene`, `camera`, `renderer`, `controls` (`OrbitControls` from `three/addons/controls/OrbitControls.js`: pan off, distance 10–256), `playerObject`, `playerWrapper` (centres the player at y −16), `globalLight` (`AmbientLight` 0xffffff 3), `cameraLight` (`PointLight` 0xffffff 0.6, a child of the camera)
  - read/write: `autoRotate`, `autoRotateSpeed` (rad/s, default 1, pauses between the controls' `start` and `end` events), `animation`, `nameTag` (`NameTagObject | string | null`), `background`, `fov`, `zoom`, `width`, `height`, `pixelRatio`, `renderPaused`, `disposed`
  - methods: `loadSkin`, `loadCape`, `loadEars`, `loadBackground(input, mapping?)`, `loadPanorama(input)` (equirectangular), `resetSkin`, `resetCape`, `resetEars`, `setSize`, `render`, `adjustCameraDistance`, `resetCameraPose`, `toDataURL(type?, quality?): string` (renders, then reads synchronously), `screenshot(type?, quality?): Promise<Blob>`, `dispose`
  - Load methods always return a Promise.
- **Behaviour:**
  - The light values match skinview3d's, so the look matches under colour management.
  - The viewer handles WebGL context loss and restore.
  - Switching animation calls `resetPose`.
  - After each animation update, the name tag follows `headTop`.
- [ ] **Step 1: Write tests:**
  - `cameraDistance(50, 1) ≈ 39.885` (±0.01), `cameraDistance(50, 0.01) === 256`, `cameraDistance(120, 100) === 10`.
  - `nameTagLayout` adds the margins to the canvas size and keeps the sprite aspect equal to the canvas aspect at the given height.
  - `loadSkinInto` with a reader that rejects leaves the previous map and visibility untouched and rethrows the error.
  - `loadSkinInto` with a `TextureFormatError` rethrows it, with the previous skin kept.
  - Two overlapping `loadSkinInto` calls through `createLatestWins` apply only the second. Inject a fake `read` with controllable timing.
- [ ] **Step 2:** Implement and run `pnpm test`. Expected: PASS. `SkinViewer.ts` itself is DOM/WebGL and is exercised in Task 12.
- [ ] **Step 3: Commit** `feat(viewer): name tag, camera framing and SkinViewer`.

### Task 10: `<MinecraftPlayer>` for R3F

**Files:**
- Create: `src/react/MinecraftPlayer.tsx`, `src/react/props.ts`, `src/react/props.test.ts`
- Modify: `src/react/index.ts`

**Interfaces:**
- Consumes: Tasks 7–9 (`PlayerObject`, `createAnimation`, `FunctionAnimation`, `loadSkinInto`/`loadCapeInto`/`loadEarsInto`, `createLatestWins`, `NameTagObject`, `NAME_TAG_GAP`).
- Produces:
  ```ts
  type LayerVisibility = Partial<Record<PartName, { inner?: boolean; outer?: boolean }>>
  interface MinecraftPlayerProps extends Omit<ThreeElements['group'], 'children'> {
    skin: ImageInput | null; model?: ModelType | 'auto-detect'
    cape?: ImageInput | null; backEquipment?: BackEquipment
    ears?: boolean | { textureType: 'standalone' | 'skin'; source: ImageInput }   // true = ears drawn on the skin
    layers?: LayerVisibility; nameTag?: string | NameTagObject | null
    animation?: AnimationName | PlayerAnimation | AnimationFn | null; animationSpeed?: number; paused?: boolean
    upsideDown?: boolean; onLoad?: (model: ModelType) => void; onError?: (error: unknown) => void
    ref?: Ref<PlayerObject> }
  function MinecraftPlayer(props: MinecraftPlayerProps): JSX.Element
  // props.ts (pure, tested)
  resolveAnimation(value: MinecraftPlayerProps['animation'], previous: PlayerAnimation | null): PlayerAnimation | null
  applyLayers(player: PlayerObject, layers: LayerVisibility | undefined): void
  ```
- **Behaviour:**
  - The `PlayerObject` is created and disposed inside one `useEffect`, never in `useMemo`, so StrictMode's double mount gets a fresh object.
  - It renders via `<primitive>` inside a `<group {...rest}>`, with the feet at the group's origin.
  - The group stays invisible until the first skin is applied.
  - Each texture prop loads through its own `createLatestWins`.
  - Errors go to `onError` and never throw during render.
  - `useFrame` updates the animation and the name tag.
  - A changed animation calls `resetPose`. `resolveAnimation` returns `previous` when the same name or the same instance is passed, so a re-render doesn't restart it.

- [ ] **Step 1: Write tests:**
  - `resolveAnimation('walk', null)` returns a `WalkingAnimation`.
  - `resolveAnimation('walk', <that walking animation>)` returns the same instance.
  - Passing a function returns a `FunctionAnimation`, and `null` returns `null`.
  - `applyLayers` hides only the named layers and leaves the others visible.
- [ ] **Step 2:** Implement and run `pnpm test && pnpm typecheck`. Expected: PASS.
- [ ] **Step 3: Commit** `feat(react): MinecraftPlayer component`.

### Task 11: `<SkinViewer>` for R3F

**Files:**
- Create: `src/react/SkinViewer.tsx`, `src/react/OrbitControls.tsx`
- Modify: `src/react/index.ts`

**Interfaces:**
- Consumes: Task 10 and `cameraDistance` (Task 9).
- Produces:
  ```ts
  interface SkinViewerHandle { readonly player: PlayerObject | null; toDataURL(type?: string, quality?: number): string
    screenshot(type?: string, quality?: number): Promise<Blob>; resetCameraPose(): void }
  interface SkinViewerProps extends Omit<MinecraftPlayerProps, 'ref'> {
    width?: number | string; height?: number | string; className?: string; style?: CSSProperties
    pixelRatio?: number | 'match-device'; background?: ColorRepresentation | null
    backgroundImage?: ImageInput | null; panorama?: ImageInput | null   // panorama wins over backgroundImage, which wins over background
    fov?: number; zoom?: number; controls?: boolean; autoRotate?: boolean; autoRotateSpeed?: number
    antialias?: boolean; preserveDrawingBuffer?: boolean; renderPaused?: boolean
    globalLightIntensity?: number; cameraLightIntensity?: number
    children?: ReactNode; ref?: Ref<SkinViewerHandle> }
  function SkinViewer(props: SkinViewerProps): JSX.Element
  ```
- **Defaults:** the same as the vanilla viewer (Task 9).
- **Behaviour:**
  - It renders an R3F `<Canvas>` inside a sized `div`.
  - `renderPaused` maps to `frameloop="never"`.
  - The player is centred at y −16 inside a wrapper group that auto-rotates. Rotation pauses while the controls are being dragged.
  - `children` render in the same scene.
  - A panorama becomes `scene.background` with `EquirectangularReflectionMapping`, disposed on change.
  - `OrbitControls.tsx` wraps `three/addons` `OrbitControls` (no drei), with pan off and distance 10–256.

- [ ] **Step 1:** Implement, then run `pnpm typecheck && pnpm lint && pnpm test`. Expected: PASS. Behaviour is checked in Task 12.
- [ ] **Step 2: Commit** `feat(react): SkinViewer component`.

### Task 12: Playground and visual verification

**Files:**
- Create: `playground/index.html`, `playground/main.tsx`, `playground/Panel.tsx`, `playground/fixtures.ts`, `vite.config.ts`
- Modify: `package.json` (`"dev": "vite"`, `"preview"`)

**Interfaces:**
- Consumes: everything above.
- **`fixtures.ts`** generates, in code:
  - a UV debug skin: every face filled with a distinct colour, and its top-left texel marked white
  - a legacy 64×32 debug skin
  - a slim debug skin
  - an HD (256) debug skin
  - capes in all three formats
  - a standalone ear texture
- **The panel** switches between the vanilla viewer (`?mode=vanilla`) and the R3F viewer, rendered under `<StrictMode>`. It offers:
  - skin by URL, by local file, or by preset name (fetched at runtime from `https://mc-heads.net/skin/<name>`: Notch, jeb_, Technoblade, deadmau5 and a slim skin)
  - model
  - per-layer checkboxes
  - cape/elytra/none
  - ears
  - name tag text
  - every animation, with speed and pause
  - upside-down, background colour, panorama, fov, zoom, auto-rotate, controls
  - a screenshot button

- [ ] **Step 1:** Build the playground. Start it with `pnpm dev` and expect it to serve on localhost:5173.
- [ ] **Step 2: Check face orientation.** Take headless Chromium screenshots of the debug skin from the front, back, left, right, top and bottom (playwright-core installed outside the repo). Every face's white top-left marker must sit at the corner the Task 6 table predicts.
- [ ] **Step 3: Check the Review Focus items in the browser:**
  - A screenshot with the default background has alpha 0 at (0,0).
  - Rapidly switching presets ends on the last one.
  - A 404 skin URL calls `onError` (the panel shows it) and the old skin stays.
  - Toggling between modes under StrictMode leaves one player and no console errors.
  - Close-up shots of the shoulder/body seam and the hat show no z-fighting.
- [ ] **Step 4: Compare with skinview3d.** For Notch (legacy), jeb_, Technoblade, a slim skin and deadmau5 with ears, at 300×400, fov 50, zoom 0.85 and walking: install `skinview3d` into a scratch directory, not into this repo, and take the same shots with it. Expected: matching geometry and colours, with differences limited to deliberate ones (the slim arm drop, cape angle, MSAA). Show the shots to the owner.
- [ ] **Step 5: Commit** `feat(playground): feature panel with generated fixtures`.

### Task 13: README and package check

**Files:**
- Create: `README.md`, `CHANGELOG.md`
- Modify: `package.json` (`description`, `keywords`, `repository` `github:afterhours-systems/blockskin`, `homepage`, `bugs`)

- [ ] **Step 1: Write the README:**
  - what it is, and why (uses your three)
  - install, with the peer dependencies
  - vanilla quick start
  - R3F quick start: a `<SkinViewer>`, and `<MinecraftPlayer>` inside your own `<Canvas>`
  - the animation list and a custom animation
  - name tag font setup
  - a skinview3d migration table: `model: 'default'` becomes `'classic'`; loaders always return Promises; there's no FXAA because the renderer uses MSAA
  - "Not affiliated with Mojang or Microsoft"
  - MIT
- [ ] **Step 2: Check the package.** Run `pnpm build && pnpm pack --dry-run`. Expected: only `dist/**`, `README.md`, `LICENSE`, `CHANGELOG.md` and `package.json`. Then run `grep -rE "three/src|ColorManagement" dist`, which should find nothing.
- [ ] **Step 3: Commit** `docs: README, changelog, package metadata`.
