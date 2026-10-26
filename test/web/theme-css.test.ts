import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { compile } from 'tailwindcss'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)

// Regression: the fonts sat in `@theme inline`, so Tailwind baked literal stacks into `font-sans`, `font-mono` and
// the page default, and the theme extension's --font-sans / --font-mono overrides on <html> changed nothing.
it('font utilities and the page default read --font-sans and --font-mono', async () => {
  const css = readFileSync(new URL('../../web/src/index.css', import.meta.url), 'utf8')
  const compiler = await compile(css, {
    base: new URL('../../web/src', import.meta.url).pathname,
    loadStylesheet: async (id, base) =>
      id === 'tailwindcss'
        ? {
            path: require.resolve('tailwindcss/index.css'),
            base,
            content: readFileSync(require.resolve('tailwindcss/index.css'), 'utf8'),
          }
        : { path: id, base, content: '' },
  })
  const out = compiler.build(['font-sans', 'font-mono'])
  expect(out).toMatch(/\.font-sans \{\s*font-family: var\(--font-sans\);/)
  expect(out).toMatch(/\.font-mono \{\s*font-family: var\(--font-mono\);/)
  expect(out).toContain('--default-font-family: var(--font-sans)')
  expect(out).toContain('--default-mono-font-family: var(--font-mono)')
})
