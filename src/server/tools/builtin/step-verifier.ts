import { z } from 'zod';
import type { OpenDotsToolDefinition } from '../types.js';

export const stepVerifierTool: OpenDotsToolDefinition<
  {
    stepTitle: string;
    acceptanceCriteria: string[];
    outputToVerify: string;
  },
  {
    verified: boolean;
    passedCriteria: string[];
    failedCriteria: string[];
    confidence: number;
    recommendation: 'proceed' | 'replan' | 'retry_step';
    feedback: string;
  }
> = {
  name: 'verify_step_output',
  description:
    'Rigorously verify that a plan step output fulfills all defined acceptance criteria before marking the step completed.',
  parameters: z.object({
    stepTitle: z.string().describe('Title of the step being verified'),
    acceptanceCriteria: z.array(z.string()).describe('List of necessary conditions for success'),
    outputToVerify: z.string().describe('The actual output, code, or summary produced'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 10_000,
  maxOutputChars: 8_000,
  execute: async ({ stepTitle, acceptanceCriteria, outputToVerify }, _ctx) => {
    const passedCriteria: string[] = [];
    const failedCriteria: string[] = [];

    const lowerOutput = outputToVerify.toLowerCase();
    const hasFailureWords =
      lowerOutput.includes('error:') ||
      lowerOutput.includes('failed to') ||
      lowerOutput.includes('cannot find') ||
      lowerOutput.includes('fatal error');

    for (const criterion of acceptanceCriteria) {
      if (hasFailureWords) {
        failedCriteria.push(criterion);
        continue;
      }

      const keywords = criterion
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3 && !['with', 'without', 'must', 'have', 'from'].includes(w));
      const matches = keywords.filter((k) => lowerOutput.includes(k));

      if (matches.length > 0) {
        passedCriteria.push(criterion);
      } else {
        failedCriteria.push(criterion);
      }
    }

    const verified = failedCriteria.length === 0 && outputToVerify.trim().length > 10;
    const confidence = passedCriteria.length / Math.max(1, acceptanceCriteria.length);

    let recommendation: 'proceed' | 'replan' | 'retry_step' = 'proceed';
    let feedback = `Step "${stepTitle}" verified with ${(confidence * 100).toFixed(0)}% acceptance.`;

    if (!verified) {
      recommendation = failedCriteria.length > 1 || hasFailureWords ? 'replan' : 'retry_step';
      feedback = `Verification failed for criteria: ${failedCriteria.join(', ')}. Action recommended: ${recommendation}.`;
    }

    return {
      verified,
      passedCriteria,
      failedCriteria,
      confidence,
      recommendation,
      feedback,
    };
  },
};
