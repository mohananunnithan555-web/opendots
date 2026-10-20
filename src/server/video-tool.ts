import { defineTool } from '@copilotkit/runtime/v2';
import { z } from 'zod';

export function videoGenerationTool() {
  const apiKey = process.env.POLLINATIONS_API_KEY?.trim();

  return defineTool({
    name: 'generate_video',
    description:
      'Generate an AI video clip based on a visual prompt. Returns a video URL. Always embed the returned Markdown video link `[🎬 Watch Video: prompt](videoUrl)` in your final response to display the playable video to the user.',
    parameters: z.object({
      prompt: z
        .string()
        .min(1)
        .max(1000)
        .describe(
          'Detailed, descriptive visual prompt describing the scene, motion, camera movement, and subject of the video.',
        ),
    }),
    execute: async ({ prompt }) => {
      const cleanPrompt = prompt.trim();
      const seed = Math.floor(Math.random() * 10_000_000);

      if (!apiKey) {
        return {
          success: false,
          error:
            'Video generation requires a POLLINATIONS_API_KEY with available Pollen balance. Please add your key in Render environment variables and top up credits at https://enter.pollinations.ai/top-up',
          topUpUrl: 'https://enter.pollinations.ai/top-up',
        };
      }

      const videoUrl = `https://gen.pollinations.ai/video/${encodeURIComponent(
        cleanPrompt,
      )}?key=${encodeURIComponent(apiKey)}&seed=${seed}`;

      // Quick pre-flight check to verify if the account has enough credits
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const check = await fetch(videoUrl, {
          method: 'HEAD',
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (check.status === 402) {
          return {
            success: false,
            error:
              'Insufficient Pollen balance. AI video generation costs ~0.40 Pollen credits (~$0.40) per video. You can top up credits at https://enter.pollinations.ai/top-up to generate videos.',
            topUpUrl: 'https://enter.pollinations.ai/top-up',
          };
        }
      } catch {
        // Continue if HEAD pre-flight times out
      }

      return {
        success: true,
        prompt: cleanPrompt,
        videoUrl,
        markdown: `[🎬 Watch Video: ${cleanPrompt}](${videoUrl})`,
      };
    },
  });
}
