import * as fc from 'fast-check';
import sharp from 'sharp';

import { MediaService } from '../../src/services/media/media.service';
import { IMAGE_RESOLUTIONS } from '../../src/services/media/types';

// ============================================================================
// Test Helpers & Generators
// ============================================================================

/**
 * Generator for arbitrary image dimensions (width 100-3000, height 100-3000).
 */
const imageDimensionsArb = fc.record({
  width: fc.integer({ min: 100, max: 3000 }),
  height: fc.integer({ min: 100, max: 3000 }),
});

/**
 * Create a test image buffer with the given dimensions using sharp.
 * Uses PNG format to avoid JPEG compression artifacts that can alter
 * decoded dimensions.
 */
async function createTestImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .png()
    .toBuffer();
}

// ============================================================================
// Property 36: Image multi-resolution aspect ratio preservation
// ============================================================================

/**
 * **Validates: Requirements 16.1**
 *
 * Property 36: Image multi-resolution aspect ratio preservation
 *
 * For any image with known dimensions, generating multi-resolution variants
 * SHALL preserve the original aspect ratio within a 1-pixel tolerance for
 * each variant.
 */
describe('Property 36: Image multi-resolution aspect ratio preservation', () => {
  const mediaService = new MediaService({
    s3Client: {} as any,
    bucket: 'test-bucket',
  });

  it('resizing to each standard resolution preserves aspect ratio within 1-pixel tolerance', async () => {
    await fc.assert(
      fc.asyncProperty(imageDimensionsArb, async ({ width, height }) => {
        // Create a test image with the given dimensions
        const imageBuffer = await createTestImage(width, height);

        // Resize to each of the standard resolutions (150, 600, 1200)
        for (const resolution of IMAGE_RESOLUTIONS) {
          const resizedBuffer = await mediaService.resizeImage(imageBuffer, {
            width: resolution.width,
          });

          // Get the actual output dimensions
          const metadata = await sharp(resizedBuffer).metadata();
          const outputWidth = metadata.width!;
          const outputHeight = metadata.height!;

          // The effective target width is capped by the original width
          // (withoutEnlargement: true means it won't upscale).
          // sharp uses fit: 'inside' which fits within a bounding box.
          // For width-only constraint, the output width should be at most the target.
          expect(outputWidth).toBeLessThanOrEqual(Math.min(resolution.width, width));

          // Verify aspect ratio preservation within 1-pixel tolerance.
          // The ideal height for the output width, given the original aspect ratio:
          const idealHeight = (outputWidth * height) / width;

          // The output height (integer) should be within 1 pixel of the ideal
          // height (fractional). Since both input and output are integers and
          // sharp rounds internally, we check that the integer output is within
          // 1 of the nearest integer to the ideal.
          const roundedIdealHeight = Math.round(idealHeight);
          expect(Math.abs(outputHeight - roundedIdealHeight)).toBeLessThanOrEqual(1);
        }
      }),
      { numRuns: 100 },
    );
  });
});
