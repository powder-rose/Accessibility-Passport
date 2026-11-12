import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fitReferenceDimensions,
  inspectReferenceHeader,
  prepareReference,
} from '../src/components/admin/ai/prepare-reference';

function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(24);
  b.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  b.set([73, 72, 68, 82], 12);
  const view = new DataView(b.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return b;
}

test('reference headers detect valid PNG, JPEG and WebP dimensions before decoding', () => {
  assert.deepEqual(inspectReferenceHeader(png(1024, 768)), {
    type: 'image/png',
    width: 1024,
    height: 768,
  });
  const jpeg = new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0, 7, 8, 0x03, 0x20, 0x04, 0xb0,
  ]);
  assert.deepEqual(inspectReferenceHeader(jpeg), {
    type: 'image/jpeg',
    width: 1200,
    height: 800,
  });
  const webp = new Uint8Array(30);
  webp.set([82, 73, 70, 70], 0);
  webp.set([87, 69, 66, 80, 86, 80, 56, 88], 8);
  webp.set([0xff, 0x03, 0, 0xff, 0x01, 0], 24);
  assert.deepEqual(inspectReferenceHeader(webp), {
    type: 'image/webp',
    width: 1024,
    height: 512,
  });
});

test('reference size guards reject invalid files and pixel bombs', async () => {
  assert.throws(
    () => inspectReferenceHeader(new Uint8Array(30)),
    /JPEG, PNG или WebP/,
  );
  assert.throws(() => inspectReferenceHeader(png(20_000, 1)), /разрешение/i);
  assert.throws(() => inspectReferenceHeader(png(6_001, 6_000)), /разрешение/i);
  await assert.rejects(
    () => prepareReference(new File([], 'empty.png', { type: 'image/png' })),
    /20 МБ/,
  );
  const oversized = new File(
    [new Uint8Array(20 * 1024 * 1024 + 1)],
    'large.jpg',
    { type: 'image/jpeg' },
  );
  await assert.rejects(() => prepareReference(oversized), /20 МБ/);
});

test('resize geometry keeps portrait and landscape proportions without upscaling', () => {
  assert.deepEqual(fitReferenceDimensions(6000, 3000), {
    width: 4096,
    height: 2048,
  });
  assert.deepEqual(fitReferenceDimensions(2000, 4000), {
    width: 2000,
    height: 4000,
  });
  assert.deepEqual(fitReferenceDimensions(3000, 6000), {
    width: 2048,
    height: 4096,
  });
});

test('large references are compressed locally and object URLs are released on success and decode errors', async (t) => {
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    'document',
  );
  let failDecode = false;
  let draws = 0;
  class FakeImage {
    src = '';
    naturalWidth = 3000;
    naturalHeight = 2000;
    async decode() {
      if (failDecode) throw new Error('invalid');
    }
  }
  const context = {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: '',
    clearRect() {},
    drawImage() {
      draws++;
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: (callback: (blob: Blob) => void) =>
      callback(new Blob(['result'], { type: 'image/webp' })),
  };
  Object.defineProperty(globalThis, 'Image', {
    value: FakeImage,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'document', {
    value: { createElement: () => canvas },
    configurable: true,
  });
  const create = t.mock.method(URL, 'createObjectURL', () => 'blob:test');
  const revoke = t.mock.method(URL, 'revokeObjectURL', () => {});
  t.after(() => {
    if (originalImage)
      Object.defineProperty(globalThis, 'Image', originalImage);
    else Reflect.deleteProperty(globalThis, 'Image');
    if (originalDocument)
      Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const bytes = new Uint8Array(10 * 1024 * 1024);
  bytes.set(png(3000, 2000));
  const source = new File([bytes], 'reference.png', { type: 'image/png' });
  const output = await prepareReference(source);
  assert.equal(output.type, 'image/webp');
  assert.ok(output.size <= 5 * 1024 * 1024);
  assert.deepEqual([canvas.width, canvas.height], [3000, 2000]);
  assert.equal(draws, 1);
  assert.equal(create.mock.callCount(), 1);
  assert.equal(revoke.mock.callCount(), 1);
  failDecode = true;
  await assert.rejects(() => prepareReference(source), /повреждён/);
  assert.equal(revoke.mock.callCount(), 2);
});
