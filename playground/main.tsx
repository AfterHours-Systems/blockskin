import {Canvas, useThree} from '@react-three/fiber';
import type {Camera} from 'three';
import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {createRoot} from 'react-dom/client';
import type {PlayerDriver, PokePart} from '../src/index.js';
import {
  createAnimation,
  SkinViewer as VanillaViewer,
  type ImageInput,
  type PlayerObject,
} from '../src/index.js';
import {
  MinecraftPlayer,
  SkinViewer,
  type SkinViewerHandle,
} from '../src/react/index.js';
import {debugEars, debugPanorama} from './fixtures.js';
import {Panel} from './panel.js';
import {
  capeInput,
  earsInput,
  layersFromHidden,
  skinInput,
  stateFromUrl,
  type PlaygroundState,
} from './state.js';

const WIDTH = 300;
const HEIGHT = 400;

interface Api {
  player(): PlayerObject | null;
  screenshot(): string;
  viewer?: VanillaViewer;
  camera?: () => Camera | undefined;
  driver?: () => PlayerDriver | null | undefined;
}

declare global {
  interface Window {
    playground?: {
      state: PlaygroundState;
      set(patch: Partial<PlaygroundState>): void;
      player(): PlayerObject | null;
      screenshot(): string;
      viewer(): VanillaViewer | undefined;
      camera(): Camera | undefined;
      driver(): PlayerDriver | null | undefined;
      errors: string[];
      pokes: PokePart[];
      /** Pointer-ups reaching the group around the player in own-canvas mode. */
      ancestorUps: number;
      loads: number;
    };
  }
}

interface ViewProps {
  state: PlaygroundState;
  skin: ImageInput;
  cape: ImageInput | null;
  panorama: ImageInput | null;
  onError: (error: unknown) => void;
  onLoad: () => void;
  onPoke: (part: PokePart) => void;
  apiRef: React.RefObject<Api | null>;
}

function ReactView({
  state,
  skin,
  cape,
  panorama,
  onError,
  onLoad,
  onPoke,
  apiRef,
}: ViewProps) {
  const handle = useRef<SkinViewerHandle>(null);
  const ears = useMemo(() => earsInput(state.ears), [state.ears]);
  useEffect(() => {
    apiRef.current = {
      player: () => handle.current?.player ?? null,
      screenshot: () => handle.current!.toDataURL(),
      driver: () => handle.current?.driver,
    };
  }, [apiRef]);
  return (
    <SkinViewer
      ref={handle}
      width={WIDTH}
      height={HEIGHT}
      style={{imageRendering: 'pixelated'}}
      skin={skin}
      model={state.model}
      cape={cape}
      backEquipment={state.back === 'elytra' ? 'elytra' : 'cape'}
      ears={ears}
      layers={layersFromHidden(state.hidden)}
      nameTag={state.nameTag || null}
      animation={state.animation === 'none' ? null : state.animation}
      animationSpeed={state.speed}
      paused={state.paused}
      transition={state.transition}
      reactions={state.reactions}
      onPoke={onPoke}
      lookAtPointer={state.lookAt === 'off' ? false : state.lookAt}
      layers3d={state.layers3d}
      shadow={state.shadow}
      reducedMotion={state.reducedMotion}
      upsideDown={state.upsideDown}
      background={state.background || null}
      panorama={panorama}
      fov={state.fov}
      zoom={state.zoom}
      autoRotate={state.autoRotate}
      autoRotateSpeed={0.8}
      controls={state.controls}
      cameraLightIntensity={state.cameraLight}
      onError={onError}
      onLoad={onLoad}
    />
  );
}

function VanillaView({
  state,
  skin,
  cape,
  panorama,
  onError,
  onLoad,
  onPoke,
  apiRef,
}: ViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewer, setViewer] = useState<VanillaViewer | null>(null);

  useEffect(() => {
    const created = new VanillaViewer({
      canvas: canvasRef.current!,
      width: WIDTH,
      height: HEIGHT,
      onError,
    });
    created.autoRotateSpeed = 0.8;
    setViewer(created);
    apiRef.current = {
      player: () => created.playerObject,
      screenshot: () => created.toDataURL(),
      viewer: created,
    };
    return () => created.dispose();
  }, [apiRef, onError]);

  const ears = state.ears;
  useEffect(() => {
    viewer
      ?.loadSkin(skin, {model: state.model, ears: ears === 'skin'})
      .then(onLoad)
      .catch(onError);
  }, [viewer, skin, state.model, ears, onError, onLoad]);
  useEffect(() => {
    if (!viewer) return;
    if (ears === 'standalone')
      viewer.loadEars(debugEars(), {textureType: 'standalone'}).catch(onError);
    else if (ears === 'off') viewer.resetEars();
  }, [viewer, ears, onError]);
  useEffect(() => {
    viewer
      ?.loadCape(cape, {
        backEquipment: state.back === 'elytra' ? 'elytra' : 'cape',
      })
      .catch(onError);
  }, [viewer, cape, state.back, onError]);
  useEffect(() => {
    if (!viewer) return;
    const layers = layersFromHidden(state.hidden);
    for (const part of viewer.playerObject.skin.parts()) {
      const name = part.name as keyof typeof layers;
      part.inner.visible = layers[name]?.inner ?? true;
      part.outer.visible = layers[name]?.outer ?? true;
    }
  }, [viewer, state.hidden]);
  useEffect(() => {
    if (viewer)
      viewer.animation =
        state.animation === 'none' ? null : createAnimation(state.animation);
  }, [viewer, state.animation]);
  useEffect(() => {
    if (!viewer?.animation) return;
    viewer.animation.speed = state.speed;
    viewer.animation.paused = state.paused;
  }, [viewer, state.animation, state.speed, state.paused]);
  useEffect(() => {
    if (viewer) viewer.nameTag = state.nameTag || null;
  }, [viewer, state.nameTag]);
  useEffect(() => {
    if (viewer) viewer.cameraLight.intensity = state.cameraLight;
  }, [viewer, state.cameraLight]);
  useEffect(() => {
    if (viewer) viewer.transition = state.transition;
  }, [viewer, state.transition]);
  useEffect(() => {
    if (!viewer) return;
    viewer.reactions = state.reactions;
    viewer.onPoke = onPoke;
  }, [viewer, state.reactions, onPoke]);
  useEffect(() => {
    if (viewer)
      viewer.lookAtPointer = state.lookAt === 'off' ? false : state.lookAt;
  }, [viewer, state.lookAt]);
  useEffect(() => {
    if (viewer) viewer.layers3d = state.layers3d;
  }, [viewer, state.layers3d]);
  useEffect(() => {
    if (viewer) viewer.shadow = state.shadow;
  }, [viewer, state.shadow]);
  useEffect(() => {
    if (viewer) viewer.reducedMotion = state.reducedMotion;
  }, [viewer, state.reducedMotion]);
  useEffect(() => {
    if (!viewer) return;
    viewer.playerObject.upsideDown = state.upsideDown;
    viewer.fov = state.fov;
    viewer.zoom = state.zoom;
    viewer.autoRotate = state.autoRotate;
    viewer.controls.enabled = state.controls;
  }, [
    viewer,
    state.upsideDown,
    state.fov,
    state.zoom,
    state.autoRotate,
    state.controls,
  ]);
  useEffect(() => {
    if (!viewer) return;
    if (panorama) viewer.loadPanorama(panorama).catch(onError);
    else viewer.background = state.background || null;
  }, [viewer, panorama, state.background, onError]);

  return (
    <canvas
      ref={canvasRef}
      style={{imageRendering: 'pixelated', display: 'block'}}
    />
  );
}

// Hands the canvas's camera to scripts; R3F's default camera isn't in the scene.
function CameraTap({cameraRef}: {cameraRef: React.RefObject<Camera | null>}) {
  const camera = useThree(state => state.camera);
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera, cameraRef]);
  return null;
}

// The player alone in a canvas that only redraws on demand, the way an app
// embedding <MinecraftPlayer> in its own scene might run it.
function PlayerView({
  state,
  skin,
  cape,
  onError,
  onLoad,
  onPoke,
  apiRef,
}: ViewProps) {
  const player = useRef<PlayerObject>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const camera = useRef<Camera | null>(null);
  const ears = useMemo(() => earsInput(state.ears), [state.ears]);
  useEffect(() => {
    apiRef.current = {
      player: () => player.current,
      screenshot: () => canvas.current!.toDataURL(),
      camera: () => camera.current ?? undefined,
    };
  }, [apiRef]);
  return (
    <Canvas
      ref={canvas}
      flat
      frameloop="demand"
      gl={{alpha: true, preserveDrawingBuffer: true}}
      camera={{fov: state.fov, position: [0, 0, 46]}}
      style={{width: WIDTH, height: HEIGHT, imageRendering: 'pixelated'}}
    >
      <ambientLight intensity={3} />
      <CameraTap cameraRef={camera} />
      <group
        position={[0, -16, 0]}
        onPointerUp={() => {
          if (window.playground) window.playground.ancestorUps++;
        }}
      >
        <MinecraftPlayer
          ref={player}
          skin={skin}
          model={state.model}
          cape={cape}
          backEquipment={
            state.back === 'elytra'
              ? 'elytra'
              : state.back === 'cape'
                ? 'cape'
                : null
          }
          ears={ears}
          layers={layersFromHidden(state.hidden)}
          nameTag={state.nameTag || null}
          upsideDown={state.upsideDown}
          transition={state.transition}
          reactions={state.reactions}
          onPoke={state.quiet ? undefined : onPoke}
          lookAtPointer={state.lookAt === 'off' ? false : state.lookAt}
          layers3d={state.layers3d}
          shadow={state.shadow}
          reducedMotion={state.reducedMotion}
          onError={onError}
          onLoad={onLoad}
        />
      </group>
    </Canvas>
  );
}

function App() {
  const [state, setState] = useState(() => stateFromUrl(location.search));
  const [file, setFile] = useState<string | null>(null);
  const [error, setError] = useState('');
  const apiRef = useRef<Api | null>(null);
  const errors = useRef<string[]>([]);
  const loads = useRef(0);
  const pokes = useRef<PokePart[]>([]);
  const [pokeLog, setPokeLog] = useState<PokePart[]>([]);
  const set = useCallback(
    (patch: Partial<PlaygroundState>) => setState(s => ({...s, ...patch})),
    [],
  );

  const skin = useMemo(() => skinInput(state.skin, file), [state.skin, file]);
  const {back, capeFormat} = state;
  const cape = useMemo(() => capeInput({back, capeFormat}), [back, capeFormat]);
  const panorama = useMemo(
    () => (state.panorama ? debugPanorama() : null),
    [state.panorama],
  );
  const onError = useCallback((e: unknown) => {
    const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    errors.current.push(message);
    setError(message);
  }, []);
  const onPoke = useCallback((part: PokePart) => {
    pokes.current.push(part);
    setPokeLog(log => [...log.slice(-7), part]);
  }, []);
  const onLoad = useCallback(() => {
    loads.current++;
    setError('');
  }, []);

  useEffect(() => {
    window.playground = {
      state,
      set,
      player: () => apiRef.current?.player() ?? null,
      screenshot: () => apiRef.current!.screenshot(),
      viewer: () => apiRef.current?.viewer,
      camera: () =>
        apiRef.current?.camera?.() ?? apiRef.current?.viewer?.camera,
      driver: () =>
        apiRef.current?.driver?.() ?? apiRef.current?.viewer?.driver,
      errors: errors.current,
      pokes: pokes.current,
      ancestorUps: window.playground?.ancestorUps ?? 0,
      get loads() {
        return loads.current;
      },
    };
  }, [state, set]);

  const props = {state, skin, cape, panorama, onError, onLoad, onPoke, apiRef};
  return (
    <>
      <div id="viewer" style={{width: WIDTH, height: HEIGHT}}>
        {state.mode === 'react' ? (
          <ReactView key="react" {...props} />
        ) : state.mode === 'player' ? (
          <PlayerView key="player" {...props} />
        ) : (
          <VanillaView key="vanilla" {...props} />
        )}
      </div>
      <Panel
        state={state}
        set={set}
        onFile={url => {
          setFile(url);
          set({skin: 'file'});
        }}
        onScreenshot={() => {
          const link = document.createElement('a');
          link.href = apiRef.current!.screenshot();
          link.download = 'blockskin.png';
          link.click();
        }}
        error={error}
        pokes={pokeLog}
      />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
