import { z } from 'zod';
import type { OpenDotsToolDefinition } from '../tools/types.js';
import { globalVeniceBridge } from './venice-website-bridge.js';
import type { VeniceTaskResult } from './venice-types.js';

/**
 * Universal Venice.ai Website Bridge Tool.
 * Routes media generation and uncensored research requests through the Venice website connector at ₹0 cost.
 */
export const veniceWebsiteBridgeTool: OpenDotsToolDefinition<
  {
    action: 'image' | 'video' | 'research';
    prompt: string;
    aspectRatio?: '16:9' | '1:1' | '9:16' | '4:3' | '3:4';
    style?: string;
    model?: string;
  },
  VeniceTaskResult
> = {
  name: 'venice_website_bridge',
  description:
    'Bridge to interact with the Venice.ai website (https://venice.ai/) for image generation, video generation, and uncensored research without requiring an API key (₹0 cost). Use ONLY when the user explicitly requests Venice or Venice.ai.',
  parameters: z.object({
    action: z.enum(['image', 'video', 'research']).describe('The Venice action to perform.'),
    prompt: z.string().min(1).describe('Prompt, query, or description for Venice.'),
    aspectRatio: z.enum(['16:9', '1:1', '9:16', '4:3', '3:4']).optional().describe('Aspect ratio for image generation.'),
    style: z.string().optional().describe('Visual style (e.g. photorealistic, anime, cinematic, digital-art).'),
    model: z.string().optional().describe('Venice model preference if known (e.g. flux-dev, llama-3.3-70b).'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 45_000,
  isPaidService: false,
  costEstimateUsd: 0,
  execute: async ({ action, prompt, aspectRatio, style, model }, ctx) => {
    return globalVeniceBridge.executeTask(
      {
        type: action,
        prompt,
        settings: {
          aspectRatio,
          style,
          model,
        },
        ownerId: ctx.userId,
        threadId: ctx.dotId,
      },
      ctx.signal,
    );
  },
};

/**
 * Venice.ai Image Generation Tool.
 */
export const veniceImageTool: OpenDotsToolDefinition<
  {
    prompt: string;
    aspectRatio?: '16:9' | '1:1' | '9:16' | '4:3' | '3:4';
    style?: string;
    model?: string;
  },
  VeniceTaskResult
> = {
  name: 'venice_generate_image',
  description:
    'Generate images via the Venice.ai website studio at ₹0 cost. Use when the user explicitly requests Venice / Venice.ai for image creation.',
  parameters: z.object({
    prompt: z.string().min(1).describe('Visual description of the image to generate on Venice.'),
    aspectRatio: z.enum(['16:9', '1:1', '9:16', '4:3', '3:4']).optional().describe('Target aspect ratio (default: 1:1).'),
    style: z.string().optional().describe('Visual style.'),
    model: z.string().optional().describe('Image model preference on Venice (default: flux-dev).'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 45_000,
  isPaidService: false,
  costEstimateUsd: 0,
  execute: async ({ prompt, aspectRatio, style, model }, ctx) => {
    return globalVeniceBridge.executeTask(
      {
        type: 'image',
        prompt,
        settings: { aspectRatio, style, model },
        ownerId: ctx.userId,
      },
      ctx.signal,
    );
  },
};

/**
 * Venice.ai Video Generation Tool.
 */
export const veniceVideoTool: OpenDotsToolDefinition<
  {
    prompt: string;
  },
  VeniceTaskResult
> = {
  name: 'venice_generate_video',
  description:
    'Initiate video generation via Venice.ai. Checks account availability and returns an authorized Venice video studio session link so the user can generate without incurring unexpected costs.',
  parameters: z.object({
    prompt: z.string().min(1).describe('Description of the motion / video to generate on Venice.'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 30_000,
  isPaidService: false,
  costEstimateUsd: 0,
  execute: async ({ prompt }, ctx) => {
    return globalVeniceBridge.executeTask(
      {
        type: 'video',
        prompt,
        ownerId: ctx.userId,
      },
      ctx.signal,
    );
  },
};

/**
 * Venice.ai Research Tool.
 */
export const veniceResearchTool: OpenDotsToolDefinition<
  {
    query: string;
  },
  VeniceTaskResult
> = {
  name: 'venice_research',
  description:
    'Query Venice.ai for uncensored research and web information at ₹0 cost. Use when the user explicitly asks to research using Venice.',
  parameters: z.object({
    query: z.string().min(1).describe('Search query or question for Venice.ai.'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 35_000,
  isPaidService: false,
  costEstimateUsd: 0,
  execute: async ({ query }, ctx) => {
    return globalVeniceBridge.executeTask(
      {
        type: 'research',
        prompt: query,
        ownerId: ctx.userId,
      },
      ctx.signal,
    );
  },
};
