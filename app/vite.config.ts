import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // TODO: point /api/app at the deployed BoxOut backend, not local Flask on :5000
  const boxoutBackend = env.VITE_BOXOUT_BACKEND_URL || 'http://127.0.0.1:5000'
  // WAITING BFF: dev-only proxy to the Simple Parts Flask stand-in; boundary-plan §3 routes the UI through the Platform BFF instead, so this rule is removed with the mock.
  const simplePartsBackend = env.VITE_SIMPLEPARTS_BACKEND_URL || 'http://127.0.0.1:5001'
  // WAITING BFF: dev-only proxy to the existing Plyworks Flask stand-in; workflow calls move to Platform BFF runs/actions/artifacts.
  const plyworksBackend = env.VITE_PLYWORKS_BACKEND_URL || 'http://127.0.0.1:5002'

  return {
    plugins: [react()],
    assetsInclude: ['**/*.wasm'],
    optimizeDeps: {
      exclude: ['rhino3dm'],
    },
    server: {
      proxy: {
        '/api/plyworks': {
          target: plyworksBackend,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/plyworks/, ''),
        },
        '/api/parts': {
          target: simplePartsBackend,
          changeOrigin: true,
          // UI uses /api/parts to avoid Concierge /api; Flask still serves /api/*.
          rewrite: (path) => path.replace(/^\/api\/parts/, '/api'),
        },
        '/api/app': {
          target: boxoutBackend,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/app/, ''),
        },
        '/api': 'http://127.0.0.1:8000',
      },
    },
  }
})
