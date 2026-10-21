export interface ImageDownloadOptions {
  url: string;
  quality?: 'standard' | 'hd' | '4k';
  aspectRatio?: '16:9' | '1:1' | '4:3' | '3:4' | '9:16';
  targetWidth?: number;
  targetHeight?: number;
  format?: 'png' | 'jpeg' | 'webp';
  filename?: string;
}

export interface ParsedImageMetadata {
  prompt: string;
  quality: 'standard' | 'hd' | '4k';
  aspectRatio: '16:9' | '1:1' | '4:3' | '3:4' | '9:16';
  width: number;
  height: number;
  nativeWidth: number;
  nativeHeight: number;
  isUpscaled: boolean;
  label: string;
  isPollinations: boolean;
}

const DEFAULT_DIMS: Record<string, Record<string, { width: number; height: number }>> = {
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

export function parseImageMetadata(url: string, alt?: string): ParsedImageMetadata {
  const isPollinations = url.includes('pollinations.ai');
  let prompt = alt ?? 'Generated image';
  let quality: 'standard' | 'hd' | '4k' = 'standard';
  let aspectRatio: '16:9' | '1:1' | '4:3' | '3:4' | '9:16' = '1:1';
  let width = 1024;
  let height = 1024;

  try {
    const parsed = new URL(url, window.location.href);
    const qParam = parsed.searchParams.get('quality');
    const arParam = parsed.searchParams.get('aspectRatio');
    const wParam = parseInt(parsed.searchParams.get('width') ?? '', 10);
    const hParam = parseInt(parsed.searchParams.get('height') ?? '', 10);

    if (qParam === '4k' || qParam === 'hd' || qParam === 'standard') {
      quality = qParam;
    } else if (wParam >= 3840 || hParam >= 3840 || wParam === 2160) {
      quality = '4k';
    } else if (wParam === 1920 || hParam === 1920 || (wParam === 1080 && hParam === 1080)) {
      quality = 'hd';
    }

    if (['16:9', '1:1', '4:3', '3:4', '9:16'].includes(arParam ?? '')) {
      aspectRatio = arParam as any;
    } else if (wParam && hParam) {
      const ratio = wParam / hParam;
      if (Math.abs(ratio - 16 / 9) < 0.1) aspectRatio = '16:9';
      else if (Math.abs(ratio - 9 / 16) < 0.1) aspectRatio = '9:16';
      else if (Math.abs(ratio - 4 / 3) < 0.1) aspectRatio = '4:3';
      else if (Math.abs(ratio - 3 / 4) < 0.1) aspectRatio = '3:4';
      else if (Math.abs(ratio - 1) < 0.1) aspectRatio = '1:1';
    }

    const expected = DEFAULT_DIMS[quality]?.[aspectRatio];
    width = wParam && !isNaN(wParam) ? wParam : (expected?.width ?? 1024);
    height = hParam && !isNaN(hParam) ? hParam : (expected?.height ?? 1024);
  } catch {}

  // Parse structured alt text if present: "prompt | 4K | 16:9 | 3840x2160"
  if (alt && alt.includes('|')) {
    const parts = alt.split('|').map((s) => s.trim());
    prompt = parts[0] || prompt;
  }

  const isUpscaled = quality !== 'standard' || width > 1024 || height > 1024;
  const label =
    quality === '4k'
      ? `4K UHD (${width} × ${height})`
      : quality === 'hd'
        ? `Full HD 1080p (${width} × ${height})`
        : `Standard (${width} × ${height})`;

  const nativeBaseWidth = Math.round(width * (1024 / Math.max(width, height)));
  const nativeBaseHeight = Math.round(height * (1024 / Math.max(width, height)));

  return {
    prompt,
    quality,
    aspectRatio,
    width,
    height,
    nativeWidth: nativeBaseWidth,
    nativeHeight: nativeBaseHeight,
    isUpscaled,
    label,
    isPollinations,
  };
}

export async function downloadImageFile(options: ImageDownloadOptions): Promise<{
  success: boolean;
  actualWidth: number;
  actualHeight: number;
  format: string;
  sizeBytes: number;
}> {
  const meta = parseImageMetadata(options.url);
  const quality = options.quality ?? meta.quality;
  const aspectRatio = options.aspectRatio ?? meta.aspectRatio;
  const format = options.format ?? 'png';
  const targetWidth = options.targetWidth ?? meta.width;
  const targetHeight = options.targetHeight ?? meta.height;

  const defaultFilename = `opendots-image-${quality}-${targetWidth}x${targetHeight}.${format}`;
  const filename = options.filename ?? defaultFilename;

  // 1. Direct Server-Side Download (Fastest for standard JPEG when no upscale is needed)
  if (format === 'jpeg' && !meta.isUpscaled && !options.targetWidth) {
    const downloadEndpoint = `/api/image/download?url=${encodeURIComponent(options.url)}&filename=${encodeURIComponent(filename)}`;
    const link = document.createElement('a');
    link.href = downloadEndpoint;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return {
      success: true,
      actualWidth: targetWidth,
      actualHeight: targetHeight,
      format: 'jpeg',
      sizeBytes: 0,
    };
  }

  // 2. High-Precision Client-Side Canvas Upscaler & Exporter
  // Fetches binary bytes via same-origin backend proxy to bypass CORS restrictions
  const proxyUrl = `/api/image/proxy?url=${encodeURIComponent(options.url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) {
    throw new Error(`Failed to load image from proxy (Status ${res.status}).`);
  }
  const blob = await res.blob();

  // Load into Image element
  const img = new Image();
  img.crossOrigin = 'anonymous';
  const objectUrl = URL.createObjectURL(blob);

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Image failed to decode.'));
    img.src = objectUrl;
  });

  // Render to target resolution canvas with high-quality smoothing
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    URL.revokeObjectURL(objectUrl);
    throw new Error('Canvas 2D context unavailable.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  URL.revokeObjectURL(objectUrl);

  // Determine MIME type
  const mimeType = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';
  const qualityParam = format === 'png' ? undefined : 0.95;

  const outputBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, qualityParam);
  });

  if (!outputBlob) {
    throw new Error('Failed to encode image to selected format.');
  }

  // Trigger browser download
  const downloadUrl = URL.createObjectURL(outputBlob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 8000);

  return {
    success: true,
    actualWidth: targetWidth,
    actualHeight: targetHeight,
    format,
    sizeBytes: outputBlob.size,
  };
}
