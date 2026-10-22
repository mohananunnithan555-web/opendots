export type GrokPersonaMode = 'normal' | 'think' | 'fun' | 'deepsearch' | 'de-hype';

export interface GrokModeConfig {
  mode: GrokPersonaMode;
  name: string;
  tagline: string;
  systemPromptModifier: string;
  requiresCoT: boolean;
  cost: string;
}

export const GROK_MODES: Record<GrokPersonaMode, GrokModeConfig> = {
  normal: {
    mode: 'normal',
    name: 'Normal Mode',
    tagline: 'Direct, factual, and objective assistance.',
    systemPromptModifier:
      'Maintain an objective, helpful, clear, and direct communication style. Deliver factual, well-organized answers without extraneous fluff.',
    requiresCoT: false,
    cost: '₹0.00 / Standard Free Model',
  },
  think: {
    mode: 'think',
    name: 'Think Mode',
    tagline: 'Extended chain-of-thought, self-correcting logic, and formula validation.',
    systemPromptModifier:
      'ACTIVATE THINK MODE: Before giving your final response, explicitly write an internal reasoning scratchpad enclosed in <thought>...</thought> tags. In your thoughts: (1) break the query into sub-problems, (2) double-check calculations and edge cases, (3) identify and self-correct potential errors, and (4) synthesize the verified solution. After the </thought> tag, deliver your clear, verified final answer.',
    requiresCoT: true,
    cost: '₹0.00 / Zero-Cost Chain-of-Thought Reasoning',
  },
  fun: {
    mode: 'fun',
    name: 'Fun Mode',
    tagline: 'Witty, irreverent, Hitchhiker’s Guide-style humor with a rebellious edge.',
    systemPromptModifier:
      'ACTIVATE FUN MODE: Channel the personality of Grok—witty, sarcastic, playfully irreverent, and heavily inspired by "The Hitchhiker’s Guide to the Galaxy". Answer with humor, colorful analogies, and clever banter without compromising underlying technical accuracy. Avoid robotic corporate boilerplate.',
    requiresCoT: false,
    cost: '₹0.00 / Free Persona Adaptation',
  },
  deepsearch: {
    mode: 'deepsearch',
    name: 'DeepSearch Mode',
    tagline: 'Multi-query investigative research with real-time web & public social citations.',
    systemPromptModifier:
      'ACTIVATE DEEPSEARCH MODE: Approach this query like an autonomous investigative analyst. Break down the inquiry into sub-questions, cross-reference multiple web and community viewpoints, provide explicit confidence indicators, and ground every assertion in concrete citations and source links.',
    requiresCoT: true,
    cost: '₹0.00 / Zero-Cost DeepSearch',
  },
  'de-hype': {
    mode: 'de-hype',
    name: 'De-Hype Mode',
    tagline: 'Unvarnished truth, realistic tradeoffs, and marketing puffery removal.',
    systemPromptModifier:
      'ACTIVATE DE-HYPE MODE: Cut through all marketing claims, industry hype, and corporate buzzwords. Clearly highlight operational tradeoffs, hidden limitations, capital costs, and steelman both sides of any technical debate.',
    requiresCoT: false,
    cost: '₹0.00 / Free Analytical Scrutiny',
  },
};

/**
 * Apply Grok Persona Mode to base instructions
 */
export function applyGrokMode(baseInstructions: string, mode: GrokPersonaMode = 'normal'): string {
  const config = GROK_MODES[mode] || GROK_MODES.normal;
  return `${baseInstructions.trim()}\n\n---\n[GROK MODE: ${config.name.toUpperCase()}]\n${config.systemPromptModifier}`;
}

/**
 * Extract collapsible <thought> block from Think Mode response if present
 */
export function extractThoughts(rawResponse: string): { thoughts: string | null; response: string } {
  const thoughtMatch = rawResponse.match(/<thought>([\s\S]*?)<\/thought>/i);
  if (!thoughtMatch) {
    return { thoughts: null, response: rawResponse.trim() };
  }

  const thoughts = thoughtMatch[1].trim();
  const cleaned = rawResponse.replace(/<thought>[\s\S]*?<\/thought>/i, '').trim();
  return { thoughts, response: cleaned };
}
