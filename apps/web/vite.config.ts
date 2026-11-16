import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    // In development the browser talks to Vite only; Vite forwards /api to
    // the NestJS server. Same origin, so the login cookie just works.
    proxy: { '/api': 'http://localhost:3000' },
  },
})
