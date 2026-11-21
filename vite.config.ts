import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { defineConfig, type Plugin } from 'vite';

const publicFiles = ['manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];

function offlineRelease(): Plugin {
  return {
    name: 'affix-grid-offline-release',
    apply: 'build',
    generateBundle: {
      order: 'post',
      async handler(_options, bundle) {
        const entry = bundle['index.html'];
        if (entry?.type !== 'asset') throw new Error('Missing built HTML for offline play');
        const worker = await readFile(new URL('./src/platform/serviceWorker.js', import.meta.url), 'utf8');
        const hash = createHash('sha256').update(worker);
        const files = Object.keys(bundle).filter(file => !file.endsWith('.map')).sort();
        for (const file of files) {
          const output = bundle[file];
          hash.update(file).update(output.type === 'chunk' ? output.code : output.source);
        }
        for (const file of publicFiles) hash.update(await readFile(new URL(`./public/${file}`, import.meta.url)));
        const release = hash.digest('hex').slice(0, 16);
        const shell = `offline-${release}.html`;
        const precache = [shell, ...publicFiles, ...files.filter(file => file !== 'index.html')];
        this.emitFile({ type: 'asset', fileName: shell, source: entry.source });
        this.emitFile({ type: 'asset', fileName: 'sw.js',
          source: `const release = ${JSON.stringify(release)};\nconst precache = ${JSON.stringify(precache)};\n${worker}` });
      },
    },
  };
}

export default defineConfig({ base: './', plugins: [offlineRelease()] });
