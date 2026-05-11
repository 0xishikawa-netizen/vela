import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'electron/main.ts'),
        output: {
          /**
           * fixture が `out/main/chunks/ffmpeg-*.js` だけを Node で import するため、
           * `src/lib/exportDiagnostics` を main 本体に吸わせない（main.js が electron を引き、Node で落ちるのを防ぐ）。
           */
          manualChunks(id) {
            if (id.includes(`${resolve(__dirname, 'src/lib/exportDiagnostics')}`)) {
              return 'export-diagnostics'
            }
            return undefined
          },
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'electron/preload.ts'),
      },
    },
  },
  renderer: {
    define: {
      'import.meta.env.VELA_WAVEFORM_DEBUG': JSON.stringify(process.env.VELA_WAVEFORM_DEBUG ?? ''),
    },
    root: __dirname,
    publicDir: 'public',
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    plugins: [react(), tailwindcss()],
    /** Claude worktree 等がプロジェクト内にあると HMR が連発するのを防ぐ */
    server: {
      watch: {
        ignored: ['**/.claude/**', '**/.git/objects/**'],
      },
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'index.html'),
      },
    },
  },
})
