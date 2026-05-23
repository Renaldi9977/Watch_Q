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
    // Vite 6: gunakan `true` (boolean), bukan string 'all'
    allowedHosts: true,
    hmr: {
      clientPort: 443,
    },
    open: false,
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
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
