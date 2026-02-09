// vite.config.ts
import { defineConfig } from "file:///C:/Users/ezevi/Documents/snapsotmain/packages/client/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/ezevi/Documents/snapsotmain/node_modules/@vitejs/plugin-react/dist/index.js";
import { resolve } from "path";
import { nodePolyfills } from "file:///C:/Users/ezevi/Documents/snapsotmain/node_modules/vite-plugin-node-polyfills/dist/index.js";
var __vite_injected_original_dirname = "C:\\Users\\ezevi\\Documents\\snapsotmain\\packages\\client";
var rootResolve = (pkg) => resolve(__vite_injected_original_dirname, "../../node_modules", pkg);
var vite_config_default = defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // To exclude specific polyfills, add them to this list.
      exclude: [],
      // Whether to polyfill `node:` protocol imports.
      protocolImports: true
    })
  ],
  resolve: {
    alias: {
      "@snapshot/shared": resolve(__vite_injected_original_dirname, "../shared/src"),
      "three": rootResolve("three"),
      "three/examples/jsm/loaders/SVGLoader.js": rootResolve("three/examples/jsm/loaders/SVGLoader.js"),
      "three/src/math/MathUtils.js": rootResolve("three/src/math/MathUtils.js"),
      "react": rootResolve("react"),
      "react/jsx-runtime": rootResolve("react/jsx-runtime.js"),
      "react/jsx-dev-runtime": rootResolve("react/jsx-dev-runtime.js"),
      "react-dom": rootResolve("react-dom"),
      "react-dom/client": rootResolve("react-dom/client.js"),
      "@react-three/fiber": rootResolve("@react-three/fiber"),
      "@react-three/drei": rootResolve("@react-three/drei"),
      "@react-three/uikit": rootResolve("@react-three/uikit"),
      "@react-three/uikit-lucide": rootResolve("@react-three/uikit-lucide")
    }
  },
  server: {
    port: 5173,
    host: true
  },
  build: {
    target: "esnext",
    sourcemap: true
  },
  optimizeDeps: {
    include: ["three", "react", "react-dom", "@react-three/fiber", "@react-three/drei", "@react-three/uikit", "@react-three/uikit-lucide"]
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxlemV2aVxcXFxEb2N1bWVudHNcXFxcc25hcHNvdG1haW5cXFxccGFja2FnZXNcXFxcY2xpZW50XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxlemV2aVxcXFxEb2N1bWVudHNcXFxcc25hcHNvdG1haW5cXFxccGFja2FnZXNcXFxcY2xpZW50XFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9lemV2aS9Eb2N1bWVudHMvc25hcHNvdG1haW4vcGFja2FnZXMvY2xpZW50L3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XHJcbmltcG9ydCB7IHJlc29sdmUgfSBmcm9tICdwYXRoJztcclxuXHJcbi8vIEhlbHBlciB0byByZXNvbHZlIGZyb20gcm9vdCBub2RlX21vZHVsZXMgKGhhbmRsZXMgbW9ub3JlcG8gaG9pc3RpbmcpXHJcbmNvbnN0IHJvb3RSZXNvbHZlID0gKHBrZzogc3RyaW5nKSA9PiByZXNvbHZlKF9fZGlybmFtZSwgJy4uLy4uL25vZGVfbW9kdWxlcycsIHBrZyk7XHJcbmNvbnN0IGxvY2FsUmVzb2x2ZSA9IChwa2c6IHN0cmluZykgPT4gcmVzb2x2ZShfX2Rpcm5hbWUsICcuL25vZGVfbW9kdWxlcycsIHBrZyk7XHJcblxyXG5pbXBvcnQgeyBub2RlUG9seWZpbGxzIH0gZnJvbSAndml0ZS1wbHVnaW4tbm9kZS1wb2x5ZmlsbHMnO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcclxuICAgIHBsdWdpbnM6IFtcclxuICAgICAgICByZWFjdCgpLFxyXG4gICAgICAgIG5vZGVQb2x5ZmlsbHMoe1xyXG4gICAgICAgICAgICAvLyBUbyBleGNsdWRlIHNwZWNpZmljIHBvbHlmaWxscywgYWRkIHRoZW0gdG8gdGhpcyBsaXN0LlxyXG4gICAgICAgICAgICBleGNsdWRlOiBbXSxcclxuICAgICAgICAgICAgLy8gV2hldGhlciB0byBwb2x5ZmlsbCBgbm9kZTpgIHByb3RvY29sIGltcG9ydHMuXHJcbiAgICAgICAgICAgIHByb3RvY29sSW1wb3J0czogdHJ1ZSxcclxuICAgICAgICB9KSxcclxuICAgIF0sXHJcbiAgICByZXNvbHZlOiB7XHJcbiAgICAgICAgYWxpYXM6IHtcclxuICAgICAgICAgICAgJ0BzbmFwc2hvdC9zaGFyZWQnOiByZXNvbHZlKF9fZGlybmFtZSwgJy4uL3NoYXJlZC9zcmMnKSxcclxuICAgICAgICAgICAgJ3RocmVlJzogcm9vdFJlc29sdmUoJ3RocmVlJyksXHJcbiAgICAgICAgICAgICd0aHJlZS9leGFtcGxlcy9qc20vbG9hZGVycy9TVkdMb2FkZXIuanMnOiByb290UmVzb2x2ZSgndGhyZWUvZXhhbXBsZXMvanNtL2xvYWRlcnMvU1ZHTG9hZGVyLmpzJyksXHJcbiAgICAgICAgICAgICd0aHJlZS9zcmMvbWF0aC9NYXRoVXRpbHMuanMnOiByb290UmVzb2x2ZSgndGhyZWUvc3JjL21hdGgvTWF0aFV0aWxzLmpzJyksXHJcbiAgICAgICAgICAgICdyZWFjdCc6IHJvb3RSZXNvbHZlKCdyZWFjdCcpLFxyXG4gICAgICAgICAgICAncmVhY3QvanN4LXJ1bnRpbWUnOiByb290UmVzb2x2ZSgncmVhY3QvanN4LXJ1bnRpbWUuanMnKSxcclxuICAgICAgICAgICAgJ3JlYWN0L2pzeC1kZXYtcnVudGltZSc6IHJvb3RSZXNvbHZlKCdyZWFjdC9qc3gtZGV2LXJ1bnRpbWUuanMnKSxcclxuICAgICAgICAgICAgJ3JlYWN0LWRvbSc6IHJvb3RSZXNvbHZlKCdyZWFjdC1kb20nKSxcclxuICAgICAgICAgICAgJ3JlYWN0LWRvbS9jbGllbnQnOiByb290UmVzb2x2ZSgncmVhY3QtZG9tL2NsaWVudC5qcycpLFxyXG4gICAgICAgICAgICAnQHJlYWN0LXRocmVlL2ZpYmVyJzogcm9vdFJlc29sdmUoJ0ByZWFjdC10aHJlZS9maWJlcicpLFxyXG4gICAgICAgICAgICAnQHJlYWN0LXRocmVlL2RyZWknOiByb290UmVzb2x2ZSgnQHJlYWN0LXRocmVlL2RyZWknKSxcclxuICAgICAgICAgICAgJ0ByZWFjdC10aHJlZS91aWtpdCc6IHJvb3RSZXNvbHZlKCdAcmVhY3QtdGhyZWUvdWlraXQnKSxcclxuICAgICAgICAgICAgJ0ByZWFjdC10aHJlZS91aWtpdC1sdWNpZGUnOiByb290UmVzb2x2ZSgnQHJlYWN0LXRocmVlL3Vpa2l0LWx1Y2lkZScpLFxyXG4gICAgICAgIH0sXHJcbiAgICB9LFxyXG4gICAgc2VydmVyOiB7XHJcbiAgICAgICAgcG9ydDogNTE3MyxcclxuICAgICAgICBob3N0OiB0cnVlLFxyXG4gICAgfSxcclxuICAgIGJ1aWxkOiB7XHJcbiAgICAgICAgdGFyZ2V0OiAnZXNuZXh0JyxcclxuICAgICAgICBzb3VyY2VtYXA6IHRydWUsXHJcbiAgICB9LFxyXG4gICAgb3B0aW1pemVEZXBzOiB7XHJcbiAgICAgICAgaW5jbHVkZTogWyd0aHJlZScsICdyZWFjdCcsICdyZWFjdC1kb20nLCAnQHJlYWN0LXRocmVlL2ZpYmVyJywgJ0ByZWFjdC10aHJlZS9kcmVpJywgJ0ByZWFjdC10aHJlZS91aWtpdCcsICdAcmVhY3QtdGhyZWUvdWlraXQtbHVjaWRlJ10sXHJcbiAgICB9LFxyXG59KTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUE0VixTQUFTLG9CQUFvQjtBQUN6WCxPQUFPLFdBQVc7QUFDbEIsU0FBUyxlQUFlO0FBTXhCLFNBQVMscUJBQXFCO0FBUjlCLElBQU0sbUNBQW1DO0FBS3pDLElBQU0sY0FBYyxDQUFDLFFBQWdCLFFBQVEsa0NBQVcsc0JBQXNCLEdBQUc7QUFLakYsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDeEIsU0FBUztBQUFBLElBQ0wsTUFBTTtBQUFBLElBQ04sY0FBYztBQUFBO0FBQUEsTUFFVixTQUFTLENBQUM7QUFBQTtBQUFBLE1BRVYsaUJBQWlCO0FBQUEsSUFDckIsQ0FBQztBQUFBLEVBQ0w7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNMLE9BQU87QUFBQSxNQUNILG9CQUFvQixRQUFRLGtDQUFXLGVBQWU7QUFBQSxNQUN0RCxTQUFTLFlBQVksT0FBTztBQUFBLE1BQzVCLDJDQUEyQyxZQUFZLHlDQUF5QztBQUFBLE1BQ2hHLCtCQUErQixZQUFZLDZCQUE2QjtBQUFBLE1BQ3hFLFNBQVMsWUFBWSxPQUFPO0FBQUEsTUFDNUIscUJBQXFCLFlBQVksc0JBQXNCO0FBQUEsTUFDdkQseUJBQXlCLFlBQVksMEJBQTBCO0FBQUEsTUFDL0QsYUFBYSxZQUFZLFdBQVc7QUFBQSxNQUNwQyxvQkFBb0IsWUFBWSxxQkFBcUI7QUFBQSxNQUNyRCxzQkFBc0IsWUFBWSxvQkFBb0I7QUFBQSxNQUN0RCxxQkFBcUIsWUFBWSxtQkFBbUI7QUFBQSxNQUNwRCxzQkFBc0IsWUFBWSxvQkFBb0I7QUFBQSxNQUN0RCw2QkFBNkIsWUFBWSwyQkFBMkI7QUFBQSxJQUN4RTtBQUFBLEVBQ0o7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNKLE1BQU07QUFBQSxJQUNOLE1BQU07QUFBQSxFQUNWO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDSCxRQUFRO0FBQUEsSUFDUixXQUFXO0FBQUEsRUFDZjtBQUFBLEVBQ0EsY0FBYztBQUFBLElBQ1YsU0FBUyxDQUFDLFNBQVMsU0FBUyxhQUFhLHNCQUFzQixxQkFBcUIsc0JBQXNCLDJCQUEyQjtBQUFBLEVBQ3pJO0FBQ0osQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
