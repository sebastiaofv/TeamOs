import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath, URL } from 'node:url';

const removePublicOnlyMarkup: Plugin = {
    name: 'remove-standalone-public-only-markup',
    transformIndexHtml(html) {
        // publicDir is disabled below, so remove the favicon reference too.
        return html.replace(/\s*<link\s+rel="icon"[^>]*>\s*/i, '\n');
    }
};

export default defineConfig({
    plugins: [react(), removePublicOnlyMarkup, viteSingleFile({ removeViteModuleLoader: true })],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    base: './',
    publicDir: false,
    build: {
        outDir: 'dist-standalone',
        emptyOutDir: true
    }
});
