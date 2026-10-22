import { describe, expect, it } from 'vitest'
import { createLatestWins } from './sequence.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('createLatestWins', () => {
  it('reports the first load as stale when the second started before it resolved', async () => {
    const run = createLatestWins()
    const first = deferred<string>()
    const second = deferred<string>()
    const a = run(() => first.promise)
    const b = run(() => second.promise)
    second.resolve('second')
    first.resolve('first')
    expect(await b).toEqual({ stale: false, value: 'second' })
    expect(await a).toEqual({ stale: true })
  })

  it('aborts the earlier signal when a new load starts', async () => {
    const run = createLatestWins()
    let firstSignal: AbortSignal | undefined
    void run((signal) => {
      firstSignal = signal
      return new Promise(() => {})
    })
    expect(firstSignal?.aborted).toBe(false)
    await run(async () => 'next')
    expect(firstSignal?.aborted).toBe(true)
  })

  it('swallows the rejection of a stale load', async () => {
    const run = createLatestWins()
    const first = deferred<string>()
    const a = run(() => first.promise)
    await run(async () => 'next')
    first.reject(new Error('boom'))
    await expect(a).resolves.toEqual({ stale: true })
  })

  it('rethrows the rejection of the current load', async () => {
    const run = createLatestWins()
    await expect(run(async () => Promise.reject(new Error('404')))).rejects.toThrow('404')
  })
})
