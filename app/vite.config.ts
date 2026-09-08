import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // TODO: point /api/app at the deployed BoxOut backend, not local Flask on :5000
  const boxoutBackend = env.VITE_BOXOUT_BACKEND_URL || 'http://127.0.0.1:5000'

  return {
    plugins: [react()],
    assetsInclude: ['**/*.wasm'],
    optimizeDeps: {
      exclude: ['rhino3dm'],
    },
    server: {
      proxy: {
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
