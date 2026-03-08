// vite.config.ts
import { defineConfig } from "file:///C:/Users/ezevi/Documents/snapsotmain/packages/client/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/ezevi/Documents/snapsotmain/node_modules/@vitejs/plugin-react/dist/index.js";
import { resolve } from "path";
import { nodePolyfills } from "file:///C:/Users/ezevi/Documents/snapsotmain/node_modules/vite-plugin-node-polyfills/dist/index.js";
var __vite_injected_original_dirname = "C:\\Users\\ezevi\\Documents\\snapsotmain\\packages\\client";
var rootResolve = (pkg) => resolve(__vite_injected_original_dirname, "../../node_modules", pkg);
var vite_config_default = defineConfig({
  envPrefix: ["VITE_", "SNAP_", "MAGICBLOCK_", "MAGIC_", "SOLANA_"],
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxlemV2aVxcXFxEb2N1bWVudHNcXFxcc25hcHNvdG1haW5cXFxccGFja2FnZXNcXFxcY2xpZW50XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxlemV2aVxcXFxEb2N1bWVudHNcXFxcc25hcHNvdG1haW5cXFxccGFja2FnZXNcXFxcY2xpZW50XFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9lemV2aS9Eb2N1bWVudHMvc25hcHNvdG1haW4vcGFja2FnZXMvY2xpZW50L3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XHJcbmltcG9ydCB7IHJlc29sdmUgfSBmcm9tICdwYXRoJztcclxuXHJcbi8vIEhlbHBlciB0byByZXNvbHZlIGZyb20gcm9vdCBub2RlX21vZHVsZXMgKGhhbmRsZXMgbW9ub3JlcG8gaG9pc3RpbmcpXHJcbmNvbnN0IHJvb3RSZXNvbHZlID0gKHBrZzogc3RyaW5nKSA9PiByZXNvbHZlKF9fZGlybmFtZSwgJy4uLy4uL25vZGVfbW9kdWxlcycsIHBrZyk7XHJcbmNvbnN0IGxvY2FsUmVzb2x2ZSA9IChwa2c6IHN0cmluZykgPT4gcmVzb2x2ZShfX2Rpcm5hbWUsICcuL25vZGVfbW9kdWxlcycsIHBrZyk7XHJcblxyXG5pbXBvcnQgeyBub2RlUG9seWZpbGxzIH0gZnJvbSAndml0ZS1wbHVnaW4tbm9kZS1wb2x5ZmlsbHMnO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgICBlbnZQcmVmaXg6IFsnVklURV8nLCAnU05BUF8nLCAnTUFHSUNCTE9DS18nLCAnTUFHSUNfJywgJ1NPTEFOQV8nXSxcbiAgICBwbHVnaW5zOiBbXG4gICAgICAgIHJlYWN0KCksXG4gICAgICAgIG5vZGVQb2x5ZmlsbHMoe1xuICAgICAgICAgICAgLy8gVG8gZXhjbHVkZSBzcGVjaWZpYyBwb2x5ZmlsbHMsIGFkZCB0aGVtIHRvIHRoaXMgbGlzdC5cbiAgICAgICAgICAgIGV4Y2x1ZGU6IFtdLFxuICAgICAgICAgICAgZ2xvYmFsczoge1xuICAgICAgICAgICAgICAgIEJ1ZmZlcjogdHJ1ZSxcbiAgICAgICAgICAgICAgICBnbG9iYWw6IHRydWUsXG4gICAgICAgICAgICAgICAgcHJvY2VzczogdHJ1ZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAvLyBXaGV0aGVyIHRvIHBvbHlmaWxsIGBub2RlOmAgcHJvdG9jb2wgaW1wb3J0cy5cbiAgICAgICAgICAgIHByb3RvY29sSW1wb3J0czogdHJ1ZSxcbiAgICAgICAgfSksXG4gICAgXSxcbiAgICByZXNvbHZlOiB7XHJcbiAgICAgICAgYWxpYXM6IHtcbiAgICAgICAgICAgICdAc25hcHNob3Qvc2hhcmVkJzogcmVzb2x2ZShfX2Rpcm5hbWUsICcuLi9zaGFyZWQvc3JjJyksXG4gICAgICAgICAgICAnQHNuYXBzaG90L3NuYXAnOiByZXNvbHZlKF9fZGlybmFtZSwgJy4uL3NuYXAvc3JjJyksXG4gICAgICAgICAgICAndGhyZWUnOiByb290UmVzb2x2ZSgndGhyZWUnKSxcbiAgICAgICAgICAgICd0aHJlZS9leGFtcGxlcy9qc20vbG9hZGVycy9TVkdMb2FkZXIuanMnOiByb290UmVzb2x2ZSgndGhyZWUvZXhhbXBsZXMvanNtL2xvYWRlcnMvU1ZHTG9hZGVyLmpzJyksXHJcbiAgICAgICAgICAgICd0aHJlZS9zcmMvbWF0aC9NYXRoVXRpbHMuanMnOiByb290UmVzb2x2ZSgndGhyZWUvc3JjL21hdGgvTWF0aFV0aWxzLmpzJyksXHJcbiAgICAgICAgICAgICdyZWFjdCc6IHJvb3RSZXNvbHZlKCdyZWFjdCcpLFxyXG4gICAgICAgICAgICAncmVhY3QvanN4LXJ1bnRpbWUnOiByb290UmVzb2x2ZSgncmVhY3QvanN4LXJ1bnRpbWUuanMnKSxcclxuICAgICAgICAgICAgJ3JlYWN0L2pzeC1kZXYtcnVudGltZSc6IHJvb3RSZXNvbHZlKCdyZWFjdC9qc3gtZGV2LXJ1bnRpbWUuanMnKSxcclxuICAgICAgICAgICAgJ3JlYWN0LWRvbSc6IHJvb3RSZXNvbHZlKCdyZWFjdC1kb20nKSxcclxuICAgICAgICAgICAgJ3JlYWN0LWRvbS9jbGllbnQnOiByb290UmVzb2x2ZSgncmVhY3QtZG9tL2NsaWVudC5qcycpLFxyXG4gICAgICAgICAgICAnQHJlYWN0LXRocmVlL2ZpYmVyJzogcm9vdFJlc29sdmUoJ0ByZWFjdC10aHJlZS9maWJlcicpLFxyXG4gICAgICAgICAgICAnQHJlYWN0LXRocmVlL2RyZWknOiByb290UmVzb2x2ZSgnQHJlYWN0LXRocmVlL2RyZWknKSxcclxuICAgICAgICAgICAgJ0ByZWFjdC10aHJlZS91aWtpdCc6IHJvb3RSZXNvbHZlKCdAcmVhY3QtdGhyZWUvdWlraXQnKSxcclxuICAgICAgICAgICAgJ0ByZWFjdC10aHJlZS91aWtpdC1sdWNpZGUnOiByb290UmVzb2x2ZSgnQHJlYWN0LXRocmVlL3Vpa2l0LWx1Y2lkZScpLFxyXG4gICAgICAgIH0sXHJcbiAgICB9LFxyXG4gICAgc2VydmVyOiB7XHJcbiAgICAgICAgcG9ydDogNTE3MyxcclxuICAgICAgICBob3N0OiB0cnVlLFxyXG4gICAgfSxcclxuICAgIGJ1aWxkOiB7XHJcbiAgICAgICAgdGFyZ2V0OiAnZXNuZXh0JyxcclxuICAgICAgICBzb3VyY2VtYXA6IHRydWUsXHJcbiAgICB9LFxyXG4gICAgb3B0aW1pemVEZXBzOiB7XG4gICAgICAgIGluY2x1ZGU6IFtcbiAgICAgICAgICAgICd0aHJlZScsXG4gICAgICAgICAgICAncmVhY3QnLFxuICAgICAgICAgICAgJ3JlYWN0LWRvbScsXG4gICAgICAgICAgICAnQHJlYWN0LXRocmVlL2ZpYmVyJyxcbiAgICAgICAgICAgICdAcmVhY3QtdGhyZWUvZHJlaScsXG4gICAgICAgICAgICAnQHJlYWN0LXRocmVlL3Vpa2l0JyxcbiAgICAgICAgICAgICdAcmVhY3QtdGhyZWUvdWlraXQtbHVjaWRlJyxcbiAgICAgICAgICAgICdAc29sYW5hL3dhbGxldC1hZGFwdGVyLXJlYWN0JyxcbiAgICAgICAgICAgICdAc29sYW5hL3dhbGxldC1hZGFwdGVyLXJlYWN0LXVpJyxcbiAgICAgICAgICAgICdAc29sYW5hL3dhbGxldC1hZGFwdGVyLWJhc2UnLFxuICAgICAgICAgICAgJ0Bzb2xhbmEvd2ViMy5qcycsXG4gICAgICAgICAgICAnQHNvbGFuYS93YWxsZXQtYWRhcHRlci13YWxsZXRzJyxcbiAgICAgICAgXSxcbiAgICB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQTRWLFNBQVMsb0JBQW9CO0FBQ3pYLE9BQU8sV0FBVztBQUNsQixTQUFTLGVBQWU7QUFNeEIsU0FBUyxxQkFBcUI7QUFSOUIsSUFBTSxtQ0FBbUM7QUFLekMsSUFBTSxjQUFjLENBQUMsUUFBZ0IsUUFBUSxrQ0FBVyxzQkFBc0IsR0FBRztBQUtqRixJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUN4QixXQUFXLENBQUMsU0FBUyxTQUFTLGVBQWUsVUFBVSxTQUFTO0FBQUEsRUFDaEUsU0FBUztBQUFBLElBQ0wsTUFBTTtBQUFBLElBQ04sY0FBYztBQUFBO0FBQUEsTUFFVixTQUFTLENBQUM7QUFBQSxNQUNWLFNBQVM7QUFBQSxRQUNMLFFBQVE7QUFBQSxRQUNSLFFBQVE7QUFBQSxRQUNSLFNBQVM7QUFBQSxNQUNiO0FBQUE7QUFBQSxNQUVBLGlCQUFpQjtBQUFBLElBQ3JCLENBQUM7QUFBQSxFQUNMO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDTCxPQUFPO0FBQUEsTUFDSCxvQkFBb0IsUUFBUSxrQ0FBVyxlQUFlO0FBQUEsTUFDdEQsa0JBQWtCLFFBQVEsa0NBQVcsYUFBYTtBQUFBLE1BQ2xELFNBQVMsWUFBWSxPQUFPO0FBQUEsTUFDNUIsMkNBQTJDLFlBQVkseUNBQXlDO0FBQUEsTUFDaEcsK0JBQStCLFlBQVksNkJBQTZCO0FBQUEsTUFDeEUsU0FBUyxZQUFZLE9BQU87QUFBQSxNQUM1QixxQkFBcUIsWUFBWSxzQkFBc0I7QUFBQSxNQUN2RCx5QkFBeUIsWUFBWSwwQkFBMEI7QUFBQSxNQUMvRCxhQUFhLFlBQVksV0FBVztBQUFBLE1BQ3BDLG9CQUFvQixZQUFZLHFCQUFxQjtBQUFBLE1BQ3JELHNCQUFzQixZQUFZLG9CQUFvQjtBQUFBLE1BQ3RELHFCQUFxQixZQUFZLG1CQUFtQjtBQUFBLE1BQ3BELHNCQUFzQixZQUFZLG9CQUFvQjtBQUFBLE1BQ3RELDZCQUE2QixZQUFZLDJCQUEyQjtBQUFBLElBQ3hFO0FBQUEsRUFDSjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ0osTUFBTTtBQUFBLElBQ04sTUFBTTtBQUFBLEVBQ1Y7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNILFFBQVE7QUFBQSxJQUNSLFdBQVc7QUFBQSxFQUNmO0FBQUEsRUFDQSxjQUFjO0FBQUEsSUFDVixTQUFTO0FBQUEsTUFDTDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDSjtBQUFBLEVBQ0o7QUFDSixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
