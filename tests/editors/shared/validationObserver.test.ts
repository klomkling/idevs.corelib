import { afterEach, describe, expect, it } from 'vitest'
import { createValidationObserver } from '../../../src/editors/shared/validationObserver'

const waitForMutation = () => new Promise(resolve => setTimeout(resolve, 0))

afterEach(() => {
  document.body.replaceChildren()
})

function setup() {
  const source = document.createElement('input')
  const target = document.createElement('input')
  document.body.append(source, target)
  return { source, target }
}

describe('createValidationObserver', () => {
  it('syncs added classes from source to target when started', async () => {
    const { source, target } = setup()
    const obs = createValidationObserver({
      source,
      target,
      classes: ['error', 'invalid'],
    })
    obs.start()
    source.classList.add('error')
    await waitForMutation()
    expect(target.classList.contains('error')).toBe(true)
    obs.stop()
  })

  it('syncs removed classes from source to target', async () => {
    const { source, target } = setup()
    source.classList.add('error')
    const obs = createValidationObserver({
      source,
      target,
      classes: ['error'],
    })
    obs.start()
    obs.syncOnce()
    expect(target.classList.contains('error')).toBe(true)
    source.classList.remove('error')
    await waitForMutation()
    expect(target.classList.contains('error')).toBe(false)
    obs.stop()
  })

  it('ignores classes outside the configured allowlist', async () => {
    const { source, target } = setup()
    const obs = createValidationObserver({
      source,
      target,
      classes: ['error'],
    })
    obs.start()
    source.classList.add('highlight')
    await waitForMutation()
    expect(target.classList.contains('highlight')).toBe(false)
    obs.stop()
  })

  it('stop() disconnects — further source changes do not propagate', async () => {
    const { source, target } = setup()
    const obs = createValidationObserver({
      source,
      target,
      classes: ['error'],
    })
    obs.start()
    obs.stop()
    source.classList.add('error')
    await waitForMutation()
    expect(target.classList.contains('error')).toBe(false)
  })

  it('stop() is idempotent', () => {
    const { source, target } = setup()
    const obs = createValidationObserver({
      source,
      target,
      classes: ['error'],
    })
    obs.start()
    expect(() => {
      obs.stop()
      obs.stop()
      obs.stop()
    }).not.toThrow()
  })

  it('accepts target as a getter function (late binding)', async () => {
    const { source } = setup()
    let lateTarget: HTMLInputElement | undefined
    const obs = createValidationObserver({
      source,
      target: () => lateTarget,
      classes: ['error'],
    })
    obs.start()
    source.classList.add('error')
    await waitForMutation()
    lateTarget = document.createElement('input')
    document.body.appendChild(lateTarget)
    obs.syncOnce()
    expect(lateTarget.classList.contains('error')).toBe(true)
    obs.stop()
  })
})
