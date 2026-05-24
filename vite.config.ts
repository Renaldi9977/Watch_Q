import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      include: ['events', 'process', 'util', 'stream', 'buffer'],
      globals: {
        global: true,
        process: true,
        Buffer: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    // Vite 6: boolean true, bukan string 'all'
    allowedHosts: true,
    hmr: {
      // Replit akses dari luar lewat HTTPS port 443
      clientPort: 443,
    },
    open: false,
    watch: process.env.DISABLE_HMR === 'true'
      ? null
      : {
          // Hanya pantau folder src — abaikan file internal Replit
          // (.local, .cache, dll) yang terus berubah & bikin halaman
          // reload sendiri berkali-kali
          ignored: [
            '**/.local/**',
            '**/.cache/**',
            '**/node_modules/**',
            '**/.replit/**',
            '**/replit_zip_error_log.txt',
            '**/.config/**',
            '**/dist/**',
            '**/uploads/**',
          ],
        },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-core': ['react', 'react-dom'],
          'router': ['react-router-dom'],
          'socket': ['socket.io-client'],
          'webrtc': ['simple-peer'],
          'youtube': ['react-youtube'],
          'motion': ['motion'],
          'zustand': ['zustand'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
    target: 'es2018',
    minify: 'terser',
  },
});
