import { describe, expect, it } from 'vitest';
import { SPECIALIST_ROLES } from '../src/server/specialists/specialist-roles.js';
import { DelegationCoordinator } from '../src/server/specialists/delegation-coordinator.js';
import { delegateToSpecialistTool } from '../src/server/specialists/specialist-tools.js';
import { executeSafeTool } from '../src/server/tools/open-dots-tool.js';
import { WorkspaceStore } from '../src/server/workspace.js';

describe('Specialist AI Agents (Phase 7)', () => {
  it('defines the 5 canonical specialist roles with bounded tools and permissions', () => {
    const roles = Object.keys(SPECIALIST_ROLES);
    expect(roles).toEqual(['researcher', 'coder', 'writer', 'planner', 'analyst']);

    const researcher = SPECIALIST_ROLES.researcher;
    expect(researcher.name).toBe('Researcher Dot');
    expect(researcher.allowedPermissions).toContain('research');
    expect(researcher.allowedTools).toContain('deep_research');

    const coder = SPECIALIST_ROLES.coder;
    expect(coder.name).toBe('Coder Dot');
    expect(coder.allowedPermissions).toContain('code');

    const writer = SPECIALIST_ROLES.writer;
    expect(writer.name).toBe('Writer Dot');

    const planner = SPECIALIST_ROLES.planner;
    expect(planner.name).toBe('Planner Dot');
    expect(planner.allowedTools).toContain('create_autonomous_plan');

    const analyst = SPECIALIST_ROLES.analyst;
    expect(analyst.name).toBe('Analyst Dot');
    expect(analyst.allowedTools).toContain('calculate');
  });

  it('coordinator accurately routes tasks to the appropriate specialist', () => {
    const coordinator = new DelegationCoordinator();

    // Code request -> Coder
    const codeDec = coordinator.shouldDelegate('Please refactor this TypeScript function and fix the bug');
    expect(codeDec.delegate).toBe(true);
    expect(codeDec.recommendedRole).toBe('coder');

    // Research request -> Researcher
    const resDec = coordinator.shouldDelegate('Find research sources on quantum computing breakthroughs');
    expect(resDec.delegate).toBe(true);
    expect(resDec.recommendedRole).toBe('researcher');

    // Planning request -> Planner
    const planDec = coordinator.shouldDelegate('Break down the steps to launch a mobile app roadmap');
    expect(planDec.delegate).toBe(true);
    expect(planDec.recommendedRole).toBe('planner');

    // Writing request -> Writer
    const writeDec = coordinator.shouldDelegate('Draft a formal executive summary and email to stakeholders');
    expect(writeDec.delegate).toBe(true);
    expect(writeDec.recommendedRole).toBe('writer');

    // Analysis request -> Analyst
    const analDec = coordinator.shouldDelegate('Analyze data metrics and calculate benchmark statistics');
    expect(analDec.delegate).toBe(true);
    expect(analDec.recommendedRole).toBe('analyst');

    // Simple conversational greeting -> No delegation
    const simpleDec = coordinator.shouldDelegate('Good morning! How are you today?');
    expect(simpleDec.delegate).toBe(false);
  });

  it('delegation coordinator redacts secrets before delegating', async () => {
    const coordinator = new DelegationCoordinator();

    const result = await coordinator.delegate({
      specialistRole: 'coder',
      task: 'Fix authentication error when using ' + 'sk_live_' + '1234567890abcdef12345678 token',
    });

    expect(result.specialistRole).toBe('coder');
    expect(result.specialistName).toBe('Coder Dot');
    expect(result.response).not.toContain('sk_' + 'live_1234567890abcdef12345678');
    expect(result.response).toContain('[REDACTED');
  });

  it('executes delegate_to_specialist tool through unified tool framework', async () => {
    const toolResult = await executeSafeTool(
      delegateToSpecialistTool,
      {
        specialistRole: 'researcher',
        task: 'Investigate the latest multi-agent consensus protocols',
      },
      { userPermissions: ['basic'] },
    );

    expect(toolResult.success).toBe(true);
    expect(toolResult.data?.specialistRole).toBe('researcher');
    expect(toolResult.data?.specialistName).toBe('Researcher Dot');
    expect(toolResult.data?.response).toContain('Researcher Dot');
  });

  it('seeds all 5 specialist Dots in the WorkspaceStore', () => {
    const ws = new WorkspaceStore(':memory:', 'test-user');
    const dots = ws.dots();

    const names = dots.map((d) => d.name);
    expect(names).toContain('Dot'); // original default Dot
    expect(names).toContain('Researcher Dot');
    expect(names).toContain('Coder Dot');
    expect(names).toContain('Writer Dot');
    expect(names).toContain('Planner Dot');
    expect(names).toContain('Analyst Dot');

    ws.close();
  });
});
