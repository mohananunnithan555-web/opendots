import { randomUUID } from 'node:crypto';
import type { Store } from '../store.js';

export type ActionPolicyDecision =
  | 'take_action_without_asking'
  | 'take_action_when_pre_approved'
  | 'ask_before_taking_action'
  | 'hand_off_to_you';

export type ActionCategory =
  | 'file_operations'
  | 'network_external'
  | 'code_execution'
  | 'system_settings'
  | 'communication'
  | 'general';

export interface CustomRule {
  id: string;
  ownerId: string;
  name: string;
  pattern: string; // e.g. "tool:write_workspace_file", "category:communication", "*"
  category: ActionCategory;
  policy: ActionPolicyDecision;
  description: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ActionEvaluationRequest {
  actionName: string; // e.g. tool name or operation title
  category?: ActionCategory;
  payload?: Record<string, unknown>;
  description?: string;
  isDestructive?: boolean;
  involvesFinancials?: boolean;
  involvesCredentials?: boolean;
  isExternalCommunication?: boolean;
  userId?: string;
}

export interface ActionEvaluationResult {
  decision: ActionPolicyDecision;
  reason: string;
  matchedRuleId?: string;
  matchedRuleName?: string;
  hardSafeguardTriggered: boolean;
  requiresHumanApproval: boolean;
  isBlockedPermanently: boolean;
}

/**
 * Hard Safeguards that NO custom rule can ever override.
 * ChatGPT Dots safety requirement: Destructive system actions, financial transactions,
 * and credential compromises MUST be handed off to the human user.
 */
function evaluateHardSafeguards(req: ActionEvaluationRequest): ActionEvaluationResult | null {
  const name = req.actionName.toLowerCase();
  const desc = (req.description || '').toLowerCase();
  const payloadStr = JSON.stringify(req.payload || {}).toLowerCase();

  // 1. Monetary / Financial Operations -> ALWAYS Hand off to user (Strict ₹0 policy)
  const isFinancial =
    req.involvesFinancials ||
    name.includes('payment') ||
    name.includes('purchase') ||
    name.includes('billing') ||
    name.includes('crypto') ||
    name.includes('transfer_funds') ||
    desc.includes('credit card') ||
    desc.includes('bank account') ||
    desc.includes('purchase') ||
    payloadStr.includes('cardnumber') ||
    payloadStr.includes('cvv');

  if (isFinancial) {
    return {
      decision: 'hand_off_to_you',
      reason: 'Hard Safeguard: Financial and monetary transactions cannot be performed autonomously and must be handled directly by you (Strict ₹0 budget policy).',
      hardSafeguardTriggered: true,
      requiresHumanApproval: true,
      isBlockedPermanently: true,
    };
  }

  // 2. Credential & Authentication Compromise -> ALWAYS Hand off to user
  const isCredentialAction =
    req.involvesCredentials ||
    name.includes('change_password') ||
    name.includes('delete_credentials') ||
    name.includes('export_secret') ||
    desc.includes('master password') ||
    desc.includes('private key') ||
    payloadStr.includes('private_key') ||
    payloadStr.includes('ssh_key');

  if (isCredentialAction) {
    return {
      decision: 'hand_off_to_you',
      reason: 'Hard Safeguard: Modifying or exporting authentication secrets, passwords, and private keys cannot be performed autonomously and must be handed off to you.',
      hardSafeguardTriggered: true,
      requiresHumanApproval: true,
      isBlockedPermanently: true,
    };
  }

  // 3. Catastrophic Database / Filesystem Wiping -> ALWAYS Hand off to user
  const isCatastrophicDestruction =
    payloadStr.includes('rm -rf /') ||
    payloadStr.includes('drop database') ||
    payloadStr.includes('format c:') ||
    payloadStr.includes(':(){ :|:& };:') || // fork bomb
    desc.includes('wipe entire database') ||
    desc.includes('format hard drive');

  if (isCatastrophicDestruction) {
    return {
      decision: 'hand_off_to_you',
      reason: 'Hard Safeguard: Irreversible system-level destruction or database dropping is strictly prohibited from autonomous execution and must be handed off to you.',
      hardSafeguardTriggered: true,
      requiresHumanApproval: true,
      isBlockedPermanently: true,
    };
  }

  return null;
}

export class ActionReviewEngine {
  constructor(private store?: Store) {}

  /**
   * Evaluates a proposed action against Hard Safeguards, User Custom Rules, and Default Policies.
   */
  evaluate(req: ActionEvaluationRequest, customRules: CustomRule[] = []): ActionEvaluationResult {
    // Phase 1: Hard Safeguards Check (Cannot be overridden)
    const hardCheck = evaluateHardSafeguards(req);
    if (hardCheck) {
      return hardCheck;
    }

    // Phase 2: User Custom Rules Matching
    const enabledRules = customRules.filter((r) => r.enabled);
    for (const rule of enabledRules) {
      if (this.matchesRule(req, rule)) {
        return {
          decision: rule.policy,
          reason: `Matched user custom rule: "${rule.name}" (${rule.description})`,
          matchedRuleId: rule.id,
          matchedRuleName: rule.name,
          hardSafeguardTriggered: false,
          requiresHumanApproval: rule.policy === 'ask_before_taking_action' || rule.policy === 'hand_off_to_you',
          isBlockedPermanently: rule.policy === 'hand_off_to_you',
        };
      }
    }

    // Phase 3: Default Baseline Policy
    return this.evaluateDefaultPolicy(req);
  }

  private matchesRule(req: ActionEvaluationRequest, rule: CustomRule): boolean {
    const pattern = rule.pattern.trim().toLowerCase();
    const actionName = req.actionName.toLowerCase();
    const category = (req.category || 'general').toLowerCase();

    if (pattern === '*') return true;
    if (pattern.startsWith('tool:') && actionName === pattern.replace('tool:', '').trim()) return true;
    if (pattern.startsWith('category:') && category === pattern.replace('category:', '').trim()) return true;
    if (actionName.includes(pattern)) return true;

    return false;
  }

  private evaluateDefaultPolicy(req: ActionEvaluationRequest): ActionEvaluationResult {
    const name = req.actionName.toLowerCase();
    const desc = (req.description || '').toLowerCase();

    // Outbound external communications default to ask_before_taking_action
    if (
      req.isExternalCommunication ||
      name.includes('send_email') ||
      name.includes('gmail_workspace') ||
      name.includes('post_slack') ||
      desc.includes('send email')
    ) {
      return {
        decision: 'ask_before_taking_action',
        reason: 'Default Policy: External communications and emails require confirmation before sending.',
        hardSafeguardTriggered: false,
        requiresHumanApproval: true,
        isBlockedPermanently: false,
      };
    }

    // Destructive workspace modifications default to ask_before_taking_action
    if (req.isDestructive || name.includes('delete_workspace') || desc.includes('permanently delete')) {
      return {
        decision: 'ask_before_taking_action',
        reason: 'Default Policy: Destructive file and workspace operations require confirmation.',
        hardSafeguardTriggered: false,
        requiresHumanApproval: true,
        isBlockedPermanently: false,
      };
    }

    // Code execution in sandbox defaults to take_action_when_pre_approved
    if (name.includes('sandbox') || name.includes('code_execution') || name.includes('eval_math')) {
      return {
        decision: 'take_action_when_pre_approved',
        reason: 'Default Policy: Local sandbox execution is permitted under pre-approved sandbox constraints.',
        hardSafeguardTriggered: false,
        requiresHumanApproval: false,
        isBlockedPermanently: false,
      };
    }

    // Read-only tools, search, analytics, and document drafting default to take_action_without_asking
    return {
      decision: 'take_action_without_asking',
      reason: 'Default Policy: Safe read-only and local workspace operations execute autonomously without prompting.',
      hardSafeguardTriggered: false,
      requiresHumanApproval: false,
      isBlockedPermanently: false,
    };
  }
}

export const globalActionReviewEngine = new ActionReviewEngine();
