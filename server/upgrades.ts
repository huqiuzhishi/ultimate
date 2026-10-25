import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

export type UpgradeHandler = (request: IncomingMessage, socket: Duplex, head: Buffer) => void

type Registration = { owner: object; handler: UpgradeHandler }

/** Reload-scoped, exact-path HTTP upgrade handlers owned by trusted server extensions. */
export function createUpgrades() {
  const handlers = new Map<string, Registration[]>()
  return {
    register(owner: object, extension: string, path: string, handler: UpgradeHandler) {
      if (!/^\/[A-Za-z0-9._~!$&'()*+,;=:@/-]*$/.test(path) || path.startsWith('//'))
        throw new Error('Upgrade path must be an absolute URL path')
      const pathname = `/api/extensions/${encodeURIComponent(extension)}${path}`
      const current = handlers.get(pathname) ?? []
      if (current.some((entry) => entry.owner === owner))
        throw new Error(`Upgrade path is already registered: ${pathname}`)
      const registration = { owner, handler }
      handlers.set(pathname, [...current, registration])
      return () => {
        const remaining = (handlers.get(pathname) ?? []).filter((entry) => entry !== registration)
        if (remaining.length) handlers.set(pathname, remaining)
        else handlers.delete(pathname)
      }
    },
    handle(request: IncomingMessage, socket: Duplex, head: Buffer) {
      let pathname: string
      try {
        pathname = new URL(request.url ?? '/', 'http://ultimate').pathname
      } catch {
        return false
      }
      const registration = handlers.get(pathname)?.at(-1)
      if (!registration) return false
      try {
        registration.handler(request, socket, head)
      } catch (error) {
        console.error(`Extension upgrade failed (${pathname}):`, error)
        socket.destroy()
      }
      return true
    },
  }
}
export type Upgrades = ReturnType<typeof createUpgrades>
