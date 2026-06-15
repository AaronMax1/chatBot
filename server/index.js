import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rootDir = resolve(__dirname, '..')
const distDir = join(rootDir, 'dist')
const port = Number(process.env.PORT || 10000)
const upstreamBaseUrl = normalizeBaseUrl(process.env.UPSTREAM_BASE_URL || 'http://130.94.65.11:8317/v1')

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
}

function normalizeBaseUrl(value) {
  return value.trim().replace(/\/+$/, '')
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
  })
  response.end(JSON.stringify(payload))
}

function proxyToUpstream(request, response) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-max-age': '86400',
    })
    response.end()
    return
  }

  const incomingUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  const upstreamPath = incomingUrl.pathname.replace(/^\/v1/, '') || '/'
  const upstreamUrl = new URL(`${upstreamBaseUrl}${upstreamPath}${incomingUrl.search}`)
  const transport = upstreamUrl.protocol === 'https:' ? httpsRequest : httpRequest

  const headers = { ...request.headers, host: upstreamUrl.host }
  delete headers.connection
  delete headers['content-length']

  const upstreamRequest = transport({
    method: request.method,
    protocol: upstreamUrl.protocol,
    hostname: upstreamUrl.hostname,
    port: upstreamUrl.port,
    path: `${upstreamUrl.pathname}${upstreamUrl.search}`,
    headers,
  }, (upstreamResponse) => {
    const responseHeaders = {
      ...upstreamResponse.headers,
      'access-control-allow-origin': '*',
    }
    response.writeHead(upstreamResponse.statusCode || 502, responseHeaders)
    upstreamResponse.pipe(response)
  })

  upstreamRequest.on('error', (error) => {
    if (!response.headersSent) {
      sendJson(response, 502, { error: { message: `代理请求失败：${error.message}` } })
    } else {
      response.destroy(error)
    }
  })

  request.pipe(upstreamRequest)
}

function serveStatic(request, response) {
  const incomingUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  const requestedPath = decodeURIComponent(incomingUrl.pathname)
  const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, '')
  let filePath = join(distDir, safePath)

  if (!filePath.startsWith(distDir)) {
    sendJson(response, 403, { error: { message: 'Forbidden' } })
    return
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(distDir, 'index.html')
  }

  if (!existsSync(filePath)) {
    sendJson(response, 404, { error: { message: 'Build output not found. Run npm run build first.' } })
    return
  }

  const extension = extname(filePath)
  response.writeHead(200, {
    'content-type': contentTypes[extension] || 'application/octet-stream',
    'cache-control': extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  createReadStream(filePath).pipe(response)
}

const server = createServer((request, response) => {
  if ((request.url || '').startsWith('/v1/')) {
    proxyToUpstream(request, response)
    return
  }
  serveStatic(request, response)
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Assistant chat web listening on http://0.0.0.0:${port}`)
  console.log(`Proxying /v1/* to ${upstreamBaseUrl}/*`)
})
