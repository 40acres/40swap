import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import pluginChecker from 'vite-plugin-checker';
import wasm from 'vite-plugin-wasm';
import devtools from 'solid-devtools/vite';

export default defineConfig({
    root: 'src',
    plugins: [
        solidPlugin(),
        pluginChecker({typescript: true}),
        wasm(),
        devtools({
            autoname: true,
        }),
    ],
    server: {
        host: '0.0.0.0',
        port: 7080,
        proxy: {
            '/api': {
                target: 'http://localhost:7081',
            },
        },
    },
    build: {
        outDir: '../dist',
        target: 'esnext',
    },
    publicDir: 'assets',
    resolve: {
        alias: {
            buffer: 'rollup-plugin-node-polyfills/polyfills/buffer-es6',
            // for bolt11
            stream: 'rollup-plugin-node-polyfills/polyfills/stream',
            util: 'rollup-plugin-node-polyfills/polyfills/util',
            process: 'rollup-plugin-node-polyfills/polyfills/process-es6',
            events: 'rollup-plugin-node-polyfills/polyfills/events',
        },
    },
});
