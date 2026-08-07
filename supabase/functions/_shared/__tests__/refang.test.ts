import { describe, expect, it } from 'vitest'
import { hasUrlScheme, refangBrackets, stripUrlScheme } from '../refang'

describe('refangBrackets', () => {
  it('resolves the punctuation-character forms', () => {
    expect(refangBrackets('178.16.54[.]109')).toBe('178.16.54.109')
    expect(refangBrackets('178.16.54(.)109')).toBe('178.16.54.109')
    expect(refangBrackets('178.16.54{.}109')).toBe('178.16.54.109')
    expect(refangBrackets('hxxp[:]//host')).toBe('hxxp://host')
    expect(refangBrackets('user[@]example.com')).toBe('user@example.com')
  })

  it('resolves the spelled-out forms', () => {
    expect(refangBrackets('example[dot]com')).toBe('example.com')
    expect(refangBrackets('example(dot)com')).toBe('example.com')
    expect(refangBrackets('user[at]example[dot]com')).toBe('user@example.com')
    expect(refangBrackets('hxxp[colon]//host')).toBe('hxxp://host')
  })

  it('is case insensitive and tolerates padding', () => {
    expect(refangBrackets('example[DOT]com')).toBe('example.com')
    expect(refangBrackets('example[ dot ]com')).toBe('example.com')
  })

  // The general rule earns its keep only if it does not corrupt ordinary text.
  it('leaves bracketed text that is not a defang token alone', () => {
    expect(refangBrackets('see [note] below')).toBe('see [note] below')
    expect(refangBrackets('[Figure 9] shows the model')).toBe('[Figure 9] shows the model')
    expect(refangBrackets('array[0] and map[key]')).toBe('array[0] and map[key]')
    expect(refangBrackets('a [markdown](https://link) here')).toBe('a [markdown](https://link) here')
  })
})

describe('stripUrlScheme', () => {
  it('drops live and defanged schemes alike', () => {
    expect(stripUrlScheme('http://178.16.54.109/st.exe')).toBe('178.16.54.109/st.exe')
    expect(stripUrlScheme('hxxp://178.16.54.109/st.exe')).toBe('178.16.54.109/st.exe')
    expect(stripUrlScheme('https://a.test/b')).toBe('a.test/b')
    expect(stripUrlScheme('wss://154.92.19.71:39989')).toBe('154.92.19.71:39989')
  })

  // The point of ignoring the scheme rather than enumerating hxxp/hxxps/fxp:
  // variants this module has never heard of are handled for free.
  it('drops schemes it has no specific knowledge of', () => {
    expect(stripUrlScheme('meow://host/path')).toBe('host/path')
    expect(stripUrlScheme('fxp://host/path')).toBe('host/path')
  })

  it('leaves non-URL indicators untouched', () => {
    expect(stripUrlScheme('178.16.54.109')).toBe('178.16.54.109')
    expect(stripUrlScheme('st.exe')).toBe('st.exe')
    expect(stripUrlScheme('user@example.com')).toBe('user@example.com')
  })

  it('reports whether a scheme is present', () => {
    expect(hasUrlScheme('hxxp://host')).toBe(true)
    expect(hasUrlScheme('178.16.54.109')).toBe(false)
    expect(hasUrlScheme('example.com/path')).toBe(false)
  })
})
