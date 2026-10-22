import type { SkillPermission } from '../skills/types.js';
import { executeSafeTool, toCopilotKitTool } from './open-dots-tool.js';
import type {
  OpenDotsToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from './types.js';
import { calculatorTool } from './builtin/calculator.js';
import { textAnalyzerTool } from './builtin/text-analyzer.js';
import { webReaderTool } from './builtin/web-reader.js';
import { shoppingResearchTool } from './builtin/shopping-research.js';
import { instagramResearchTool } from './builtin/instagram-research.js';
import { executionReportTool } from './builtin/execution-report.js';
import { stepVerifierTool } from './builtin/step-verifier.js';
import {
  gmailWorkspaceTool,
  calendarTasksWorkspaceTool,
  docsDriveWorkspaceTool,
  sheetsAnalyticsWorkspaceTool,
  slidesPresentationWorkspaceTool,
  keepNotesWorkspaceTool,
} from './builtin/workspace-google-tools.js';
import { deepResearchTool } from '../research/research-tool.js';
import { delegateToSpecialistTool } from '../specialists/specialist-tools.js';
import {
  readWorkspaceFileTool,
  writeWorkspaceFileTool,
  listWorkspaceFilesTool,
  exportDocumentTool,
  analyzeSpreadsheetTool,
  generateOfficeDocTool,
  generateSlideDeckTool,
  diffDocumentsTool,
} from '../files/file-tools.js';

export class ToolRegistry {
  private tools = new Map<string, OpenDotsToolDefinition<any, any>>();

  register(tool: OpenDotsToolDefinition<any, any>): void {
    if (!tool.name) {
      throw new Error('Tool registration failed: Missing tool name.');
    }
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): OpenDotsToolDefinition<any, any> | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): Array<Omit<OpenDotsToolDefinition<any, any>, 'execute'>> {
    return Array.from(this.tools.values()).map(
      ({ name, description, parameters, requiredPermission, timeoutMs, maxOutputChars }) => ({
        name,
        description,
        parameters,
        requiredPermission,
        timeoutMs,
        maxOutputChars,
      }),
    );
  }

  async execute(
    name: string,
    rawInput: unknown,
    ctx: ToolExecutionContext = {},
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool "${name}" not found in registry.`,
        executionTimeMs: 0,
      };
    }
    return executeSafeTool(tool, rawInput, ctx);
  }

  toCopilotKitTools(userPermissions: SkillPermission[], ctxProvider?: () => ToolExecutionContext) {
    const authorized = Array.from(this.tools.values()).filter((tool) => {
      if (!tool.requiredPermission || tool.requiredPermission === 'basic') return true;
      return userPermissions.includes(tool.requiredPermission) || userPermissions.includes('admin');
    });

    return authorized.map((tool) => toCopilotKitTool(tool, ctxProvider));
  }
}

export const globalToolRegistry = new ToolRegistry();

// Register standard built-in tools
globalToolRegistry.register(calculatorTool);
globalToolRegistry.register(textAnalyzerTool);
globalToolRegistry.register(webReaderTool);
globalToolRegistry.register(shoppingResearchTool);
globalToolRegistry.register(instagramResearchTool);
globalToolRegistry.register(executionReportTool);
globalToolRegistry.register(stepVerifierTool);
globalToolRegistry.register(deepResearchTool);
globalToolRegistry.register(delegateToSpecialistTool);
globalToolRegistry.register(readWorkspaceFileTool);
globalToolRegistry.register(writeWorkspaceFileTool);
globalToolRegistry.register(listWorkspaceFilesTool);
globalToolRegistry.register(exportDocumentTool);
globalToolRegistry.register(analyzeSpreadsheetTool);
globalToolRegistry.register(generateOfficeDocTool);
globalToolRegistry.register(generateSlideDeckTool);
globalToolRegistry.register(diffDocumentsTool);
globalToolRegistry.register(gmailWorkspaceTool);
globalToolRegistry.register(calendarTasksWorkspaceTool);
globalToolRegistry.register(docsDriveWorkspaceTool);
globalToolRegistry.register(sheetsAnalyticsWorkspaceTool);
globalToolRegistry.register(slidesPresentationWorkspaceTool);
globalToolRegistry.register(keepNotesWorkspaceTool);
