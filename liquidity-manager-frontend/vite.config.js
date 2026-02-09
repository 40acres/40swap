import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import pluginChecker from 'vite-plugin-checker';
import devtools from 'solid-devtools/vite';

export default defineConfig({
    root: 'src',
    plugins: [
        solidPlugin(),
        pluginChecker({ typescript: true }),
        devtools({
            autoname: true,
        }),
    ],
    css: {
        preprocessorOptions: {
            scss: {
                silenceDeprecations: ['color-functions', 'mixed-decls'],
            },
        },
    },
    server: {
        host: '0.0.0.0',
        port: 7083,
        proxy: {
            '/api': {
                target: 'http://localhost:7082',
                changeOrigin: true,
                secure: false,
            },
        },
    },
    build: {
        outDir: '../dist',
        target: 'esnext',
    },
    publicDir: 'assets',
});
