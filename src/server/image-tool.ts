import { defineTool } from '@copilotkit/runtime/v2';
import { z } from 'zod';

export function imageGenerationTool() {
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
      const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
        cleanPrompt,
      )}?width=1024&height=1024&nologo=true&seed=${seed}`;

      return {
        success: true,
        prompt: cleanPrompt,
        imageUrl,
        markdown: `![${cleanPrompt}](${imageUrl})`,
      };
    },
  });
}
