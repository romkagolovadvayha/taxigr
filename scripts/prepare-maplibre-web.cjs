const fs = require('node:fs');
const path = require('node:path');

// Keep the ESM worker and its shared module together. Metro cannot rewrite
// their import.meta.url references as part of the application bundle.
function prepareMapLibreWeb() {
  const packagePath = require.resolve('maplibre-gl/package.json');
  const { version } = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const source = path.join(path.dirname(packagePath), 'dist');
  const destination = path.resolve(__dirname, '..', 'public', 'vendor', 'maplibre', version);
  fs.mkdirSync(destination, { recursive: true });
  const license = fs.readFileSync(path.join(path.dirname(packagePath), 'LICENSE.txt'));
  const licenseTarget = path.join(destination, 'LICENSE.txt');
  if (!fs.existsSync(licenseTarget) || !fs.readFileSync(licenseTarget).equals(license)) fs.writeFileSync(licenseTarget, license);
  for (const file of ['maplibre-gl.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl.css']) {
    const contents = fs.readFileSync(path.join(source, file));
    const target = path.join(destination, file);
    if (!fs.existsSync(target) || !fs.readFileSync(target).equals(contents)) fs.writeFileSync(target, contents);
  }
  const entry = `import * as api from './maplibre-gl.mjs';\napi.setWorkerUrl(new URL('./maplibre-gl-worker.mjs', import.meta.url).href);\nwindow.__taxiMapLibre = api;\n`;
  const entryPath = path.join(destination, 'entry.mjs');
  if (!fs.existsSync(entryPath) || fs.readFileSync(entryPath, 'utf8') !== entry) fs.writeFileSync(entryPath, entry);
}

module.exports = { prepareMapLibreWeb };
if (require.main === module) prepareMapLibreWeb();
