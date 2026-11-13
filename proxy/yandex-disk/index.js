'use strict'

/**
 * Read-only proxy for the author's sync file on Yandex Disk (Yandex Cloud Function, Node.js 22).
 *
 * Why: the browser cannot download from downloader.disk.yandex.ru (403, no CORS headers). This
 * function asks the Disk API for the download link, fetches the file on the server and hands it
 * back with CORS headers. It stores nothing and logs neither the token nor the file.
 *
 * Request:  POST, body (text/plain, so the browser sends no preflight) = JSON { token, path }.
 * Response: 200 with the file as gzip, base64 in the HTTP event.
 */

const zlib = require('node:zlib')

const API = 'https://cloud-api.yandex.net/v1/disk'
const DEFAULT_ORIGINS = 'https://roxz13.github.io,http://localhost:5173,http://localhost:4173'
const MAX_REQUEST_BYTES = positiveInt('MAX_REQUEST_BYTES', 16 * 1024)
const MAX_FILE_BYTES = positiveInt('MAX_FILE_BYTES', 50 * 1024 * 1024)
const REQUEST_TIMEOUT_MS = positiveInt('REQUEST_TIMEOUT_MS', 20_000)

class TooLargeError extends Error {}

function positiveInt(name, fallback) {
  const value = Number(process.env[name])
  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}

function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function lowerKeys(headers) {
  const out = {}
  for (const [k, v] of Object.entries(headers || {})) out[k.toLowerCase()] = Array.isArray(v) ? v[0] : v
  return out
}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function json(statusCode, origin, payload) {
  return {
    statusCode,
    headers: { ...cors(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(payload),
    isBase64Encoded: false,
  }
}

function isYandexHref(href) {
  try {
    const u = new URL(href)
    return u.protocol === 'https:' && (u.hostname.endsWith('.yandex.ru') || u.hostname.endsWith('.yandex.net'))
  } catch {
    return false
  }
}

/** Read at most max bytes even when the download host omits Content-Length. */
async function readLimited(response, max) {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > max) throw new TooLargeError('file')
  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > max) throw new TooLargeError('file')
    return bytes
  }
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > max) throw new TooLargeError('file')
      chunks.push(Buffer.from(value))
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  }
  return Buffer.concat(chunks, total)
}

module.exports.handler = async (event) => {
  const headers = lowerKeys(event && event.headers)
  const origin = headers.origin
  if (!origin || !allowedOrigins().includes(origin)) {
    return { statusCode: 403, headers: { 'Content-Type': 'application/json' }, body: '{"error":"origin"}', isBase64Encoded: false }
  }
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors(origin), body: '', isBase64Encoded: false }
  }
  if (event.httpMethod !== 'POST') return json(405, origin, { error: 'method' })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    let raw = event.body || ''
    if (typeof raw !== 'string') return json(400, origin, { error: 'body' })
    if (event.isBase64Encoded) {
      if (raw.length > Math.ceil(MAX_REQUEST_BYTES * 4 / 3) + 4) return json(413, origin, { error: 'request-too-large' })
      const decoded = Buffer.from(raw, 'base64')
      if (decoded.length > MAX_REQUEST_BYTES) return json(413, origin, { error: 'request-too-large' })
      raw = decoded.toString('utf8')
    } else if (Buffer.byteLength(raw, 'utf8') > MAX_REQUEST_BYTES) {
      return json(413, origin, { error: 'request-too-large' })
    }
    let req
    try {
      req = JSON.parse(raw)
    } catch {
      return json(400, origin, { error: 'body' })
    }
    const token = req && typeof req.token === 'string' ? req.token.trim() : ''
    const path = req && typeof req.path === 'string' ? req.path : ''
    if (path.length > 1024 || !path.startsWith('app:/') || path.includes('..')) return json(400, origin, { error: 'path' })
    if (!token || token.length > 4096) return json(401, origin, { error: 'token' })

    const auth = { Authorization: `OAuth ${token}` }
    const link = await fetch(`${API}/resources/download?path=${encodeURIComponent(path)}`, {
      headers: { ...auth, Accept: 'application/json' },
      signal: controller.signal,
    })
    if (link.status === 401 || link.status === 403 || link.status === 404) return json(link.status, origin, { error: 'disk' })
    if (!link.ok) return json(502, origin, { error: 'disk' })
    const { href } = await link.json()
    if (typeof href !== 'string' || !isYandexHref(href)) return json(502, origin, { error: 'href' })

    const file = await fetch(href, { headers: auth, redirect: 'follow', signal: controller.signal })
    if (!file.ok) return json(file.status === 404 ? 404 : 502, origin, { error: 'download' })
    const bytes = await readLimited(file, MAX_FILE_BYTES)
    const gz = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b ? bytes : zlib.gzipSync(bytes)
    return {
      statusCode: 200,
      headers: { ...cors(origin), 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' },
      body: gz.toString('base64'),
      isBase64Encoded: true,
    }
  } catch (e) {
    // Only the error class: never the token or the content.
    console.error(e && e.constructor ? e.constructor.name : 'Error')
    if (e instanceof TooLargeError) return json(413, origin, { error: 'file-too-large' })
    if (e && e.name === 'AbortError') return json(504, origin, { error: 'timeout' })
    return json(502, origin, { error: 'proxy' })
  } finally {
    clearTimeout(timeout)
  }
}
