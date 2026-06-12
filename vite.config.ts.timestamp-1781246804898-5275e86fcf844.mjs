// vite.config.ts
import { defineConfig } from "file:///home/project/node_modules/vite/dist/node/index.js";
import react from "file:///home/project/node_modules/@vitejs/plugin-react/dist/index.js";
import { VitePWA } from "file:///home/project/node_modules/vite-plugin-pwa/dist/index.js";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: false,
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"]
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  optimizeDeps: {
    exclude: ["lucide-react"]
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) return "vendor-react";
          if (id.includes("react-router")) return "vendor-router";
          if (id.includes("lucide-react")) return "vendor-lucide";
          if (id.includes("flag-icons")) return "vendor-flags";
          if (id.includes("recharts") || id.includes("d3-") || id.includes("victory-vendor")) return "vendor-recharts";
          if (id.includes("/pages/admin/ModelLab") || id.includes("/lib/modelLab")) return "chunk-model-lab";
          if (id.includes("/pages/admin/tahmin-motoru/")) return "chunk-admin-brain";
          if (id.includes("/pages/admin/Wc") || id.includes("/pages/admin/wc")) return "chunk-admin-wc";
          if (id.includes("/pages/admin/Kalibrasyon") || id.includes("/pages/admin/ModelStatus") || id.includes("/pages/admin/LaunchReadiness")) return "chunk-admin-kalibrasyon";
          if (id.includes("/pages/admin/Operations") || id.includes("/pages/admin/DailyMonitor") || id.includes("/pages/admin/PreMatch") || id.includes("/pages/admin/OperasyonDongusu") || id.includes("/pages/admin/LiveMicroSim") || id.includes("/pages/admin/ProviderHealth")) return "chunk-admin-ops";
          if (id.includes("/pages/admin/") || id.includes("/pages/AdminPage")) return "chunk-admin";
          if (id.includes("/pages/archive/") || id.includes("/pages/ArchivePage")) return "chunk-archive";
          if (id.includes("/pages/legal/")) return "chunk-legal";
          if (id.includes("/pages/next59/")) return "chunk-next59";
          if (id.includes("/pages/futbol-analitigi/")) return "chunk-analytics";
          if (id.includes("/pages/WorldCup") || id.includes("/pages/Wc") || id.includes("/data/worldCup")) return "chunk-worldcup";
        }
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9wcm9qZWN0XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9wcm9qZWN0L3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3Byb2plY3Qvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgeyBWaXRlUFdBIH0gZnJvbSAndml0ZS1wbHVnaW4tcHdhJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW1xuICAgIHJlYWN0KCksXG4gICAgVml0ZVBXQSh7XG4gICAgICBzdHJhdGVnaWVzOiAnaW5qZWN0TWFuaWZlc3QnLFxuICAgICAgc3JjRGlyOiAnc3JjJyxcbiAgICAgIGZpbGVuYW1lOiAnc3cudHMnLFxuICAgICAgcmVnaXN0ZXJUeXBlOiAnYXV0b1VwZGF0ZScsXG4gICAgICBpbmplY3RSZWdpc3RlcjogJ2F1dG8nLFxuICAgICAgbWFuaWZlc3Q6IGZhbHNlLFxuICAgICAgaW5qZWN0TWFuaWZlc3Q6IHtcbiAgICAgICAgZ2xvYlBhdHRlcm5zOiBbJyoqLyoue2pzLGNzcyxodG1sLGljbyxwbmcsc3ZnLHdvZmYyfSddLFxuICAgICAgfSxcbiAgICAgIGRldk9wdGlvbnM6IHtcbiAgICAgICAgZW5hYmxlZDogZmFsc2UsXG4gICAgICB9LFxuICAgIH0pLFxuICBdLFxuICBvcHRpbWl6ZURlcHM6IHtcbiAgICBleGNsdWRlOiBbJ2x1Y2lkZS1yZWFjdCddLFxuICB9LFxuICBidWlsZDoge1xuICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgIG91dHB1dDoge1xuICAgICAgICBtYW51YWxDaHVua3MoaWQpIHtcbiAgICAgICAgICAvLyBWZW5kb3I6IHN1cGFiYXNlIGNsaWVudFxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnQHN1cGFiYXNlJykpIHJldHVybiAndmVuZG9yLXN1cGFiYXNlJztcbiAgICAgICAgICAvLyBWZW5kb3I6IHJlYWN0ICsgcmVhY3QtZG9tXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdub2RlX21vZHVsZXMvcmVhY3QvJykgfHwgaWQuaW5jbHVkZXMoJ25vZGVfbW9kdWxlcy9yZWFjdC1kb20vJykpIHJldHVybiAndmVuZG9yLXJlYWN0JztcbiAgICAgICAgICAvLyBWZW5kb3I6IHJlYWN0LXJvdXRlclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygncmVhY3Qtcm91dGVyJykpIHJldHVybiAndmVuZG9yLXJvdXRlcic7XG4gICAgICAgICAgLy8gVmVuZG9yOiBsdWNpZGUgaWNvbnNcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ2x1Y2lkZS1yZWFjdCcpKSByZXR1cm4gJ3ZlbmRvci1sdWNpZGUnO1xuICAgICAgICAgIC8vIFZlbmRvcjogZmxhZy1pY29ucyBDU1NcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ2ZsYWctaWNvbnMnKSkgcmV0dXJuICd2ZW5kb3ItZmxhZ3MnO1xuICAgICAgICAgIC8vIFZlbmRvcjogcmVjaGFydHMgKHVzZWQgaW4gbWFueSBhZG1pbiBwYWdlcyBcdTIwMTQgaXNvbGF0ZSB0byBhdm9pZCBkdXBsaWNhdGlvbilcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ3JlY2hhcnRzJykgfHwgaWQuaW5jbHVkZXMoJ2QzLScpIHx8IGlkLmluY2x1ZGVzKCd2aWN0b3J5LXZlbmRvcicpKSByZXR1cm4gJ3ZlbmRvci1yZWNoYXJ0cyc7XG4gICAgICAgICAgLy8gTW9kZWwgTGFiIFx1MjAxNCBoZWF2eSBkYXRhIHBhZ2VzIChtdXN0IGNvbWUgYmVmb3JlIGFkbWluIGNhdGNoLWFsbClcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJy9wYWdlcy9hZG1pbi9Nb2RlbExhYicpIHx8IGlkLmluY2x1ZGVzKCcvbGliL21vZGVsTGFiJykpIHJldHVybiAnY2h1bmstbW9kZWwtbGFiJztcbiAgICAgICAgICAvLyBUYWhtaW4gbW90b3J1IC8gYnJhaW4gc3ViLXBhZ2VzXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCcvcGFnZXMvYWRtaW4vdGFobWluLW1vdG9ydS8nKSkgcmV0dXJuICdjaHVuay1hZG1pbi1icmFpbic7XG4gICAgICAgICAgLy8gV0MgMjAyNiBhZG1pbiBwYWdlc1xuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnL3BhZ2VzL2FkbWluL1djJykgfHwgaWQuaW5jbHVkZXMoJy9wYWdlcy9hZG1pbi93YycpKSByZXR1cm4gJ2NodW5rLWFkbWluLXdjJztcbiAgICAgICAgICAvLyBLYWxpYnJhc3lvbiAvIG1vZGVsIHN0YXR1cyBwYWdlc1xuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnL3BhZ2VzL2FkbWluL0thbGlicmFzeW9uJykgfHwgaWQuaW5jbHVkZXMoJy9wYWdlcy9hZG1pbi9Nb2RlbFN0YXR1cycpIHx8IGlkLmluY2x1ZGVzKCcvcGFnZXMvYWRtaW4vTGF1bmNoUmVhZGluZXNzJykpIHJldHVybiAnY2h1bmstYWRtaW4ta2FsaWJyYXN5b24nO1xuICAgICAgICAgIC8vIE9wcyAvIGxpdmUgZW5naW5lIHBhZ2VzXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCcvcGFnZXMvYWRtaW4vT3BlcmF0aW9ucycpIHx8IGlkLmluY2x1ZGVzKCcvcGFnZXMvYWRtaW4vRGFpbHlNb25pdG9yJykgfHwgaWQuaW5jbHVkZXMoJy9wYWdlcy9hZG1pbi9QcmVNYXRjaCcpIHx8IGlkLmluY2x1ZGVzKCcvcGFnZXMvYWRtaW4vT3BlcmFzeW9uRG9uZ3VzdScpIHx8IGlkLmluY2x1ZGVzKCcvcGFnZXMvYWRtaW4vTGl2ZU1pY3JvU2ltJykgfHwgaWQuaW5jbHVkZXMoJy9wYWdlcy9hZG1pbi9Qcm92aWRlckhlYWx0aCcpKSByZXR1cm4gJ2NodW5rLWFkbWluLW9wcyc7XG4gICAgICAgICAgLy8gUmVtYWluaW5nIGFkbWluIHBhZ2VzXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCcvcGFnZXMvYWRtaW4vJykgfHwgaWQuaW5jbHVkZXMoJy9wYWdlcy9BZG1pblBhZ2UnKSkgcmV0dXJuICdjaHVuay1hZG1pbic7XG4gICAgICAgICAgLy8gQXJjaGl2ZSBwYWdlc1xuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnL3BhZ2VzL2FyY2hpdmUvJykgfHwgaWQuaW5jbHVkZXMoJy9wYWdlcy9BcmNoaXZlUGFnZScpKSByZXR1cm4gJ2NodW5rLWFyY2hpdmUnO1xuICAgICAgICAgIC8vIExlZ2FsIHBhZ2VzXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCcvcGFnZXMvbGVnYWwvJykpIHJldHVybiAnY2h1bmstbGVnYWwnO1xuICAgICAgICAgIC8vIE5leHQ1OSBhYm91dCBwYWdlc1xuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnL3BhZ2VzL25leHQ1OS8nKSkgcmV0dXJuICdjaHVuay1uZXh0NTknO1xuICAgICAgICAgIC8vIEZ1dGJvbCBhbmFsaXRpZ2lcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJy9wYWdlcy9mdXRib2wtYW5hbGl0aWdpLycpKSByZXR1cm4gJ2NodW5rLWFuYWx5dGljcyc7XG4gICAgICAgICAgLy8gV29ybGQgQ3VwIHBhZ2VzXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCcvcGFnZXMvV29ybGRDdXAnKSB8fCBpZC5pbmNsdWRlcygnL3BhZ2VzL1djJykgfHwgaWQuaW5jbHVkZXMoJy9kYXRhL3dvcmxkQ3VwJykpIHJldHVybiAnY2h1bmstd29ybGRjdXAnO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICB9LFxufSk7XG4iXSwKICAibWFwcGluZ3Mi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
