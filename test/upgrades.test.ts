import { PassThrough } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createUpgrades } from '../server/upgrades.ts'
import type { UpgradeHandler } from '../server/upgrades.ts'
import { fixture } from './server-fixture.ts'
import { until } from './helpers.ts'

const request = (url: string) => ({ url }) as IncomingMessage

describe('extension upgrades', () => {
  it('dispatches one exact namespaced path and removes it with its disposer', () => {
    const upgrades = createUpgrades()
    const owner = {}
    const handler = vi.fn<UpgradeHandler>()
    const remove = upgrades.register(owner, 'terminal', '/socket', handler)
    const socket = new PassThrough()
    const head = Buffer.from('head')

    expect(
      upgrades.handle(request('/api/extensions/terminal/socket?conversation=1'), socket, head),
    ).toBe(true)
    expect(handler).toHaveBeenCalledWith(expect.anything(), socket, head)
    expect(upgrades.handle(request('/api/extensions/terminal/socket/'), socket, head)).toBe(false)
    expect(upgrades.handle(request('/api/extensions/other/socket'), socket, head)).toBe(false)

    remove()
    expect(upgrades.handle(request('/api/extensions/terminal/socket'), socket, head)).toBe(false)
  })

  it('rejects invalid and same-owner duplicates while staging a facet replacement', () => {
    const upgrades = createUpgrades()
    const owner = {}
    const first = vi.fn<UpgradeHandler>()
    upgrades.register(owner, 'terminal', '/socket', first)

    expect(() => upgrades.register(owner, 'terminal', '/socket', vi.fn())).toThrow(
      'Upgrade path is already registered',
    )
    for (const path of ['', 'socket', '//socket', '/socket?token=x', '/socket#part'])
      expect(() => upgrades.register({}, 'terminal', path, vi.fn())).toThrow(
        'Upgrade path must be an absolute URL path',
      )

    const replacement = vi.fn<UpgradeHandler>()
    const removeReplacement = upgrades.register({}, 'terminal', '/socket', replacement)
    const socket = new PassThrough()
    expect(
      upgrades.handle(request('/api/extensions/terminal/socket'), socket, Buffer.alloc(0)),
    ).toBe(true)
    expect(replacement).toHaveBeenCalledOnce()
    expect(first).not.toHaveBeenCalled()
    removeReplacement()
    expect(
      upgrades.handle(request('/api/extensions/terminal/socket'), socket, Buffer.alloc(0)),
    ).toBe(true)
    expect(first).toHaveBeenCalledOnce()
  })

  it('removes and replaces facet registrations across reload and unload', async () => {
    const source = (status: string) => `import { defineExtension } from '@earendil-works/pi-durable'
export default host => {
  host.upgrade('/socket', (_request, socket) => socket.end('HTTP/1.1 ${status} Test\\r\\nConnection: close\\r\\n\\r\\n'))
  return defineExtension({ name: 'upgrade' })
}`
    const { server, options } = await fixture(false, { upgrade: source('299') })
    const path = join(options.ultimateRoot, 'extensions/upgrade/server.ts')
    const dispatch = async () => {
      const socket = new PassThrough()
      let output = ''
      socket.on('data', (chunk) => (output += chunk.toString()))
      const handled = server.upgrades.handle(
        request('/api/extensions/upgrade/socket'),
        socket,
        Buffer.alloc(0),
      )
      await new Promise<void>((resolve) => socket.on('finish', resolve))
      return { handled, output }
    }

    expect(await dispatch()).toEqual({ handled: true, output: expect.stringContaining('299') })
    const loaded = server.extensions.info().find((entry) => entry.name === 'upgrade')!
      .server!.loadedAt
    await writeFile(path, source('298'))
    await until(
      () =>
        server.extensions.info().find((entry) => entry.name === 'upgrade')!.server!.loadedAt !==
        loaded,
    )
    expect(await dispatch()).toEqual({ handled: true, output: expect.stringContaining('298') })

    await writeFile(
      join(options.ultimateRoot, '.ultimate/settings.json'),
      '{"extensions":{"disable":["upgrade"]}}',
    )
    await until(() => !server.extensions.info().find((entry) => entry.name === 'upgrade')!.enabled)
    const socket = new PassThrough()
    expect(
      server.upgrades.handle(request('/api/extensions/upgrade/socket'), socket, Buffer.alloc(0)),
    ).toBe(false)
  })

  it('owns handler failures and never forwards a claimed path to HMR', () => {
    const upgrades = createUpgrades()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const socket = new PassThrough()
    const destroy = vi.spyOn(socket, 'destroy')
    upgrades.register({}, 'broken', '/socket', () => {
      throw new Error('broken')
    })

    expect(upgrades.handle(request('/api/extensions/broken/socket'), socket, Buffer.alloc(0))).toBe(
      true,
    )
    expect(destroy).toHaveBeenCalledOnce()
    expect(error).toHaveBeenCalledWith(
      'Extension upgrade failed (/api/extensions/broken/socket):',
      expect.any(Error),
    )
  })
})
