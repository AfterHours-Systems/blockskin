# blockskin

A Minecraft skin viewer for [three.js](https://threejs.org) and
[React Three Fiber](https://r3f.docs.pmnd.rs), built on **your** three.

Other viewers bundle or pin their own copy of three.js, so an app on a current
three ends up loading two, and some change global three settings
(`ColorManagement`) that leak into every other scene. blockskin takes `three`
as a peer dependency, imports nothing from three's internals, and never touches
global three state itself. (Mounting an R3F `<Canvas>`, including the one in
blockskin's `SkinViewer`, lets R3F switch `ColorManagement` on, which is three's
default anyway.) It does everything skinview3d 3.4 does, and runs on three r186
and later.

- 64×64 and legacy 64×32 skins, HD skins (any multiple of 64)
- Classic and slim arms, detected from the pixels or set explicitly
- Inner and outer layer per body part, each one switchable
- Capes (64×32, 22×17 and OptiFine's 46×22), elytra, ears (deadmau5-style or a 14×7 texture)
- Name tags
- Animations: idle, walk, run, fly, swim, wave, crouch (optionally while hitting), hit, and your own
- Upside-down players, the way the game draws Dinnerbone and Grumm
- A plain three.js viewer class, an R3F player for your own scene, and an R3F drop-in viewer

## Install

```sh
npm install @afterhours-systems/blockskin three
# for the React components, also:
npm install react @react-three/fiber
```

| peer                 | version | needed for                            |
| -------------------- | ------- | ------------------------------------- |
| `three`              | ≥ 0.186 | everything                            |
| `react`              | ^19     | `@afterhours-systems/blockskin/react` |
| `@react-three/fiber` | ^9      | `@afterhours-systems/blockskin/react` |

## Plain three.js

```js
import { SkinViewer, WalkingAnimation } from '@afterhours-systems/blockskin'

const viewer = new SkinViewer({
  canvas: document.getElementById('skin'),
  width: 300,
  height: 400,
  skin: 'https://example.com/skin.png',
  animation: new WalkingAnimation(),
})
viewer.autoRotate = true

await viewer.loadCape('https://example.com/cape.png', { backEquipment: 'elytra' })
viewer.nameTag = 'Steve'
viewer.loadPanorama('https://example.com/panorama.png')
const png = await viewer.screenshot()
viewer.dispose()
```

To use the model in a scene you already have, add a `PlayerObject` and feed it
pixels yourself:

```js
import { PlayerObject, readPixels } from '@afterhours-systems/blockskin'

const player = new PlayerObject() // feet at the origin, 1 unit = 1 skin pixel
player.applySkin(await readPixels('https://example.com/skin.png'))
player.scale.setScalar(1 / 16) // one block per unit, if your scene uses metres
scene.add(player)
```

## React Three Fiber

A complete viewer:

```jsx
import { SkinViewer } from '@afterhours-systems/blockskin/react'

;<SkinViewer
  width={300}
  height={400}
  skin="https://example.com/skin.png"
  animation="walk"
  autoRotate
  autoRotateSpeed={0.8}
  zoom={0.85}
/>
```

Or the player alone, inside your own `<Canvas>`:

```jsx
import { Canvas } from '@react-three/fiber'
import { MinecraftPlayer } from '@afterhours-systems/blockskin/react'

;<Canvas flat camera={{ position: [0, 16, 60] }}>
  <ambientLight intensity={3} />
  <MinecraftPlayer skin="https://example.com/skin.png" animation="run" cape={capeUrl} />
</Canvas>
```

`MinecraftPlayer` takes the usual group props (`position`, `rotation`,
`scale`) plus `skin`, `model`, `cape`, `backEquipment`, `ears`, `layers`,
`nameTag`, `animation`, `animationSpeed`, `paused`, `upsideDown`, `onLoad` and
`onError`. `backEquipment` is `'cape'`, `'elytra'` or `null` (none), and
switching it never reloads the texture. Keep image props stable between renders: a new value reloads the
texture. `SkinViewer` adds the viewer props (`fov`, `zoom`, `controls`,
`autoRotate`, `background`, `backgroundImage`, `panorama`, `pixelRatio`,
`renderPaused`, light intensities) and a ref with `screenshot()`,
`toDataURL()`, `resetCameraPose()` and `player`.

Use `flat` on your own `<Canvas>`: R3F's default tone mapping shifts skin
colours.

## Animations

| name     | class                                                              |
| -------- | ------------------------------------------------------------------ |
| `idle`   | `IdleAnimation`                                                    |
| `walk`   | `WalkingAnimation`                                                 |
| `run`    | `RunningAnimation`                                                 |
| `fly`    | `FlyingAnimation` (elytra pose)                                    |
| `swim`   | `SwimAnimation`                                                    |
| `wave`   | `WaveAnimation('left' \| 'right')` or `({ arm })`                  |
| `crouch` | `CrouchAnimation` (`runOnce`, `showProgress`, `addHitAnimation()`) |
| `hit`    | `HitAnimation`                                                     |

Every animation has `speed`, `paused` and `progress`, and
`addAnimation(fn)` stacks extra motion on top. Idle, walk and run keep the
head still unless you ask for a slow look around:

```js
viewer.animation = new WalkingAnimation({ lookAround: true })
// in React, pass an instance:
// animation={useMemo(() => new WalkingAnimation({ lookAround: true }), [])}
```

Write your own as a function:

```js
viewer.animation = new FunctionAnimation((player, progress) => {
  player.skin.head.rotation.y = Math.sin(progress) * 0.5
})
// in React: <MinecraftPlayer animation={(player, progress) => { … }} />
```

## Name tags and fonts

Name tags default to `48px Minecraft`. blockskin does not ship that font, so
either load a font-face with that name yourself or pass another font:

```js
new NameTagObject('Steve', { font: '48px monospace', textStyle: 'yellow' })
```

## Coming from skinview3d

The concepts and most names carry over, so moving is largely mechanical. The
differences:

| skinview3d                                               | blockskin                                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `model: 'default'`                                       | `model: 'classic'`                                                                  |
| `loadSkin(image)` returns `void` for images              | every `load*` returns a Promise                                                     |
| FXAA post-processing                                     | the renderer's own multisample anti-aliasing (`antialias`)                          |
| sets `ColorManagement.enabled = false`                   | leaves global three state alone                                                     |
| bundles the Minecraft font                               | bring your own font for name tags                                                   |
| slim arms level with classic ones                        | slim arms half a pixel lower, as in the game                                        |
| `BodyPart.innerLayer` / `outerLayer`                     | `BodyPart.inner` / `outer`                                                          |
| `WalkingAnimation` turns the head                        | the head stays still unless `{ lookAround: true }`                                  |
| `new WaveAnimation('right')`                             | the same, or `{ arm: 'right' }`; both default to the left arm                       |
| `cameraLight` 0.6, fading with distance (barely visible) | `cameraLight` 0 by default with no falloff; try 0.3 to 1 for view-following shading |

## Development

```sh
pnpm install
pnpm test        # unit tests (Node)
pnpm dev         # playground at http://localhost:5173
pnpm build
```

## License

MIT. Not affiliated with or endorsed by Mojang Studios or Microsoft.
Minecraft is a trademark of Mojang Studios.
