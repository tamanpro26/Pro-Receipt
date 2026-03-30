import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { config } from 'dotenv';
import path from 'path';
import { defineConfig } from 'vite';

// Load .env.example so API keys are available at build/dev time
config({ path: '.env.example' });

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  define: {
    // Bake the OpenAI key into the frontend bundle (safe for personal/demo use)
    'process.env.OPENAI_API_KEY': JSON.stringify(process.env.OPENAI_API_KEY ?? ''),
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    proxy: { '/api': 'http://localhost:3001' },
  },
}));
