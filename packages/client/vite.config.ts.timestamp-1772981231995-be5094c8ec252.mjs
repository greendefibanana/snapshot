// vite.config.ts
import { defineConfig } from "file:///C:/Users/ezevi/Documents/snapsotmain/packages/client/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/ezevi/Documents/snapsotmain/node_modules/@vitejs/plugin-react/dist/index.js";
import { resolve } from "path";
import { nodePolyfills } from "file:///C:/Users/ezevi/Documents/snapsotmain/node_modules/vite-plugin-node-polyfills/dist/index.js";
var __vite_injected_original_dirname = "C:\\Users\\ezevi\\Documents\\snapsotmain\\packages\\client";
var rootResolve = (pkg) => resolve(__vite_injected_original_dirname, "../../node_modules", pkg);
var vite_config_default = defineConfig({
  envPrefix: ["VITE_", "SNAP_", "MAGICBLOCK_", "SOLANA_"],
  plugins: [
    react(),
    nodePolyfills({
      // To exclude specific polyfills, add them to this list.
      exclude: [],
      globals: {
        Buffer: true,
        global: true,
        process: true
      },
      // Whether to polyfill `node:` protocol imports.
      protocolImports: true
    })
  ],
  resolve: {
    alias: {
      "@snapshot/shared": resolve(__vite_injected_original_dirname, "../shared/src"),
      "@snapshot/snap": resolve(__vite_injected_original_dirname, "../snap/src"),
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
    include: [
      "three",
      "react",
      "react-dom",
      "@react-three/fiber",
      "@react-three/drei",
      "@react-three/uikit",
      "@react-three/uikit-lucide",
      "@solana/wallet-adapter-react",
      "@solana/wallet-adapter-react-ui",
      "@solana/wallet-adapter-base",
      "@solana/web3.js",
      "@solana/wallet-adapter-wallets"
    ]
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxlemV2aVxcXFxEb2N1bWVudHNcXFxcc25hcHNvdG1haW5cXFxccGFja2FnZXNcXFxcY2xpZW50XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxlemV2aVxcXFxEb2N1bWVudHNcXFxcc25hcHNvdG1haW5cXFxccGFja2FnZXNcXFxcY2xpZW50XFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9lemV2aS9Eb2N1bWVudHMvc25hcHNvdG1haW4vcGFja2FnZXMvY2xpZW50L3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XHJcbmltcG9ydCB7IHJlc29sdmUgfSBmcm9tICdwYXRoJztcclxuXHJcbi8vIEhlbHBlciB0byByZXNvbHZlIGZyb20gcm9vdCBub2RlX21vZHVsZXMgKGhhbmRsZXMgbW9ub3JlcG8gaG9pc3RpbmcpXHJcbmNvbnN0IHJvb3RSZXNvbHZlID0gKHBrZzogc3RyaW5nKSA9PiByZXNvbHZlKF9fZGlybmFtZSwgJy4uLy4uL25vZGVfbW9kdWxlcycsIHBrZyk7XHJcbmNvbnN0IGxvY2FsUmVzb2x2ZSA9IChwa2c6IHN0cmluZykgPT4gcmVzb2x2ZShfX2Rpcm5hbWUsICcuL25vZGVfbW9kdWxlcycsIHBrZyk7XHJcblxyXG5pbXBvcnQgeyBub2RlUG9seWZpbGxzIH0gZnJvbSAndml0ZS1wbHVnaW4tbm9kZS1wb2x5ZmlsbHMnO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgICBlbnZQcmVmaXg6IFsnVklURV8nLCAnU05BUF8nLCAnTUFHSUNCTE9DS18nLCAnU09MQU5BXyddLFxuICAgIHBsdWdpbnM6IFtcbiAgICAgICAgcmVhY3QoKSxcbiAgICAgICAgbm9kZVBvbHlmaWxscyh7XG4gICAgICAgICAgICAvLyBUbyBleGNsdWRlIHNwZWNpZmljIHBvbHlmaWxscywgYWRkIHRoZW0gdG8gdGhpcyBsaXN0LlxuICAgICAgICAgICAgZXhjbHVkZTogW10sXG4gICAgICAgICAgICBnbG9iYWxzOiB7XG4gICAgICAgICAgICAgICAgQnVmZmVyOiB0cnVlLFxuICAgICAgICAgICAgICAgIGdsb2JhbDogdHJ1ZSxcbiAgICAgICAgICAgICAgICBwcm9jZXNzOiB0cnVlLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIC8vIFdoZXRoZXIgdG8gcG9seWZpbGwgYG5vZGU6YCBwcm90b2NvbCBpbXBvcnRzLlxuICAgICAgICAgICAgcHJvdG9jb2xJbXBvcnRzOiB0cnVlLFxuICAgICAgICB9KSxcbiAgICBdLFxuICAgIHJlc29sdmU6IHtcclxuICAgICAgICBhbGlhczoge1xuICAgICAgICAgICAgJ0BzbmFwc2hvdC9zaGFyZWQnOiByZXNvbHZlKF9fZGlybmFtZSwgJy4uL3NoYXJlZC9zcmMnKSxcbiAgICAgICAgICAgICdAc25hcHNob3Qvc25hcCc6IHJlc29sdmUoX19kaXJuYW1lLCAnLi4vc25hcC9zcmMnKSxcbiAgICAgICAgICAgICd0aHJlZSc6IHJvb3RSZXNvbHZlKCd0aHJlZScpLFxuICAgICAgICAgICAgJ3RocmVlL2V4YW1wbGVzL2pzbS9sb2FkZXJzL1NWR0xvYWRlci5qcyc6IHJvb3RSZXNvbHZlKCd0aHJlZS9leGFtcGxlcy9qc20vbG9hZGVycy9TVkdMb2FkZXIuanMnKSxcclxuICAgICAgICAgICAgJ3RocmVlL3NyYy9tYXRoL01hdGhVdGlscy5qcyc6IHJvb3RSZXNvbHZlKCd0aHJlZS9zcmMvbWF0aC9NYXRoVXRpbHMuanMnKSxcclxuICAgICAgICAgICAgJ3JlYWN0Jzogcm9vdFJlc29sdmUoJ3JlYWN0JyksXHJcbiAgICAgICAgICAgICdyZWFjdC9qc3gtcnVudGltZSc6IHJvb3RSZXNvbHZlKCdyZWFjdC9qc3gtcnVudGltZS5qcycpLFxyXG4gICAgICAgICAgICAncmVhY3QvanN4LWRldi1ydW50aW1lJzogcm9vdFJlc29sdmUoJ3JlYWN0L2pzeC1kZXYtcnVudGltZS5qcycpLFxyXG4gICAgICAgICAgICAncmVhY3QtZG9tJzogcm9vdFJlc29sdmUoJ3JlYWN0LWRvbScpLFxyXG4gICAgICAgICAgICAncmVhY3QtZG9tL2NsaWVudCc6IHJvb3RSZXNvbHZlKCdyZWFjdC1kb20vY2xpZW50LmpzJyksXHJcbiAgICAgICAgICAgICdAcmVhY3QtdGhyZWUvZmliZXInOiByb290UmVzb2x2ZSgnQHJlYWN0LXRocmVlL2ZpYmVyJyksXHJcbiAgICAgICAgICAgICdAcmVhY3QtdGhyZWUvZHJlaSc6IHJvb3RSZXNvbHZlKCdAcmVhY3QtdGhyZWUvZHJlaScpLFxyXG4gICAgICAgICAgICAnQHJlYWN0LXRocmVlL3Vpa2l0Jzogcm9vdFJlc29sdmUoJ0ByZWFjdC10aHJlZS91aWtpdCcpLFxyXG4gICAgICAgICAgICAnQHJlYWN0LXRocmVlL3Vpa2l0LWx1Y2lkZSc6IHJvb3RSZXNvbHZlKCdAcmVhY3QtdGhyZWUvdWlraXQtbHVjaWRlJyksXHJcbiAgICAgICAgfSxcclxuICAgIH0sXHJcbiAgICBzZXJ2ZXI6IHtcclxuICAgICAgICBwb3J0OiA1MTczLFxyXG4gICAgICAgIGhvc3Q6IHRydWUsXHJcbiAgICB9LFxyXG4gICAgYnVpbGQ6IHtcclxuICAgICAgICB0YXJnZXQ6ICdlc25leHQnLFxyXG4gICAgICAgIHNvdXJjZW1hcDogdHJ1ZSxcclxuICAgIH0sXHJcbiAgICBvcHRpbWl6ZURlcHM6IHtcbiAgICAgICAgaW5jbHVkZTogW1xuICAgICAgICAgICAgJ3RocmVlJyxcbiAgICAgICAgICAgICdyZWFjdCcsXG4gICAgICAgICAgICAncmVhY3QtZG9tJyxcbiAgICAgICAgICAgICdAcmVhY3QtdGhyZWUvZmliZXInLFxuICAgICAgICAgICAgJ0ByZWFjdC10aHJlZS9kcmVpJyxcbiAgICAgICAgICAgICdAcmVhY3QtdGhyZWUvdWlraXQnLFxuICAgICAgICAgICAgJ0ByZWFjdC10aHJlZS91aWtpdC1sdWNpZGUnLFxuICAgICAgICAgICAgJ0Bzb2xhbmEvd2FsbGV0LWFkYXB0ZXItcmVhY3QnLFxuICAgICAgICAgICAgJ0Bzb2xhbmEvd2FsbGV0LWFkYXB0ZXItcmVhY3QtdWknLFxuICAgICAgICAgICAgJ0Bzb2xhbmEvd2FsbGV0LWFkYXB0ZXItYmFzZScsXG4gICAgICAgICAgICAnQHNvbGFuYS93ZWIzLmpzJyxcbiAgICAgICAgICAgICdAc29sYW5hL3dhbGxldC1hZGFwdGVyLXdhbGxldHMnLFxuICAgICAgICBdLFxuICAgIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBNFYsU0FBUyxvQkFBb0I7QUFDelgsT0FBTyxXQUFXO0FBQ2xCLFNBQVMsZUFBZTtBQU14QixTQUFTLHFCQUFxQjtBQVI5QixJQUFNLG1DQUFtQztBQUt6QyxJQUFNLGNBQWMsQ0FBQyxRQUFnQixRQUFRLGtDQUFXLHNCQUFzQixHQUFHO0FBS2pGLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQ3hCLFdBQVcsQ0FBQyxTQUFTLFNBQVMsZUFBZSxTQUFTO0FBQUEsRUFDdEQsU0FBUztBQUFBLElBQ0wsTUFBTTtBQUFBLElBQ04sY0FBYztBQUFBO0FBQUEsTUFFVixTQUFTLENBQUM7QUFBQSxNQUNWLFNBQVM7QUFBQSxRQUNMLFFBQVE7QUFBQSxRQUNSLFFBQVE7QUFBQSxRQUNSLFNBQVM7QUFBQSxNQUNiO0FBQUE7QUFBQSxNQUVBLGlCQUFpQjtBQUFBLElBQ3JCLENBQUM7QUFBQSxFQUNMO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDTCxPQUFPO0FBQUEsTUFDSCxvQkFBb0IsUUFBUSxrQ0FBVyxlQUFlO0FBQUEsTUFDdEQsa0JBQWtCLFFBQVEsa0NBQVcsYUFBYTtBQUFBLE1BQ2xELFNBQVMsWUFBWSxPQUFPO0FBQUEsTUFDNUIsMkNBQTJDLFlBQVkseUNBQXlDO0FBQUEsTUFDaEcsK0JBQStCLFlBQVksNkJBQTZCO0FBQUEsTUFDeEUsU0FBUyxZQUFZLE9BQU87QUFBQSxNQUM1QixxQkFBcUIsWUFBWSxzQkFBc0I7QUFBQSxNQUN2RCx5QkFBeUIsWUFBWSwwQkFBMEI7QUFBQSxNQUMvRCxhQUFhLFlBQVksV0FBVztBQUFBLE1BQ3BDLG9CQUFvQixZQUFZLHFCQUFxQjtBQUFBLE1BQ3JELHNCQUFzQixZQUFZLG9CQUFvQjtBQUFBLE1BQ3RELHFCQUFxQixZQUFZLG1CQUFtQjtBQUFBLE1BQ3BELHNCQUFzQixZQUFZLG9CQUFvQjtBQUFBLE1BQ3RELDZCQUE2QixZQUFZLDJCQUEyQjtBQUFBLElBQ3hFO0FBQUEsRUFDSjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ0osTUFBTTtBQUFBLElBQ04sTUFBTTtBQUFBLEVBQ1Y7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNILFFBQVE7QUFBQSxJQUNSLFdBQVc7QUFBQSxFQUNmO0FBQUEsRUFDQSxjQUFjO0FBQUEsSUFDVixTQUFTO0FBQUEsTUFDTDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDSjtBQUFBLEVBQ0o7QUFDSixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
