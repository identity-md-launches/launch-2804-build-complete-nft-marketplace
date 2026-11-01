// Check the shipped evidence without regenerating it or reaching the network.
import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import path from 'node:path';

const names = [
  'explore-desktop', 'explore-mobile', 'squeek-detail',
  'listing-review', 'purchase-review', 'revoked-listing',
];
const files = [];
for (const name of names) {
  const file = `artifacts/screenshots/${name}.png`;
  const data = await readFile(file);
  assert(data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${file}: PNG signature`);
  let offset = 8, width, height, ended = false;
  const pixels = [];
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    assert(offset + length + 12 <= data.length, `${file}: truncated chunk`);
    const type = data.toString('ascii', offset + 4, offset + 8);
    const payload = data.subarray(offset + 8, offset + 8 + length);
    // CRC covers the chunk type and payload, so truncated or altered pixels fail.
    let crc = 0xffffffff;
    for (const byte of data.subarray(offset + 4, offset + 8 + length)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    assert.equal((crc ^ 0xffffffff) >>> 0, data.readUInt32BE(offset + 8 + length), `${file}: ${type} CRC`);
    if (type === 'IHDR') {
      width = payload.readUInt32BE(0);
      height = payload.readUInt32BE(4);
    }
    if (type === 'IDAT') pixels.push(payload);
    offset += length + 12;
    if (type === 'IEND') { ended = true; break; }
  }
  assert(ended && offset === data.length && pixels.length, `${file}: complete PNG`);
  assert(inflateSync(Buffer.concat(pixels)).length > 0, `${file}: decodable pixels`);
  assert.equal(width, name === 'explore-mobile' ? 390 : 1440, `${file}: capture width`);
  assert(height >= 844, `${file}: capture height`);
  files.push({ file: `${name}.png`, width, height, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
}

const manifest = 'artifacts/screenshots/manifest.json';
if (process.argv.includes('--write-manifest')) {
  await writeFile(manifest, JSON.stringify({ algorithm: 'SHA-256', files }, null, 2) + '\n');
} else {
  assert.deepEqual(JSON.parse(await readFile(manifest, 'utf8')).files, files, 'Screenshot manifest differs; review refreshed captures before updating it.');
}

for (const document of ['README.md', 'artifacts/screenshots/README.md']) {
  const markdown = await readFile(document, 'utf8');
  for (const match of markdown.matchAll(/\]\(([^)]+)\)/g)) {
    const href = match[1];
    if (/^(?:[a-z]+:|#)/i.test(href)) continue;
    const file = path.resolve(path.dirname(document), decodeURIComponent(href.split('#')[0]));
    assert((await stat(file)).isFile(), `${document}: broken local link ${href}`);
  }
}
console.log(`PASS: ${files.length} complete PNGs, expected widths, pixel decompression, SHA-256 manifest, and README/capture-guide local links.`);
