/* global __dirname */
const { readFileSync } = require('node:fs');
const { Buffer } = require('node:buffer');
const { resolve } = require('node:path');
const { createHash } = require('node:crypto');
const { version } = require('maplibre-gl/package.json');
const { revision } = require('../src/components/map/maplibre-assets.json');

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function verifyMapLibreDeployment(origin) {
  const base = new URL(origin);
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Expected an HTTP(S) website URL');
  for (const [file, contentType] of [
    ['entry.js', /^(application|text)\/javascript(?:;|$)/i],
    ['maplibre-gl-worker.cjs', /^(application|text)\/javascript(?:;|$)/i],
    ['maplibre-gl.css', /^text\/css(?:;|$)/i],
  ]) {
    const assetPath = `vendor/maplibre/${version}/${revision}/${file}`;
    const expected = digest(readFileSync(resolve(__dirname, '..', 'dist', assetPath)));
    const url = new URL(`/${assetPath}`, base);
    for (let attempt = 1; ; attempt += 1) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
        const type = response.headers.get('content-type') || '';
        if (!contentType.test(type)) throw new Error(`${file}: unexpected content type ${type}`);
        if (digest(Buffer.from(await response.arrayBuffer())) !== expected) {
          throw new Error(`${file}: deployed contents differ from this release`);
        }
        console.log(`Verified ${assetPath}: content type and SHA-256 match`);
        break;
      } catch (error) {
        if (attempt >= 3) throw error;
        await new Promise(done => setTimeout(done, 2_000));
      }
    }
  }
}

module.exports = { verifyMapLibreDeployment };
if (require.main === module) {
  verifyMapLibreDeployment(process.argv[2]).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
