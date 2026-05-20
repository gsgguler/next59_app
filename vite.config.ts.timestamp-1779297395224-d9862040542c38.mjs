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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9wcm9qZWN0XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9wcm9qZWN0L3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3Byb2plY3Qvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgeyBWaXRlUFdBIH0gZnJvbSAndml0ZS1wbHVnaW4tcHdhJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW1xuICAgIHJlYWN0KCksXG4gICAgVml0ZVBXQSh7XG4gICAgICBzdHJhdGVnaWVzOiAnaW5qZWN0TWFuaWZlc3QnLFxuICAgICAgc3JjRGlyOiAnc3JjJyxcbiAgICAgIGZpbGVuYW1lOiAnc3cudHMnLFxuICAgICAgcmVnaXN0ZXJUeXBlOiAnYXV0b1VwZGF0ZScsXG4gICAgICBpbmplY3RSZWdpc3RlcjogJ2F1dG8nLFxuICAgICAgbWFuaWZlc3Q6IGZhbHNlLFxuICAgICAgaW5qZWN0TWFuaWZlc3Q6IHtcbiAgICAgICAgZ2xvYlBhdHRlcm5zOiBbJyoqLyoue2pzLGNzcyxodG1sLGljbyxwbmcsc3ZnLHdvZmYyfSddLFxuICAgICAgfSxcbiAgICAgIGRldk9wdGlvbnM6IHtcbiAgICAgICAgZW5hYmxlZDogZmFsc2UsXG4gICAgICB9LFxuICAgIH0pLFxuICBdLFxuICBvcHRpbWl6ZURlcHM6IHtcbiAgICBleGNsdWRlOiBbJ2x1Y2lkZS1yZWFjdCddLFxuICB9LFxuICBidWlsZDoge1xuICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgIG91dHB1dDoge1xuICAgICAgICBtYW51YWxDaHVua3MoaWQpIHtcbiAgICAgICAgICAvLyBWZW5kb3I6IHN1cGFiYXNlIGNsaWVudFxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnQHN1cGFiYXNlJykpIHJldHVybiAndmVuZG9yLXN1cGFiYXNlJztcbiAgICAgICAgICAvLyBWZW5kb3I6IHJlYWN0ICsgcmVhY3QtZG9tXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdub2RlX21vZHVsZXMvcmVhY3QvJykgfHwgaWQuaW5jbHVkZXMoJ25vZGVfbW9kdWxlcy9yZWFjdC1kb20vJykpIHJldHVybiAndmVuZG9yLXJlYWN0JztcbiAgICAgICAgICAvLyBWZW5kb3I6IHJlYWN0LXJvdXRlclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygncmVhY3Qtcm91dGVyJykpIHJldHVybiAndmVuZG9yLXJvdXRlcic7XG4gICAgICAgICAgLy8gVmVuZG9yOiBsdWNpZGUgaWNvbnNcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ2x1Y2lkZS1yZWFjdCcpKSByZXR1cm4gJ3ZlbmRvci1sdWNpZGUnO1xuICAgICAgICAgIC8vIFZlbmRvcjogZmxhZy1pY29ucyBDU1NcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ2ZsYWctaWNvbnMnKSkgcmV0dXJuICd2ZW5kb3ItZmxhZ3MnO1xuICAgICAgICAgIC8vIEFkbWluIHBhZ2VzIFx1MjAxNCBsYXJnZSBvcGVyYXRpb25hbCB2aWV3c1xuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnL3BhZ2VzL2FkbWluLycpIHx8IGlkLmluY2x1ZGVzKCcvcGFnZXMvQWRtaW5QYWdlJykpIHJldHVybiAnY2h1bmstYWRtaW4nO1xuICAgICAgICAgIC8vIE1vZGVsIExhYiBcdTIwMTQgaGVhdnkgZGF0YSBwYWdlc1xuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnL3BhZ2VzL2FkbWluL01vZGVsTGFiJykgfHwgaWQuaW5jbHVkZXMoJy9saWIvbW9kZWxMYWInKSkgcmV0dXJuICdjaHVuay1tb2RlbC1sYWInO1xuICAgICAgICAgIC8vIEFyY2hpdmUgcGFnZXNcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJy9wYWdlcy9hcmNoaXZlLycpIHx8IGlkLmluY2x1ZGVzKCcvcGFnZXMvQXJjaGl2ZVBhZ2UnKSkgcmV0dXJuICdjaHVuay1hcmNoaXZlJztcbiAgICAgICAgICAvLyBMZWdhbCBwYWdlc1xuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnL3BhZ2VzL2xlZ2FsLycpKSByZXR1cm4gJ2NodW5rLWxlZ2FsJztcbiAgICAgICAgICAvLyBOZXh0NTkgYWJvdXQgcGFnZXNcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJy9wYWdlcy9uZXh0NTkvJykpIHJldHVybiAnY2h1bmstbmV4dDU5JztcbiAgICAgICAgICAvLyBGdXRib2wgYW5hbGl0aWdpXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCcvcGFnZXMvZnV0Ym9sLWFuYWxpdGlnaS8nKSkgcmV0dXJuICdjaHVuay1hbmFseXRpY3MnO1xuICAgICAgICAgIC8vIFdvcmxkIEN1cCBwYWdlc1xuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnL3BhZ2VzL1dvcmxkQ3VwJykgfHwgaWQuaW5jbHVkZXMoJy9wYWdlcy9XYycpIHx8IGlkLmluY2x1ZGVzKCcvZGF0YS93b3JsZEN1cCcpKSByZXR1cm4gJ2NodW5rLXdvcmxkY3VwJztcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUF5TixTQUFTLG9CQUFvQjtBQUN0UCxPQUFPLFdBQVc7QUFDbEIsU0FBUyxlQUFlO0FBRXhCLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLFFBQVE7QUFBQSxNQUNOLFlBQVk7QUFBQSxNQUNaLFFBQVE7QUFBQSxNQUNSLFVBQVU7QUFBQSxNQUNWLGNBQWM7QUFBQSxNQUNkLGdCQUFnQjtBQUFBLE1BQ2hCLFVBQVU7QUFBQSxNQUNWLGdCQUFnQjtBQUFBLFFBQ2QsY0FBYyxDQUFDLHNDQUFzQztBQUFBLE1BQ3ZEO0FBQUEsTUFDQSxZQUFZO0FBQUEsUUFDVixTQUFTO0FBQUEsTUFDWDtBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBLGNBQWM7QUFBQSxJQUNaLFNBQVMsQ0FBQyxjQUFjO0FBQUEsRUFDMUI7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLGVBQWU7QUFBQSxNQUNiLFFBQVE7QUFBQSxRQUNOLGFBQWEsSUFBSTtBQUVmLGNBQUksR0FBRyxTQUFTLFdBQVcsRUFBRyxRQUFPO0FBRXJDLGNBQUksR0FBRyxTQUFTLHFCQUFxQixLQUFLLEdBQUcsU0FBUyx5QkFBeUIsRUFBRyxRQUFPO0FBRXpGLGNBQUksR0FBRyxTQUFTLGNBQWMsRUFBRyxRQUFPO0FBRXhDLGNBQUksR0FBRyxTQUFTLGNBQWMsRUFBRyxRQUFPO0FBRXhDLGNBQUksR0FBRyxTQUFTLFlBQVksRUFBRyxRQUFPO0FBRXRDLGNBQUksR0FBRyxTQUFTLGVBQWUsS0FBSyxHQUFHLFNBQVMsa0JBQWtCLEVBQUcsUUFBTztBQUU1RSxjQUFJLEdBQUcsU0FBUyx1QkFBdUIsS0FBSyxHQUFHLFNBQVMsZUFBZSxFQUFHLFFBQU87QUFFakYsY0FBSSxHQUFHLFNBQVMsaUJBQWlCLEtBQUssR0FBRyxTQUFTLG9CQUFvQixFQUFHLFFBQU87QUFFaEYsY0FBSSxHQUFHLFNBQVMsZUFBZSxFQUFHLFFBQU87QUFFekMsY0FBSSxHQUFHLFNBQVMsZ0JBQWdCLEVBQUcsUUFBTztBQUUxQyxjQUFJLEdBQUcsU0FBUywwQkFBMEIsRUFBRyxRQUFPO0FBRXBELGNBQUksR0FBRyxTQUFTLGlCQUFpQixLQUFLLEdBQUcsU0FBUyxXQUFXLEtBQUssR0FBRyxTQUFTLGdCQUFnQixFQUFHLFFBQU87QUFBQSxRQUMxRztBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
