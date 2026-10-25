import { createRequire } from 'node:module'
import { gunzipSync, gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { handler } = require('../../proxy/yandex-disk/index.js') as {
  handler: (event: Record<string, unknown>) => Promise<{
    statusCode: number
    headers: Record<string, string>
    body: string
    isBase64Encoded: boolean
  }>
}

const ORIGIN = 'https://roxz13.github.io'
const FILE_JSON = JSON.stringify({ projects: [{ id: 'p1', title: 'Книга' }] })

function post(body: unknown, origin: string | null = ORIGIN, extra: Record<string, unknown> = {}) {
  return {
    httpMethod: 'POST',
    headers: origin ? { ORIGIN: origin, 'Content-Type': 'text/plain' } : {},
    body: typeof body === 'string' ? body : JSON.stringify(body),
    isBase64Encoded: false,
    ...extra,
  }
}

/** Stubs fetch: first the Disk API answer with the link, then the download host answer. */
function stubDisk(opts: { link?: Response; file?: Response } = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).startsWith('https://cloud-api.yandex.net/')) {
      return opts.link ?? new Response(JSON.stringify({ href: 'https://downloader.disk.yandex.ru/disk/abc' }))
    }
    return opts.file ?? new Response(FILE_JSON)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('Yandex Disk proxy', () => {
  it('refuses a foreign origin without reading anything', async () => {
    const fetchMock = stubDisk()
    const res = await handler(post({ token: 't', path: 'app:/manuscript.json' }, 'https://evil.example'))
    expect(res.statusCode).toBe(403)
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a request with no origin', async () => {
    const fetchMock = stubDisk()
    const res = await handler(post({ token: 't', path: 'app:/manuscript.json' }, null))
    expect(res.statusCode).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers OPTIONS with 204 and CORS', async () => {
    const fetchMock = stubDisk()
    const res = await handler({ httpMethod: 'OPTIONS', headers: { origin: ORIGIN } })
    expect(res.statusCode).toBe(204)
    expect(res.headers['Access-Control-Allow-Origin']).toBe(ORIGIN)
    expect(res.headers.Vary).toBe('Origin')
    expect(res.headers['Access-Control-Allow-Methods']).toBe('POST, OPTIONS')
    expect(res.headers['Access-Control-Allow-Headers']).toBe('Content-Type')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a bad path with 400', async () => {
    const fetchMock = stubDisk()
    for (const path of ['disk:/secret.json', 'app:/../x', '/etc/passwd', undefined]) {
      const res = await handler(post({ token: 't', path }))
      expect(res.statusCode).toBe(400)
      expect(res.headers['Access-Control-Allow-Origin']).toBe(ORIGIN)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a missing token with 401', async () => {
    const fetchMock = stubDisk()
    const res = await handler(post({ path: 'app:/manuscript.json' }))
    expect(res.statusCode).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns the file as base64 gzip with CORS', async () => {
    const fetchMock = stubDisk()
    const res = await handler(post({ token: 'secret', path: 'app:/manuscript.json' }))
    expect(res.statusCode).toBe(200)
    expect(res.isBase64Encoded).toBe(true)
    expect(res.headers['Access-Control-Allow-Origin']).toBe(ORIGIN)
    expect(res.headers['Cache-Control']).toBe('no-store')
    expect(res.headers['Content-Type']).toBe('application/octet-stream')
    expect(gunzipSync(Buffer.from(res.body, 'base64')).toString('utf8')).toBe(FILE_JSON)
    // Both requests carry the token to Yandex, nobody else.
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect(calls[0][0]).toContain('path=app%3A%2Fmanuscript.json')
    for (const [, init] of calls) expect((init.headers as Record<string, string>).Authorization).toBe('OAuth secret')
  })

  it('accepts a base64 request body', async () => {
    stubDisk()
    const body = Buffer.from(JSON.stringify({ token: 't', path: 'app:/manuscript.json' })).toString('base64')
    const res = await handler(post(body, ORIGIN, { isBase64Encoded: true }))
    expect(res.statusCode).toBe(200)
  })

  it('passes an already gzipped file through unchanged', async () => {
    const gz = gzipSync(Buffer.from(FILE_JSON))
    stubDisk({ file: new Response(gz) })
    const res = await handler(post({ token: 't', path: 'app:/manuscript.json' }))
    expect(res.statusCode).toBe(200)
    expect(Buffer.from(res.body, 'base64').equals(gz)).toBe(true)
  })

  it('passes a Disk 404 through with CORS', async () => {
    stubDisk({ link: new Response('{}', { status: 404 }) })
    const res = await handler(post({ token: 't', path: 'app:/manuscript.json' }))
    expect(res.statusCode).toBe(404)
    expect(res.headers['Access-Control-Allow-Origin']).toBe(ORIGIN)
  })

  it('passes a Disk 401 through', async () => {
    stubDisk({ link: new Response('{}', { status: 401 }) })
    const res = await handler(post({ token: 'bad', path: 'app:/manuscript.json' }))
    expect(res.statusCode).toBe(401)
  })

  it('answers 502 when the link points to a foreign host', async () => {
    const fetchMock = stubDisk({ link: new Response(JSON.stringify({ href: 'https://evil.example/steal' })) })
    const res = await handler(post({ token: 't', path: 'app:/manuscript.json' }))
    expect(res.statusCode).toBe(502)
    expect(res.headers['Access-Control-Allow-Origin']).toBe(ORIGIN)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('answers 502 for a plain-http or look-alike host', async () => {
    for (const href of ['http://downloader.disk.yandex.ru/x', 'https://notyandex.ru/x', 'https://yandex.ru.evil.example/x']) {
      stubDisk({ link: new Response(JSON.stringify({ href })) })
      const res = await handler(post({ token: 't', path: 'app:/manuscript.json' }))
      expect(res.statusCode).toBe(502)
    }
  })
})
