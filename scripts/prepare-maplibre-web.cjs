const fs = require('node:fs');
const path = require('node:path');
const { buildSync } = require('esbuild');
const { revision } = require('../src/components/map/maplibre-assets.json');

// Serve classic scripts, including a classic worker, for older mobile WebViews
// and Safari. A module worker can fail asynchronously after the map's controls
// and background have rendered, leaving the map waiting forever for tile data.
function prepareMapLibreWeb() {
  const packagePath = require.resolve('maplibre-gl/package.json');
  const { version } = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const source = path.join(path.dirname(packagePath), 'dist');
  // Bump revision whenever these generated assets change: nginx caches them as
  // immutable, and the upstream package version alone no longer identifies them.
  const destination = path.resolve(__dirname, '..', 'public', 'vendor', 'maplibre', version, revision);
  fs.mkdirSync(destination, { recursive: true });
  const write = (file, contents) => {
    const target = path.join(destination, file);
    const bytes = Buffer.from(contents);
    if (!fs.existsSync(target) || !fs.readFileSync(target).equals(bytes)) fs.writeFileSync(target, bytes);
  };
  const license = fs.readFileSync(path.join(path.dirname(packagePath), 'LICENSE.txt'));
  write('LICENSE.txt', license);
  write('maplibre-gl.css', fs.readFileSync(path.join(source, 'maplibre-gl.css')));
  const compatibility = fs.readFileSync(path.join(__dirname, 'maplibre-compat.js'), 'utf8');
  const options = {
    bundle: true, format: 'iife', platform: 'browser', target: ['chrome79', 'safari15'],
    minify: true, write: false, legalComments: 'inline', banner: { js: compatibility },
    // The worker URL is assigned explicitly below; its ESM auto-detection is unused.
    define: { 'import.meta.url': '""' },
  };
  write('maplibre-gl-worker.cjs', buildSync({ ...options,
    entryPoints: [path.join(source, 'maplibre-gl-worker.mjs')],
  }).outputFiles[0].contents);
  const workerUrl = `/vendor/maplibre/${version}/${revision}/maplibre-gl-worker.cjs`;
  write('entry.js', buildSync({ ...options,
    stdin: { contents: `import * as api from './maplibre-gl.mjs';\napi.setWorkerUrl(${JSON.stringify(workerUrl)});\nwindow.__taxiMapLibre = api;`,
      resolveDir: source, sourcefile: 'taxi-maplibre-entry.js' },
  }).outputFiles[0].contents);
}

module.exports = { prepareMapLibreWeb };
if (require.main === module) prepareMapLibreWeb();
