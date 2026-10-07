import { defineConfig } from 'vitest/config';
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420, strictPort: true, host: '127.0.0.1',
    // Exclude the local Windows SDK's recursive symlinks and generated files.
    watch: { ignored: ['**/.tools/**', '**/src-tauri/**', '**/artifacts/**'] },
  },
  build: { target: 'es2022' },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
