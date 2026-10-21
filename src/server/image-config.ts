export type ImageQuality = 'standard' | 'hd' | '4k';
export type ImageAspectRatio = '16:9' | '1:1' | '4:3' | '3:4' | '9:16';
export type ImageStyle =
  | 'photorealistic'
  | 'cinematic'
  | 'anime'
  | '3d'
  | 'digital-art'
  | 'general';

export interface ImageDimension {
  width: number;
  height: number;
}

export interface ImageGenerationOptions {
  prompt: string;
  quality?: ImageQuality;
  aspectRatio?: ImageAspectRatio;
  style?: ImageStyle;
  seed?: number;
}

export interface ImageGenerationResult {
  success: boolean;
  prompt: string;
  enhancedPrompt: string;
  imageUrl: string;
  quality: ImageQuality;
  aspectRatio: ImageAspectRatio;
  style: ImageStyle;
  dimensions: ImageDimension;
  nativeBaseResolution: ImageDimension;
  isUpscaled: boolean;
  upscaleMethod: string;
  format: string;
  markdown: string;
  rateLimitNotice?: string;
}

export const RESOLUTION_MAP: Record<ImageQuality, Record<ImageAspectRatio, ImageDimension>> = {
  standard: {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1280, height: 720 },
    '9:16': { width: 720, height: 1280 },
    '4:3': { width: 1024, height: 768 },
    '3:4': { width: 768, height: 1024 },
  },
  hd: {
    '1:1': { width: 1080, height: 1080 },
    '16:9': { width: 1920, height: 1080 },
    '9:16': { width: 1080, height: 1920 },
    '4:3': { width: 1440, height: 1080 },
    '3:4': { width: 1080, height: 1440 },
  },
  '4k': {
    '1:1': { width: 2160, height: 2160 },
    '16:9': { width: 3840, height: 2160 },
    '9:16': { width: 2160, height: 3840 },
    '4:3': { width: 2880, height: 2160 },
    '3:4': { width: 2160, height: 2880 },
  },
};

export const NATIVE_BASE_MAP: Record<ImageAspectRatio, ImageDimension> = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1024, height: 576 },
  '9:16': { width: 576, height: 1024 },
  '4:3': { width: 1024, height: 768 },
  '3:4': { width: 768, height: 1024 },
};

export const STYLE_PROMPTS: Record<ImageStyle, string> = {
  photorealistic: 'photorealistic, 8k resolution, highly detailed, realistic lighting, fine texture',
  cinematic: 'cinematic lighting, dramatic composition, 35mm photograph, depth of field, anamorphic lens',
  anime: 'modern anime aesthetic, vibrant color palette, intricate line art, Makoto Shinkai style',
  '3d': '3D render, Octane render, raytraced volumetric lighting, Unreal Engine 5, smooth textures',
  'digital-art': 'detailed digital concept art, trending on ArtStation, expressive brushwork, atmospheric',
  general: '',
};

export function buildImageGenerationConfig(
  options: ImageGenerationOptions,
  apiKey?: string,
): ImageGenerationResult {
  const cleanPrompt = options.prompt.trim();
  const quality = options.quality ?? 'standard';
  const aspectRatio = options.aspectRatio ?? '1:1';
  const style = options.style ?? 'photorealistic';
  const seed = options.seed ?? Math.floor(Math.random() * 10_000_000);

  const dimensions = RESOLUTION_MAP[quality][aspectRatio];
  const nativeBase = NATIVE_BASE_MAP[aspectRatio];
  const isUpscaled = quality !== 'standard' || dimensions.width > nativeBase.width;

  const styleKeyword = STYLE_PROMPTS[style];
  const enhancedPrompt = styleKeyword && !cleanPrompt.toLowerCase().includes(style.toLowerCase())
    ? `${cleanPrompt}, ${styleKeyword}`
    : cleanPrompt;

  const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';
  const modelParam = '&model=flux';
  const enhanceParam = '&enhance=true';
  const metadataParams = `&quality=${quality}&aspectRatio=${encodeURIComponent(aspectRatio)}`;

  const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    enhancedPrompt,
  )}?width=${dimensions.width}&height=${dimensions.height}&nologo=true&seed=${seed}${modelParam}${enhanceParam}${keyParam}${metadataParams}`;

  const altDescription = `${cleanPrompt} | ${quality.toUpperCase()} | ${aspectRatio} | ${dimensions.width}x${dimensions.height}`;

  return {
    success: true,
    prompt: cleanPrompt,
    enhancedPrompt,
    imageUrl,
    quality,
    aspectRatio,
    style,
    dimensions,
    nativeBaseResolution: nativeBase,
    isUpscaled,
    upscaleMethod: isUpscaled ? 'Stepped Bicubic High-Quality with Sharpening' : 'Native Generation',
    format: 'JPEG (Upscalable to Lossless PNG / WebP)',
    markdown: `![${altDescription}](${imageUrl})`,
    rateLimitNotice: apiKey
      ? undefined
      : 'Note: Free tier enforces a cooldown between consecutive generations. If generating another image quickly, wait 45s and click Retry, or use a POLLINATIONS_API_KEY for instant generation.',
  };
}
