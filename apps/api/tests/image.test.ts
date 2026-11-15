import { MEDIA_WIDTHS } from '@shop/shared';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { detectImageKind, ImageRejectedError, processImage } from '../src/lib/image';

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } });

describe('detectImageKind', () => {
  it('recognises JPEG, PNG and WebP by their bytes', async () => {
    expect(detectImageKind(await solid(10, 10).jpeg().toBuffer())).toBe('jpeg');
    expect(detectImageKind(await solid(10, 10).png().toBuffer())).toBe('png');
    expect(detectImageKind(await solid(10, 10).webp().toBuffer())).toBe('webp');
  });

  it('rejects everything else, whatever the file is called', async () => {
    expect(
      detectImageKind(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
    ).toBeNull();
    expect(detectImageKind(Buffer.from('MZ\x90\x00 executable'))).toBeNull();
    expect(detectImageKind(await solid(10, 10).gif().toBuffer())).toBeNull();
    expect(detectImageKind(Buffer.alloc(0))).toBeNull();
  });
});

describe('processImage', () => {
  it('writes WebP at every width, never upscaling, and strips metadata', async () => {
    const input = await solid(1200, 800)
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'secret-gps-owner' } } })
      .toBuffer();
    const out = await processImage(input, 'jpeg');
    expect(out).toMatchObject({ width: 1200, height: 800 });
    expect(out.outputs.map((o) => o.width)).toEqual([...MEDIA_WIDTHS]);

    const widths = await Promise.all(
      out.outputs.map(async (o) => (await sharp(o.body).metadata()).width),
    );
    expect(widths).toEqual([200, 500, 1000, 1200]); // 1600 is not upscaled beyond the original
    for (const o of out.outputs) {
      const meta = await sharp(o.body).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
    }
  });

  it('applies EXIF orientation (a rotated phone photo stays upright)', async () => {
    // Stored 800x400 with orientation 6 (rotate 90°): it displays as 400x800.
    const input = await solid(800, 400).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const out = await processImage(input, 'jpeg');
    expect(out).toMatchObject({ width: 400, height: 800 });
    const largest = await sharp(out.outputs.at(-1)!.body).metadata();
    expect([largest.width, largest.height]).toEqual([400, 800]);
  });

  it('rejects content that does not match the detected type', async () => {
    const jpegData = await solid(300, 300).jpeg().toBuffer();
    const fakePng = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      jpegData,
    ]);
    await expect(processImage(fakePng, 'png')).rejects.toBeInstanceOf(ImageRejectedError);
  });

  it('rejects tiny images', async () => {
    await expect(processImage(await solid(80, 300).png().toBuffer(), 'png')).rejects.toThrow(
      /at least 100 px/,
    );
  });
});
