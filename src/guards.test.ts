import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// The whole point of this package is to share the host's three.js, so these
// guards keep out the patterns that broke skinview3d for its users.
const srcDir = new URL('.', import.meta.url).pathname
const self = new URL(import.meta.url).pathname

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) && path !== self ? [path] : []
  })
}

const files = sourceFiles(srcDir).map((path) => ({
  path: relative(srcDir, path),
  text: readFileSync(path, 'utf8'),
}))

describe('source guards', () => {
  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)('$path imports no three internals', ({ text }) => {
    expect(text).not.toMatch(/from ['"]three\/src/)
  })

  it.each(files)('$path touches no global three state', ({ text }) => {
    expect(text).not.toMatch(/ColorManagement\./)
    expect(text).not.toMatch(/Cache\.enabled/)
    expect(text).not.toMatch(/DefaultLoadingManager/)
  })

  it.each(files)('$path does not depend on drei', ({ text }) => {
    expect(text).not.toMatch(/@react-three\/drei/)
  })

  it.each(files.filter((f) => !f.path.startsWith('react/')))(
    '$path keeps React out of the core',
    ({ text }) => {
      expect(text).not.toMatch(/from ['"](react|react-dom|@react-three\/fiber)(\/[^'"]*)?['"]/)
    },
  )
})
