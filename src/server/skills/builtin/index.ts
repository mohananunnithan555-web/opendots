import { globalSkillRegistry } from '../skill-registry.js';
import { mathEvalSkill } from './math-eval.js';
import { textStatsSkill } from './text-stats.js';

export function registerDefaultSkills(): void {
  if (!globalSkillRegistry.has(mathEvalSkill.metadata.id)) {
    globalSkillRegistry.register(mathEvalSkill);
  }
  if (!globalSkillRegistry.has(textStatsSkill.metadata.id)) {
    globalSkillRegistry.register(textStatsSkill);
  }
}

// Auto-register default skills on import
registerDefaultSkills();

export { mathEvalSkill, textStatsSkill };
