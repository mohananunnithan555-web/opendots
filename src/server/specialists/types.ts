import type { SkillPermission } from '../skills/types.js';

export type SpecialistRoleType =
  | 'researcher'
  | 'coder'
  | 'writer'
  | 'planner'
  | 'analyst'
  | 'reviewer';

export interface SpecialistRoleDefinition {
  role: SpecialistRoleType;
  name: string;
  tagline: string;
  systemPrompt: string;
  allowedPermissions: SkillPermission[];
  allowedTools: string[];
}

export interface DelegationRequest {
  specialistRole: SpecialistRoleType;
  task: string;
  context?: Record<string, unknown>;
}

export interface DelegationResult {
  specialistRole: SpecialistRoleType;
  specialistName: string;
  response: string;
  evidence?: string[];
  executionTimeMs: number;
}
