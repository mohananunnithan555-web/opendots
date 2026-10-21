import { describe, expect, it } from 'vitest';
import {
  buildImageGenerationConfig,
  RESOLUTION_MAP,
  NATIVE_BASE_MAP,
} from '../src/server/image-config.js';
import { imageGenerationTool } from '../src/server/image-tool.js';
import { createApp } from '../src/server/app.js';
import { Store } from '../src/server/store.js';

describe('Image Generation Upgrade (1080p, 4K & Quality Controls)', () => {
  it('correctly maps all 5 aspect ratios across Standard, Full HD, and 4K resolutions', () => {
    // 1. Standard (1024 base)
    expect(RESOLUTION_MAP.standard['1:1']).toEqual({ width: 1024, height: 1024 });
    expect(RESOLUTION_MAP.standard['16:9']).toEqual({ width: 1280, height: 720 });
    expect(RESOLUTION_MAP.standard['9:16']).toEqual({ width: 720, height: 1280 });
    expect(RESOLUTION_MAP.standard['4:3']).toEqual({ width: 1024, height: 768 });
    expect(RESOLUTION_MAP.standard['3:4']).toEqual({ width: 768, height: 1024 });

    // 2. Full HD 1080p (1920x1080 for widescreen)
    expect(RESOLUTION_MAP.hd['16:9']).toEqual({ width: 1920, height: 1080 });
    expect(RESOLUTION_MAP.hd['9:16']).toEqual({ width: 1080, height: 1920 });
    expect(RESOLUTION_MAP.hd['1:1']).toEqual({ width: 1080, height: 1080 });
    expect(RESOLUTION_MAP.hd['4:3']).toEqual({ width: 1440, height: 1080 });
    expect(RESOLUTION_MAP.hd['3:4']).toEqual({ width: 1080, height: 1440 });

    // 3. 4K Ultra HD (3840x2160 for widescreen)
    expect(RESOLUTION_MAP['4k']['16:9']).toEqual({ width: 3840, height: 2160 });
    expect(RESOLUTION_MAP['4k']['9:16']).toEqual({ width: 2160, height: 3840 });
    expect(RESOLUTION_MAP['4k']['1:1']).toEqual({ width: 2160, height: 2160 });
    expect(RESOLUTION_MAP['4k']['4:3']).toEqual({ width: 2880, height: 2160 });
    expect(RESOLUTION_MAP['4k']['3:4']).toEqual({ width: 2160, height: 2880 });
  });

  it('builds genuine 4K image configuration with honest upscaled flag and native base dimensions', () => {
    const config = buildImageGenerationConfig({
      prompt: 'Epic mountain peaks under aurora borealis',
      quality: '4k',
      aspectRatio: '16:9',
      style: 'photorealistic',
      seed: 99999,
    });

    expect(config.success).toBe(true);
    expect(config.quality).toBe('4k');
    expect(config.aspectRatio).toBe('16:9');
    expect(config.dimensions).toEqual({ width: 3840, height: 2160 });
    expect(config.nativeBaseResolution).toEqual({ width: 1024, height: 576 });
    expect(config.isUpscaled).toBe(true);
    expect(config.upscaleMethod).toContain('Bicubic');

    // URL contains all requested parameters
    expect(config.imageUrl).toContain('width=3840');
    expect(config.imageUrl).toContain('height=2160');
    expect(config.imageUrl).toContain('model=flux');
    expect(config.imageUrl).toContain('nologo=true');
    expect(config.imageUrl).toContain('seed=99999');
    expect(config.imageUrl).toContain('quality=4k');

    // Markdown includes formatted alt metadata
    expect(config.markdown).toContain('4K');
    expect(config.markdown).toContain('16:9');
    expect(config.markdown).toContain('3840x2160');
  });

  it('builds Full HD (1080p) image configuration with style keywords', () => {
    const config = buildImageGenerationConfig({
      prompt: 'Cyberpunk street food vendor at night',
      quality: 'hd',
      aspectRatio: '16:9',
      style: 'cinematic',
    });

    expect(config.dimensions).toEqual({ width: 1920, height: 1080 });
    expect(config.quality).toBe('hd');
    expect(config.enhancedPrompt).toContain('cinematic lighting');
    expect(config.imageUrl).toContain('width=1920');
    expect(config.imageUrl).toContain('height=1080');
  });

  it('executes imageGenerationTool with CopilotKit tool definition and returns metadata', async () => {
    const tool = imageGenerationTool();
    expect(tool.name).toBe('generate_image');

    const result = await (tool.execute as any)({
      prompt: 'A tranquil Japanese zen garden with maple leaves',
      quality: 'hd',
      aspectRatio: '16:9',
      style: 'photorealistic',
    });

    expect(result.success).toBe(true);
    expect(result.quality).toBe('hd');
    expect(result.aspectRatio).toBe('16:9');
    expect(result.dimensions).toBe('1920x1080');
    expect(result.imageUrl).toContain('width=1920');
    expect(result.imageUrl).toContain('height=1080');
    expect(result.markdown).toContain('![A tranquil Japanese zen garden');
  });

  it('provides secure proxy and download endpoints via REST API', async () => {
    const store = new Store(':memory:');
    const app = createApp({
      store,
      runner: {} as any,
      config: { mode: 'live' } as any,
    });

    // 1. POST /api/image/generate
    const genRes = await app.request('/api/image/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Futuristic solar power station in the Sahara',
        quality: '4k',
        aspectRatio: '16:9',
      }),
    });

    expect(genRes.status).toBe(200);
    const genData = (await genRes.json()) as any;
    expect(genData.dimensions.width).toBe(3840);
    expect(genData.dimensions.height).toBe(2160);
    expect(genData.quality).toBe('4k');
    expect(genData.isUpscaled).toBe(true);

    // 2. Reject SSRF / unauthorized hosts on /api/image/proxy
    const badProxy = await app.request('/api/image/proxy?url=https://evil-site.com/steal.png');
    expect(badProxy.status).toBe(403);

    // 3. Reject SSRF / unauthorized hosts on /api/image/download
    const badDownload = await app.request('/api/image/download?url=https://malicious.org/payload.exe');
    expect(badDownload.status).toBe(403);

    store.close();
  });
});
