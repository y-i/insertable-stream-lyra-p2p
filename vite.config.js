import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  resolve: {
    alias: {
      '/node_modules/.vite/deps/webassembly_codec_wrapper.wasm': '/node_modules/lyra-codec/src/wasm/webassembly_codec_wrapper.wasm'
    }
  }
})
