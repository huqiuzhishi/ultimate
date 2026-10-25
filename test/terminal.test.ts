import { describe, expect, it } from 'vitest'
import {
  localTerminalRequest,
  sessionName,
  terminalSize,
  tmuxArgs,
  tmuxServer,
} from '../extensions/terminal/session.ts'

describe('terminal', () => {
  it('admits only an exact local browser authority with no proxy headers', () => {
    for (const host of [
      '127.0.0.1:4747',
      'localhost:4747',
      'ultimate.localhost:4747',
      '[::1]:4747',
    ])
      expect(localTerminalRequest({ host, origin: `http://${host}` })).toBe(true)

    expect(localTerminalRequest({ host: '127.0.0.1:4747' })).toBe(false)
    expect(localTerminalRequest({ host: '127.0.0.1:4747', origin: 'http://localhost:4747' })).toBe(
      false,
    )
    expect(
      localTerminalRequest({
        host: 'ultimate.example:4747',
        origin: 'http://ultimate.example:4747',
      }),
    ).toBe(false)
    expect(
      localTerminalRequest({ host: '127.0.0.1:4747', origin: 'http://127.0.0.1:4747/path' }),
    ).toBe(false)
    for (const forwarded of [
      'x-forwarded-for',
      'x-forwarded-host',
      'x-forwarded-proto',
      'forwarded',
    ])
      expect(
        localTerminalRequest({
          host: '127.0.0.1:4747',
          origin: 'http://127.0.0.1:4747',
          [forwarded]: '',
        }),
      ).toBe(false)
  })

  it('names sessions by Ultimate home and conversation and passes cwd without shell parsing', () => {
    expect(tmuxServer('/home/project-a')).toMatch(/^ultimate-[a-f0-9]{12}$/)
    expect(sessionName('/home/project-a', 7)).toMatch(/^[a-f0-9]{12}-7$/)
    expect(sessionName('/home/project-a', 7)).toBe(sessionName('/home/project-a', 7))
    expect(sessionName('/home/project-a', 7)).not.toBe(sessionName('/home/project-b', 7))
    expect(sessionName('/home/project-a', 7)).not.toBe(sessionName('/home/project-a', 8))
    expect(tmuxArgs('ultimate-test', 'test-7', "/tmp/it's here", '/bin/zsh')).toEqual([
      '-L',
      'ultimate-test',
      '-f',
      '/dev/null',
      'new-session',
      '-A',
      '-s',
      'test-7',
      '-c',
      "/tmp/it's here",
      '/bin/zsh',
      '-l',
      ';',
      'set-option',
      '-g',
      'status',
      'off',
    ])
  })

  it('bounds terminal dimensions', () => {
    expect(terminalSize(null, 30, 300)).toBe(30)
    expect(terminalSize('1', 30, 300)).toBe(2)
    expect(terminalSize('999', 30, 300)).toBe(300)
    expect(terminalSize('nope', 30, 300)).toBe(30)
  })
})
