import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Helper to resolve from root node_modules (handles monorepo hoisting)
const rootResolve = (pkg: string) => resolve(__dirname, '../../node_modules', pkg);
const localResolve = (pkg: string) => resolve(__dirname, './node_modules', pkg);

import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
    plugins: [
        react(),
        nodePolyfills({
            // To exclude specific polyfills, add them to this list.
            exclude: [],
            globals: {
                Buffer: true,
                global: true,
                process: true,
            },
            // Whether to polyfill `node:` protocol imports.
            protocolImports: true,
        }),
    ],
    resolve: {
        alias: {
            '@snapshot/shared': resolve(__dirname, '../shared/src'),
            'three': rootResolve('three'),
            'three/examples/jsm/loaders/SVGLoader.js': rootResolve('three/examples/jsm/loaders/SVGLoader.js'),
            'three/src/math/MathUtils.js': rootResolve('three/src/math/MathUtils.js'),
            'react': rootResolve('react'),
            'react/jsx-runtime': rootResolve('react/jsx-runtime.js'),
            'react/jsx-dev-runtime': rootResolve('react/jsx-dev-runtime.js'),
            'react-dom': rootResolve('react-dom'),
            'react-dom/client': rootResolve('react-dom/client.js'),
            '@react-three/fiber': rootResolve('@react-three/fiber'),
            '@react-three/drei': rootResolve('@react-three/drei'),
            '@react-three/uikit': rootResolve('@react-three/uikit'),
            '@react-three/uikit-lucide': rootResolve('@react-three/uikit-lucide'),
        },
    },
    server: {
        port: 5173,
        host: true,
    },
    build: {
        target: 'esnext',
        sourcemap: true,
    },
    optimizeDeps: {
        include: [
            'three',
            'react',
            'react-dom',
            '@react-three/fiber',
            '@react-three/drei',
            '@react-three/uikit',
            '@react-three/uikit-lucide',
            '@solana/wallet-adapter-react',
            '@solana/wallet-adapter-react-ui',
            '@solana/wallet-adapter-base',
            '@solana/web3.js',
            '@solana/wallet-adapter-wallets',
        ],
    },
});
