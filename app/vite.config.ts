import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'

function mergeEnv(mode: string) {
  const appDir = process.cwd()
  const rootDir = path.resolve(appDir, '..')
  return {
    ...loadEnv(mode, rootDir, ''),
    ...loadEnv(mode, appDir, ''),
  }
}

function originOf(url: string) {
  return url.replace(/\/$/, '')
}

function basicAuthHeader(userPass: string | undefined) {
  if (!userPass?.includes(':')) return undefined
  return `Basic ${Buffer.from(userPass).toString('base64')}`
}

/** WAITING BFF: Flask stand-in proxy. Long timeout — hops/solve can run several minutes. */
function flaskProxy(
  target: string,
  rewrite: (path: string) => string,
  basicAuth?: string,
): ProxyOptions {
  const authorization = basicAuthHeader(basicAuth)
  return {
    target: originOf(target),
    changeOrigin: true,
    secure: target.startsWith('https'),
    rewrite,
    timeout: 300_000,
    proxyTimeout: 300_000,
    configure(proxy) {
      if (!authorization) return
      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.setHeader('Authorization', authorization)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = mergeEnv(mode)
  const local = mode !== 'remote'
  // WAITING BFF: these targets are Door Box-Out / Simple Parts / Plyworks Flask
  // stand-ins. Mode `remote` reads deployed origins from `.env.remote`.
  const boxoutBackend = env.VITE_BOXOUT_BACKEND_URL || 'http://127.0.0.1:5000'
  const simplePartsBackend = env.VITE_SIMPLEPARTS_BACKEND_URL || 'http://127.0.0.1:5001'
  const plyworksBackend = env.VITE_PLYWORKS_BACKEND_URL || 'http://127.0.0.1:5002'

  if (mode === 'remote') {
    for (const [name, value, fallback] of [
      ['VITE_BOXOUT_BACKEND_URL', env.VITE_BOXOUT_BACKEND_URL, 'http://127.0.0.1:5000'],
      ['VITE_SIMPLEPARTS_BACKEND_URL', env.VITE_SIMPLEPARTS_BACKEND_URL, 'http://127.0.0.1:5001'],
      ['VITE_PLYWORKS_BACKEND_URL', env.VITE_PLYWORKS_BACKEND_URL, 'http://127.0.0.1:5002'],
    ] as const) {
      if (!value) {
        console.warn(`[vite] remote mode: ${name} is unset — falling back to ${fallback}`)
      }
    }
  }

  console.info(
    `[vite] Flask stand-ins (${local ? 'local' : 'remote'}):`,
    `\n  boxouts     ${boxoutBackend}`,
    `\n  simpleparts ${simplePartsBackend}`,
    `\n  plyworks    ${plyworksBackend}`,
  )

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    assetsInclude: ['**/*.wasm'],
    optimizeDeps: {
      exclude: ['rhino3dm'],
    },
    server: {
      proxy: {
        '/api/plyworks': flaskProxy(
          plyworksBackend,
          (p) => {
            const rest = p.replace(/^\/api\/plyworks/, '') || '/'
            // Local Flask serves /produce. Deployed nginx only proxies /api/*
            // (POST /produce hits the SPA and returns 405).
            if (mode === 'remote') {
              return rest.startsWith('/api') ? rest : `/api${rest.startsWith('/') ? rest : `/${rest}`}`
            }
            return rest
          },
          env.PLYWORKS_BASIC_AUTH,
        ),
        '/api/parts': flaskProxy(
          simplePartsBackend,
          // UI uses /api/parts to avoid Concierge /api; Flask still serves /api/*.
          (p) => p.replace(/^\/api\/parts/, '/api'),
          env.SIMPLEPARTS_BASIC_AUTH,
        ),
        '/api/app': flaskProxy(
          boxoutBackend,
          (p) => p.replace(/^\/api\/app/, ''),
          env.BOXOUT_BASIC_AUTH,
        ),
        '/api': 'http://127.0.0.1:8000',
      },
    },
  }
})
