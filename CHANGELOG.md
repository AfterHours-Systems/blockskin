# Changelog

## 0.1.0-alpha.1 (2026-10-24)

First alpha, published under the npm tag `alpha`
(`pnpm add @afterhours-systems/blockskin@alpha`). The API may still change
before 0.1.0.

It contains: a three.js core (`PlayerObject`, `SkinViewer`, animations,
name tags, skin/cape/ear format handling) and React Three Fiber components
(`MinecraftPlayer`, `SkinViewer`, `OrbitControls`), with feature parity with
skinview3d 3.4.2.

Beyond skinview3d: smooth animation transitions, random actions with
automatic elytra (`animation="random"`), poke reactions with the game's hurt
flash, a head that follows the pointer, 3D skin layers, a ground shadow, `§`
formatting codes in name tags, and respect for reduced motion.
