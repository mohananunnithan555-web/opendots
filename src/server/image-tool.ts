import { defineTool } from '@copilotkit/runtime/v2';
import { z } from 'zod';
import {
  buildImageGenerationConfig,
  type ImageQuality,
  type ImageAspectRatio,
  type ImageStyle,
} from './image-config.js';

export function imageGenerationTool() {
  const apiKey = process.env.POLLINATIONS_API_KEY?.trim();

  return defineTool({
    name: 'generate_image',
    description:
      'Generate an AI image based on a descriptive visual prompt. Supports quality levels (standard, hd 1080p, 4k) and aspect ratios (16:9, 1:1, 4:3, 3:4, 9:16). Returns an image URL with full resolution metadata. Always embed the returned markdown `![prompt](imageUrl)` in your final response so the user sees the image preview and download controls.',
    parameters: z.object({
      prompt: z
        .string()
        .min(1)
        .max(1500)
        .describe('Detailed, descriptive visual prompt for the image to generate.'),
      quality: z
        .enum(['standard', 'hd', '4k'])
        .optional()
        .describe(
          'Quality resolution preset: "standard" (1024px), "hd" (Full HD 1080p), or "4k" (3840x2160 Ultra HD). Default is "standard" unless the user asks for 1080p, high resolution, or 4K.',
        ),
      aspectRatio: z
        .enum(['16:9', '1:1', '4:3', '3:4', '9:16'])
        .optional()
        .describe(
          'Aspect ratio: "16:9" (widescreen/wallpaper/landscape), "1:1" (square), "9:16" (mobile/story/portrait wallpaper), "4:3" (classic landscape), or "3:4" (portrait photo). Default is "1:1" unless the user mentions landscape, wallpaper, banner, or story.',
        ),
      style: z
        .enum(['photorealistic', 'cinematic', 'anime', '3d', 'digital-art', 'general'])
        .optional()
        .describe('Visual artistic style: "photorealistic", "cinematic", "anime", "3d", or "digital-art".'),
    }),
    execute: async ({ prompt, quality, aspectRatio, style }) => {
      const config = buildImageGenerationConfig(
        {
          prompt,
          quality: (quality as ImageQuality) ?? 'standard',
          aspectRatio: (aspectRatio as ImageAspectRatio) ?? '1:1',
          style: (style as ImageStyle) ?? 'photorealistic',
        },
        apiKey,
      );

      return {
        success: true,
        prompt: config.prompt,
        imageUrl: config.imageUrl,
        quality: config.quality,
        aspectRatio: config.aspectRatio,
        dimensions: `${config.dimensions.width}x${config.dimensions.height}`,
        isUpscaled: config.isUpscaled,
        format: config.format,
        markdown: config.markdown,
        rateLimitNotice: config.rateLimitNotice,
      };
    },
  });
}
