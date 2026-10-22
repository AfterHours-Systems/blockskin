import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, type RefObject } from 'react'
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
  const controls = useMemo(() => new ThreeOrbitControls(camera, domElement), [camera, domElement])

  useEffect(() => {
    controls.enablePan = false
    controls.minDistance = 10
    controls.maxDistance = 256
    if (controlsRef) controlsRef.current = controls
    return () => {
      if (controlsRef) controlsRef.current = null
      controls.dispose()
    }
  }, [controls, controlsRef])

  useEffect(() => {
    controls.enabled = enabled
  }, [controls, enabled])

  useEffect(() => {
    if (!onDragChange) return
    const start = () => onDragChange(true)
    const end = () => onDragChange(false)
    controls.addEventListener('start', start)
    controls.addEventListener('end', end)
    return () => {
      controls.removeEventListener('start', start)
      controls.removeEventListener('end', end)
    }
  }, [controls, onDragChange])

  useFrame(() => controls.update())
  return null
}
