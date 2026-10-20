import { defineTool } from '@copilotkit/runtime/v2';
import { z } from 'zod';

export function imageGenerationTool() {
  const apiKey = process.env.POLLINATIONS_API_KEY?.trim();

  return defineTool({
    name: 'generate_image',
    description:
      'Generate an AI image based on a descriptive visual prompt. Returns an image URL. Always embed the returned markdown `![prompt](imageUrl)` in your final response to display the image to the user.',
    parameters: z.object({
      prompt: z
        .string()
        .min(1)
        .max(1000)
        .describe('Detailed, descriptive visual prompt for the image to generate.'),
    }),
    execute: async ({ prompt }) => {
      const cleanPrompt = prompt.trim();
      const seed = Math.floor(Math.random() * 10_000_000);
      const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';
      const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
        cleanPrompt,
      )}?width=1024&height=1024&nologo=true&seed=${seed}${keyParam}`;

      return {
        success: true,
        prompt: cleanPrompt,
        imageUrl,
        markdown: `![${cleanPrompt}](${imageUrl})`,
        rateLimitNotice: apiKey
          ? undefined
          : 'Note: Free tier enforces a 45-second cooldown between consecutive images. If generating another image within 45 seconds, mention that they can wait 45s and click the Refresh button below the image, or add a free POLLINATIONS_API_KEY to Render for instant generation.',
      };
    },
  });
}
