import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { defineConfig, type Plugin } from 'vite';
import { dailyPage, isDailyPage } from './src/core/sitePaths';

const publicFiles = ['manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
const dailyDescription = '点两枚符文换位，试着打倒今天的敌人。比谁用得更少，或谁打得更高。';
const dailyCover = 'daily-cover-v1.jpg';
const dailyImage = `https://bartcurry.github.io/affix-grid-4x4/${dailyCover}`;
const dailyMetadata = `<meta name="description" content="${dailyDescription}" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="zh_CN" />
    <meta property="og:title" content="词条法阵 · 每日残局" />
    <meta property="og:description" content="${dailyDescription}" />
    <meta property="og:image" content="${dailyImage}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="每日残局，换几步能破阵？两枚金边符文沿着玉绿色箭头换位。" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="词条法阵 · 每日残局" />
    <meta name="twitter:description" content="${dailyDescription}" />
    <meta name="twitter:image" content="${dailyImage}" />
    <title>每日残局 · 4×4 词条法阵</title>`;

function staticPages(): Plugin {
  return {
    name: 'affix-grid-static-pages',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        const address = request.url ?? '';
        const pathname = address.split('?')[0];
        if (isDailyPage(pathname)) request.url = pathname.slice(0, -dailyPage.length) + 'index.html' + address.slice(pathname.length);
        next();
      });
    },
    generateBundle: {
      order: 'post',
      async handler(_options, bundle) {
        const entry = bundle['index.html'];
        if (entry?.type !== 'asset') throw new Error('Missing built HTML for offline play');
        const html = typeof entry.source === 'string' ? entry.source : new TextDecoder().decode(entry.source);
        const socialPreview = /<!-- social-preview:start -->[\s\S]*?<!-- social-preview:end -->/;
        if (!socialPreview.test(html)) throw new Error('Missing social preview metadata');
        const dailyHtml = html.replace(socialPreview, dailyMetadata);
        const worker = await readFile(new URL('./src/platform/serviceWorker.js', import.meta.url), 'utf8');
        const hash = createHash('sha256').update(worker).update(dailyHtml);
        const files = Object.keys(bundle).filter(file => !file.endsWith('.map')).sort();
        for (const file of files) {
          const output = bundle[file];
          hash.update(file).update(output.type === 'chunk' ? output.code : output.source);
        }
        for (const file of publicFiles) hash.update(await readFile(new URL(`./public/${file}`, import.meta.url)));
        hash.update(await readFile(new URL(`./public/${dailyCover}`, import.meta.url)));
        const release = hash.digest('hex').slice(0, 16);
        const shell = `offline-${release}.html`;
        const precache = [shell, ...publicFiles, ...files.filter(file => file !== 'index.html')];
        this.emitFile({ type: 'asset', fileName: shell, source: entry.source });
        this.emitFile({ type: 'asset', fileName: dailyPage, source: dailyHtml });
        this.emitFile({ type: 'asset', fileName: 'sw.js',
          source: `const release = ${JSON.stringify(release)};\nconst precache = ${JSON.stringify(precache)};\n${worker}` });
      },
    },
  };
}

export default defineConfig({ base: './', plugins: [staticPages()] });
