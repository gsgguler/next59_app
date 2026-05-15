import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      manifest: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vendor: supabase client
          if (id.includes('@supabase')) return 'vendor-supabase';
          // Vendor: react + react-dom
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return 'vendor-react';
          // Vendor: react-router
          if (id.includes('react-router')) return 'vendor-router';
          // Vendor: lucide icons
          if (id.includes('lucide-react')) return 'vendor-lucide';
          // Vendor: flag-icons CSS
          if (id.includes('flag-icons')) return 'vendor-flags';
          // Admin pages — large operational views
          if (id.includes('/pages/admin/') || id.includes('/pages/AdminPage')) return 'chunk-admin';
          // Model Lab — heavy data pages
          if (id.includes('/pages/admin/ModelLab') || id.includes('/lib/modelLab')) return 'chunk-model-lab';
          // Archive pages
          if (id.includes('/pages/archive/') || id.includes('/pages/ArchivePage')) return 'chunk-archive';
          // Legal pages
          if (id.includes('/pages/legal/')) return 'chunk-legal';
          // Next59 about pages
          if (id.includes('/pages/next59/')) return 'chunk-next59';
          // Futbol analitigi
          if (id.includes('/pages/futbol-analitigi/')) return 'chunk-analytics';
          // World Cup pages
          if (id.includes('/pages/WorldCup') || id.includes('/pages/Wc') || id.includes('/data/worldCup')) return 'chunk-worldcup';
        },
      },
    },
  },
});
