import type { CopilotKitIntelligence } from '@copilotkit/runtime/v2';
import type { WorkspaceStore } from './workspace.js';

type Selector = NonNullable<
  ConstructorParameters<
    typeof CopilotKitIntelligence
  >[0]['getLearningContainerId']
>;

/** Called before execution, including before a new channel thread reaches DotAgent. */
export function learningSelector(
  workspace: WorkspaceStore,
  channelDotId?: string,
): Selector {
  return ({ surface, user, agentId, input }) => {
    const thread = input.threadId ? workspace.findThread(input.threadId) : undefined;
    const isOwner =
      Boolean(user?.id) &&
      (user?.id === workspace.ownerId ||
        user?.id === 'opendots-owner' ||
        (thread && user?.id === thread.ownerId));
    if (!isOwner)
      throw new Error('Conversation learning requires the workspace owner.');
    if (surface === 'channel') {
      if (agentId !== channelDotId)
        throw new Error(
          'Conversation learning requires the configured Slack Dot.',
        );
      if (
        !workspace
          .conversations()
          .some((t) => t.id === input.threadId)
      )
        workspace.bindThread(input.threadId, agentId, 'Slack conversation');
    }
    const resolvedDotId =
      agentId.startsWith('chat-') && thread ? thread.dotId : agentId;
    return (
      workspace.requireThread(input.threadId, resolvedDotId).learningContainerId ??
      null
    );
  };
}
