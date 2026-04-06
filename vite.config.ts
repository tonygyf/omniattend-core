import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react({ jsxRuntime: 'automatic' }), tailwindcss()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) return;

              // Split by dependency family to keep vendor chunks cacheable and below warning threshold.
              if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/scheduler/')) {
                return 'react-core';
              }
              if (id.includes('/node_modules/lucide-react/')) return 'icons';
              if (id.includes('/node_modules/recharts/')) return 'recharts';
              if (id.includes('/node_modules/framer-motion/')) return 'motion';
              if (id.includes('/node_modules/@google/genai/')) return 'ai-sdk';
              if (
                id.includes('/node_modules/react-markdown/') ||
                id.includes('/node_modules/remark-') ||
                id.includes('/node_modules/rehype-') ||
                id.includes('/node_modules/unified/') ||
                id.includes('/node_modules/micromark/')
              ) {
                return 'markdown';
              }
              if (id.includes('@tensorflow/tfjs') || id.includes('@tensorflow/tfjs-tflite')) return 'tfjs';
              return 'vendor-misc';
            }
          }
        }
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
