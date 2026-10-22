import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useState, type RefObject } from 'react'
import { OrbitControls as ThreeOrbitControls } from 'three/addons/controls/OrbitControls.js'

export interface OrbitControlsProps {
  enabled?: boolean
  /** Receives the controls instance, for camera resets. */
  controlsRef?: RefObject<ThreeOrbitControls | null>
  onDragChange?: (dragging: boolean) => void
}

/** three's own OrbitControls, so the package needs no drei. */
export function OrbitControls({ enabled = true, controlsRef, onDragChange }: OrbitControlsProps) {
  const camera = useThree((state) => state.camera)
  const domElement = useThree((state) => state.gl.domElement)
  const [controls, setControls] = useState<ThreeOrbitControls | null>(null)

  // The constructor attaches DOM listeners and dispose() removes them, so
  // both happen inside one effect: StrictMode's remount then gets a fresh,
  // connected instance instead of a disposed one.
  useEffect(() => {
    const created = new ThreeOrbitControls(camera, domElement)
    created.enablePan = false
    created.minDistance = 10
    created.maxDistance = 256
    setControls(created)
    if (controlsRef) controlsRef.current = created
    return () => {
      created.dispose()
      if (controlsRef?.current === created) controlsRef.current = null
      setControls(null)
    }
  }, [camera, domElement, controlsRef])

  useEffect(() => {
    if (controls) controls.enabled = enabled
  }, [controls, enabled])

  useEffect(() => {
    if (!controls || !onDragChange) return
    const start = () => onDragChange(true)
    const end = () => onDragChange(false)
    controls.addEventListener('start', start)
    controls.addEventListener('end', end)
    return () => {
      controls.removeEventListener('start', start)
      controls.removeEventListener('end', end)
    }
  }, [controls, onDragChange])

  useFrame(() => controls?.update())
  return null
}
