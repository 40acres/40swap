import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import pluginChecker from 'vite-plugin-checker';
import wasm from 'vite-plugin-wasm';
import devtools from 'solid-devtools/vite';
import mkcert from 'vite-plugin-mkcert';
import inject from '@rollup/plugin-inject';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
    root: 'src',
    plugins: [
        solidPlugin(),
        pluginChecker({ typescript: true }),
        wasm(),
        devtools({
            autoname: true,
        }),
        mkcert(),
        nodePolyfills(),
    ],
    css: {
        preprocessorOptions: {
            scss: {
                silenceDeprecations: ['color-functions', 'mixed-decls'], // These are Bootstrap-side warnings
            },
        },
    },
    server: {
        https: true,
        host: '0.0.0.0',
        port: 7080,
        proxy: {
            '/api': {
                target: 'http://localhost:7081',
            },
            '/docs': {
                target: 'http://localhost:7081',
            },
        },
    },
    build: {
        outDir: '../dist',
        target: 'esnext',
        rollupOptions: {
            plugins: [
                inject({
                    Buffer: ['buffer', 'Buffer'],
                }),
            ],
        },
    },
    publicDir: 'assets',
    resolve: {
        alias: {
            buffer: 'buffer/',
            stream: 'rollup-plugin-node-polyfills/polyfills/stream',
            util: 'rollup-plugin-node-polyfills/polyfills/util',
            process: 'rollup-plugin-node-polyfills/polyfills/process-es6',
            events: 'rollup-plugin-node-polyfills/polyfills/events',
        },
    },
});
