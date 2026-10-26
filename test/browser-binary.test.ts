import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { browserBinary } from '../extensions/browser/server.ts'

const homes: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(homes.splice(0).map((home) => rm(home, { force: true, recursive: true })))
})

test('finds Playwright headless Chromium in the macOS cache', async () => {
  vi.stubEnv('ULTIMATE_CHROMIUM', '')
  const home = await mkdtemp(join(tmpdir(), 'ultimate-browser-binary-'))
  homes.push(home)
  const executable = join(
    home,
    'Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-mac/headless_shell',
  )
  await mkdir(join(executable, '..'), { recursive: true })
  await writeFile(executable, '')
  await chmod(executable, 0o755)

  expect(await browserBinary(home)).toBe(executable)
})
