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
      registerType: "prompt",
      injectRegister: false,
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
          if (id.includes("/pages/admin/") || id.includes("/pages/AdminPage")) return "chunk-admin";
          if (id.includes("/pages/admin/ModelLab") || id.includes("/lib/modelLab")) return "chunk-model-lab";
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9wcm9qZWN0XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9wcm9qZWN0L3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3Byb2plY3Qvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgeyBWaXRlUFdBIH0gZnJvbSAndml0ZS1wbHVnaW4tcHdhJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW1xuICAgIHJlYWN0KCksXG4gICAgVml0ZVBXQSh7XG4gICAgICBzdHJhdGVnaWVzOiAnaW5qZWN0TWFuaWZlc3QnLFxuICAgICAgc3JjRGlyOiAnc3JjJyxcbiAgICAgIGZpbGVuYW1lOiAnc3cudHMnLFxuICAgICAgcmVnaXN0ZXJUeXBlOiAncHJvbXB0JyxcbiAgICAgIGluamVjdFJlZ2lzdGVyOiBmYWxzZSxcbiAgICAgIG1hbmlmZXN0OiBmYWxzZSxcbiAgICAgIGluamVjdE1hbmlmZXN0OiB7XG4gICAgICAgIGdsb2JQYXR0ZXJuczogWycqKi8qLntqcyxjc3MsaHRtbCxpY28scG5nLHN2Zyx3b2ZmMn0nXSxcbiAgICAgIH0sXG4gICAgICBkZXZPcHRpb25zOiB7XG4gICAgICAgIGVuYWJsZWQ6IGZhbHNlLFxuICAgICAgfSxcbiAgICB9KSxcbiAgXSxcbiAgb3B0aW1pemVEZXBzOiB7XG4gICAgZXhjbHVkZTogWydsdWNpZGUtcmVhY3QnXSxcbiAgfSxcbiAgYnVpbGQ6IHtcbiAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICBvdXRwdXQ6IHtcbiAgICAgICAgbWFudWFsQ2h1bmtzKGlkKSB7XG4gICAgICAgICAgLy8gVmVuZG9yOiBzdXBhYmFzZSBjbGllbnRcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ0BzdXBhYmFzZScpKSByZXR1cm4gJ3ZlbmRvci1zdXBhYmFzZSc7XG4gICAgICAgICAgLy8gVmVuZG9yOiByZWFjdCArIHJlYWN0LWRvbVxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnbm9kZV9tb2R1bGVzL3JlYWN0LycpIHx8IGlkLmluY2x1ZGVzKCdub2RlX21vZHVsZXMvcmVhY3QtZG9tLycpKSByZXR1cm4gJ3ZlbmRvci1yZWFjdCc7XG4gICAgICAgICAgLy8gVmVuZG9yOiByZWFjdC1yb3V0ZXJcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ3JlYWN0LXJvdXRlcicpKSByZXR1cm4gJ3ZlbmRvci1yb3V0ZXInO1xuICAgICAgICAgIC8vIFZlbmRvcjogbHVjaWRlIGljb25zXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdsdWNpZGUtcmVhY3QnKSkgcmV0dXJuICd2ZW5kb3ItbHVjaWRlJztcbiAgICAgICAgICAvLyBWZW5kb3I6IGZsYWctaWNvbnMgQ1NTXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdmbGFnLWljb25zJykpIHJldHVybiAndmVuZG9yLWZsYWdzJztcbiAgICAgICAgICAvLyBBZG1pbiBwYWdlcyBcdTIwMTQgbGFyZ2Ugb3BlcmF0aW9uYWwgdmlld3NcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJy9wYWdlcy9hZG1pbi8nKSB8fCBpZC5pbmNsdWRlcygnL3BhZ2VzL0FkbWluUGFnZScpKSByZXR1cm4gJ2NodW5rLWFkbWluJztcbiAgICAgICAgICAvLyBNb2RlbCBMYWIgXHUyMDE0IGhlYXZ5IGRhdGEgcGFnZXNcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJy9wYWdlcy9hZG1pbi9Nb2RlbExhYicpIHx8IGlkLmluY2x1ZGVzKCcvbGliL21vZGVsTGFiJykpIHJldHVybiAnY2h1bmstbW9kZWwtbGFiJztcbiAgICAgICAgICAvLyBBcmNoaXZlIHBhZ2VzXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCcvcGFnZXMvYXJjaGl2ZS8nKSB8fCBpZC5pbmNsdWRlcygnL3BhZ2VzL0FyY2hpdmVQYWdlJykpIHJldHVybiAnY2h1bmstYXJjaGl2ZSc7XG4gICAgICAgICAgLy8gTGVnYWwgcGFnZXNcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJy9wYWdlcy9sZWdhbC8nKSkgcmV0dXJuICdjaHVuay1sZWdhbCc7XG4gICAgICAgICAgLy8gTmV4dDU5IGFib3V0IHBhZ2VzXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCcvcGFnZXMvbmV4dDU5LycpKSByZXR1cm4gJ2NodW5rLW5leHQ1OSc7XG4gICAgICAgICAgLy8gRnV0Ym9sIGFuYWxpdGlnaVxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnL3BhZ2VzL2Z1dGJvbC1hbmFsaXRpZ2kvJykpIHJldHVybiAnY2h1bmstYW5hbHl0aWNzJztcbiAgICAgICAgICAvLyBXb3JsZCBDdXAgcGFnZXNcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJy9wYWdlcy9Xb3JsZEN1cCcpIHx8IGlkLmluY2x1ZGVzKCcvcGFnZXMvV2MnKSB8fCBpZC5pbmNsdWRlcygnL2RhdGEvd29ybGRDdXAnKSkgcmV0dXJuICdjaHVuay13b3JsZGN1cCc7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBeU4sU0FBUyxvQkFBb0I7QUFDdFAsT0FBTyxXQUFXO0FBQ2xCLFNBQVMsZUFBZTtBQUV4QixJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTO0FBQUEsSUFDUCxNQUFNO0FBQUEsSUFDTixRQUFRO0FBQUEsTUFDTixZQUFZO0FBQUEsTUFDWixRQUFRO0FBQUEsTUFDUixVQUFVO0FBQUEsTUFDVixjQUFjO0FBQUEsTUFDZCxnQkFBZ0I7QUFBQSxNQUNoQixVQUFVO0FBQUEsTUFDVixnQkFBZ0I7QUFBQSxRQUNkLGNBQWMsQ0FBQyxzQ0FBc0M7QUFBQSxNQUN2RDtBQUFBLE1BQ0EsWUFBWTtBQUFBLFFBQ1YsU0FBUztBQUFBLE1BQ1g7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQSxjQUFjO0FBQUEsSUFDWixTQUFTLENBQUMsY0FBYztBQUFBLEVBQzFCO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTCxlQUFlO0FBQUEsTUFDYixRQUFRO0FBQUEsUUFDTixhQUFhLElBQUk7QUFFZixjQUFJLEdBQUcsU0FBUyxXQUFXLEVBQUcsUUFBTztBQUVyQyxjQUFJLEdBQUcsU0FBUyxxQkFBcUIsS0FBSyxHQUFHLFNBQVMseUJBQXlCLEVBQUcsUUFBTztBQUV6RixjQUFJLEdBQUcsU0FBUyxjQUFjLEVBQUcsUUFBTztBQUV4QyxjQUFJLEdBQUcsU0FBUyxjQUFjLEVBQUcsUUFBTztBQUV4QyxjQUFJLEdBQUcsU0FBUyxZQUFZLEVBQUcsUUFBTztBQUV0QyxjQUFJLEdBQUcsU0FBUyxlQUFlLEtBQUssR0FBRyxTQUFTLGtCQUFrQixFQUFHLFFBQU87QUFFNUUsY0FBSSxHQUFHLFNBQVMsdUJBQXVCLEtBQUssR0FBRyxTQUFTLGVBQWUsRUFBRyxRQUFPO0FBRWpGLGNBQUksR0FBRyxTQUFTLGlCQUFpQixLQUFLLEdBQUcsU0FBUyxvQkFBb0IsRUFBRyxRQUFPO0FBRWhGLGNBQUksR0FBRyxTQUFTLGVBQWUsRUFBRyxRQUFPO0FBRXpDLGNBQUksR0FBRyxTQUFTLGdCQUFnQixFQUFHLFFBQU87QUFFMUMsY0FBSSxHQUFHLFNBQVMsMEJBQTBCLEVBQUcsUUFBTztBQUVwRCxjQUFJLEdBQUcsU0FBUyxpQkFBaUIsS0FBSyxHQUFHLFNBQVMsV0FBVyxLQUFLLEdBQUcsU0FBUyxnQkFBZ0IsRUFBRyxRQUFPO0FBQUEsUUFDMUc7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
