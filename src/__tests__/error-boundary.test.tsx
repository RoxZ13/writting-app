// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from '../components/AppErrorBoundary'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Array<ReturnType<typeof createRoot>> = []

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
})

describe('application recovery screen', () => {
  it('replaces a crashed screen with backup and reload actions', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Broken = () => {
      throw new Error('render failed')
    }
    const host = document.createElement('div')
    const root = createRoot(host)
    roots.push(root)

    act(() => root.render(<AppErrorBoundary><Broken /></AppErrorBoundary>))

    expect(host.textContent).toContain('Экран не открылся')
    expect(host.textContent).toContain('Скачать аварийную копию')
    expect(host.textContent).toContain('Перезагрузить')
    expect(host.textContent).toContain('render failed')
    errors.mockRestore()
  })
})
