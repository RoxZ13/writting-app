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

  try {
    let raw = event.body || ''
    if (event.isBase64Encoded) raw = Buffer.from(raw, 'base64').toString('utf8')
    let req
    try {
      req = JSON.parse(raw)
    } catch {
      return json(400, origin, { error: 'body' })
    }
    const token = req && typeof req.token === 'string' ? req.token.trim() : ''
    const path = req && typeof req.path === 'string' ? req.path : ''
    if (!path.startsWith('app:/') || path.includes('..')) return json(400, origin, { error: 'path' })
    if (!token) return json(401, origin, { error: 'token' })

    const auth = { Authorization: `OAuth ${token}` }
    const link = await fetch(`${API}/resources/download?path=${encodeURIComponent(path)}`, { headers: { ...auth, Accept: 'application/json' } })
    if (link.status === 401 || link.status === 403 || link.status === 404) return json(link.status, origin, { error: 'disk' })
    if (!link.ok) return json(502, origin, { error: 'disk' })
    const { href } = await link.json()
    if (typeof href !== 'string' || !isYandexHref(href)) return json(502, origin, { error: 'href' })

    const file = await fetch(href, { headers: auth, redirect: 'follow' })
    if (!file.ok) return json(file.status === 404 ? 404 : 502, origin, { error: 'download' })
    const bytes = Buffer.from(await file.arrayBuffer())
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
    return json(502, origin, { error: 'proxy' })
  }
}
