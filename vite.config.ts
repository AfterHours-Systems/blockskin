import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'playground',
  plugins: [react()],
  // One copy of each, or hooks and instanceof checks break across chunks.
  resolve: { dedupe: ['react', 'react-dom', 'three', '@react-three/fiber'] },
})
