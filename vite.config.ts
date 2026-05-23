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
    // Izinkan semua host — wajib untuk Replit proxy
    allowedHosts: 'all',
    hmr: {
      // Replit pakai HTTPS (port 443) untuk akses dari luar
      clientPort: 443,
    },
    // Jangan buka browser otomatis di server
    open: false,
    // Matikan file watching saat DISABLE_HMR aktif (AI Studio compat)
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
  build: {
    // Pecah bundle agar chunk lebih kecil — browser bisa cache per chunk
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
