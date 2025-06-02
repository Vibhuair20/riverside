import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5173,
    // 👇 Add this line to allow your ngrok host
     
    allowedHosts: ['all', 'f0d6-2409-40c2-116-edd4-bd1b-8ebd-b955-b2f0.ngrok-free.app'],
    strictPort: false,
    origin: 'https://f0d6-2409-40c2-116-edd4-bd1b-8ebd-b955-b2f0.ngrok-free.app', // Helps with CORS
    cors: true,
 
  },
});
