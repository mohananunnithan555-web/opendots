import { defineTool } from '@copilotkit/runtime/v2';
import { z } from 'zod';
import { SkillLogger } from './skill-logger.js';
import type {
  SkillContext,
  SkillDefinition,
  SkillExecutionResult,
  SkillMetadata,
  SkillPermission,
} from './types.js';

const DEFAULT_SKILL_TIMEOUT_MS = 30_000;

export class SkillRegistry {
  private skills = new Map<string, SkillDefinition<any, any>>();
  private globalDisabled = new Set<string>();
  private dotDisabled = new Map<string, Set<string>>(); // dotId -> Set<skillId>

  /**
   * Register a new skill in the registry.
   */
  register(skill: SkillDefinition<any, any>): void {
    if (!skill?.metadata?.id) {
      throw new Error('Skill registration failed: Missing required skill ID.');
    }
    if (this.skills.has(skill.metadata.id)) {
      throw new Error(
        `Skill registration failed: Skill "${skill.metadata.id}" is already registered.`,
      );
    }
    this.skills.set(skill.metadata.id, skill);
  }

  /**
   * Unregister a skill from the registry.
   */
  unregister(skillId: string): boolean {
    return this.skills.delete(skillId);
  }

  /**
   * Retrieve a skill definition by ID.
   */
  get(skillId: string): SkillDefinition<any, any> | undefined {
    return this.skills.get(skillId);
  }

  /**
   * Check if a skill exists in the registry.
   */
  has(skillId: string): boolean {
    return this.skills.has(skillId);
  }

  /**
   * List all registered skills metadata.
   */
  list(): SkillMetadata[] {
    return Array.from(this.skills.values()).map((skill) => ({
      ...skill.metadata,
    }));
  }

  /**
   * Enable a skill globally or for a specific Dot.
   */
  enable(skillId: string, dotId?: string): void {
    if (dotId) {
      this.dotDisabled.get(dotId)?.delete(skillId);
    } else {
      this.globalDisabled.delete(skillId);
    }
  }

  /**
   * Disable a skill globally or for a specific Dot.
   */
  disable(skillId: string, dotId?: string): void {
    if (dotId) {
      if (!this.dotDisabled.has(dotId)) {
        this.dotDisabled.set(dotId, new Set());
      }
      this.dotDisabled.get(dotId)!.add(skillId);
    } else {
      this.globalDisabled.add(skillId);
    }
  }

  /**
   * Check if a skill is enabled for a given Dot.
   */
  isEnabled(skillId: string, dotId?: string): boolean {
    if (!this.skills.has(skillId)) return false;
    if (this.globalDisabled.has(skillId)) return false;
    if (dotId && this.dotDisabled.get(dotId)?.has(skillId)) return false;
    return true;
  }

  /**
   * List all enabled skills for a given Dot and permission set.
   */
  listEnabled(
    dotId?: string,
    userPermissions: SkillPermission[] = ['basic'],
  ): SkillMetadata[] {
    return Array.from(this.skills.values())
      .filter((skill) => {
        if (!this.isEnabled(skill.metadata.id, dotId)) return false;
        return this.hasPermissions(
          userPermissions,
          skill.metadata.requiredPermissions,
        );
      })
      .map((skill) => ({ ...skill.metadata }));
  }

  /**
   * Verify if a user's permissions satisfy the skill's required permissions.
   */
  private hasPermissions(
    userPermissions: SkillPermission[],
    required: SkillPermission[],
  ): boolean {
    if (userPermissions.includes('admin')) return true;
    return required.every((req) => userPermissions.includes(req));
  }

  /**
   * Execute a skill with validation, permission checks, timeouts, and logging.
   */
  async execute<TInput = unknown, TOutput = unknown>(
    skillId: string,
    rawInput: TInput,
    context: SkillContext = {},
  ): Promise<SkillExecutionResult<TOutput>> {
    const startTime = Date.now();
    const logger = new SkillLogger();

    const skill = this.skills.get(skillId);
    if (!skill) {
      logger.error(`Skill "${skillId}" not found in registry.`);
      return {
        success: false,
        error: `Skill "${skillId}" not found.`,
        executionTimeMs: Date.now() - startTime,
        logs: logger.getLogs(),
      };
    }

    // Check if enabled
    if (!this.isEnabled(skillId, context.dotId)) {
      logger.warn(`Skill "${skillId}" is disabled.`);
      return {
        success: false,
        error: `Skill "${skillId}" is disabled.`,
        executionTimeMs: Date.now() - startTime,
        logs: logger.getLogs(),
      };
    }

    // Check permissions
    const userPerms = context.userPermissions ?? ['basic'];
    if (!this.hasPermissions(userPerms, skill.metadata.requiredPermissions)) {
      const missing = skill.metadata.requiredPermissions.filter(
        (p) => !userPerms.includes(p),
      );
      logger.warn(
        `Permission denied for skill "${skillId}". Missing: ${missing.join(', ')}`,
      );
      return {
        success: false,
        error: `Permission denied. Missing required permissions: ${missing.join(', ')}.`,
        executionTimeMs: Date.now() - startTime,
        logs: logger.getLogs(),
      };
    }

    // Validate input schema
    const parsedInput = skill.inputSchema.safeParse(rawInput);
    if (!parsedInput.success) {
      const issues = parsedInput.error.issues ?? [];
      const errorMsg = `Input validation failed: ${issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ') || parsedInput.error.message}`;
      logger.error(errorMsg);
      return {
        success: false,
        error: errorMsg,
        executionTimeMs: Date.now() - startTime,
        logs: logger.getLogs(),
      };
    }

    // Setup execution timeout
    const timeoutMs = skill.timeoutMs ?? DEFAULT_SKILL_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    // Link incoming context signal if provided
    if (context.signal) {
      context.signal.addEventListener('abort', () => controller.abort());
    }

    logger.info(`Starting execution of skill "${skill.metadata.name}" (v${skill.metadata.version}).`);

    try {
      const executionPromise = skill.execute(parsedInput.data, {
        ...context,
        signal: controller.signal,
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error(`Skill execution timed out after ${timeoutMs}ms.`));
        });
      });

      const result = await Promise.race([executionPromise, timeoutPromise]);
      clearTimeout(timeoutHandle);

      // Validate output schema
      const parsedOutput = skill.outputSchema.safeParse(result);
      if (!parsedOutput.success) {
        const issues = parsedOutput.error.issues ?? [];
        const errorMsg = `Output validation failed: ${issues.map((e) => e.message).join(', ') || parsedOutput.error.message}`;
        logger.error(errorMsg);
        return {
          success: false,
          error: errorMsg,
          executionTimeMs: Date.now() - startTime,
          logs: logger.getLogs(),
        };
      }

      logger.info(`Skill "${skill.metadata.name}" executed successfully.`);
      return {
        success: true,
        data: parsedOutput.data,
        executionTimeMs: Date.now() - startTime,
        logs: logger.getLogs(),
      };
    } catch (err) {
      clearTimeout(timeoutHandle);
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Skill execution error: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
        executionTimeMs: Date.now() - startTime,
        logs: logger.getLogs(),
      };
    }
  }

  /**
   * Converts all registered and enabled skills into CopilotKit ToolDefinition instances
   * so they can be provided to TanStack AI / DotAgent automatically.
   */
  toCopilotKitTools(
    dotId: string,
    userPermissions: SkillPermission[] = ['basic', 'research', 'media', 'code'],
  ) {
    const enabledSkills = Array.from(this.skills.values()).filter((skill) => {
      if (!this.isEnabled(skill.metadata.id, dotId)) return false;
      return this.hasPermissions(
        userPermissions,
        skill.metadata.requiredPermissions,
      );
    });

    return enabledSkills.map((skill) => {
      // Ensure zod schema object for tool parameter registration
      const parameters =
        skill.inputSchema instanceof z.ZodObject
          ? skill.inputSchema
          : z.object({ input: skill.inputSchema });

      return defineTool({
        name: `skill_${skill.metadata.id.replace(/-/g, '_')}`,
        description: `[Skill: ${skill.metadata.name} v${skill.metadata.version}] ${skill.metadata.description}`,
        parameters,
        execute: async (args: any) => {
          const result = await this.execute(skill.metadata.id, args, {
            dotId,
            userPermissions,
          });

          if (!result.success) {
            return {
              success: false,
              error: result.error,
              executionTimeMs: result.executionTimeMs,
            };
          }

          return {
            success: true,
            data: result.data,
            executionTimeMs: result.executionTimeMs,
          };
        },
      });
    });
  }
}

// Global default singleton instance
export const globalSkillRegistry = new SkillRegistry();
