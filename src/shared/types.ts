export type Status =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'cancelled';
export interface Settings {
  name: string;
  paused: boolean;
  researchAllowed: boolean;
  memoryAllowed: boolean;
  appsAllowed: boolean;
  approvalPolicy?: 'always_ask' | 'category_based' | 'pre_authorized';
  proactiveGoalsAllowed?: boolean;
  disabledMemoryCategories?: string[];
  /** Grok Upgrade: Strictly prevents paid API calls, credit-based services, or subscription billing (default: true). */
  freeOnlyMode?: boolean;
}

export interface GoalMilestone {
  id: string;
  title: string;
  completed: boolean;
  dueDate?: number;
}

export interface GoalMetrics {
  progress?: number;
  target?: number;
  unit?: string;
}

export interface Goal {
  id: string;
  ownerId: string;
  title: string;
  description?: string;
  category: 'career' | 'learning' | 'personal' | 'project' | 'finance' | 'health';
  targetDate?: number;
  priority: 'low' | 'medium' | 'high';
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  milestones: GoalMilestone[];
  metrics: GoalMetrics;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export type ApprovalActionType =
  | 'send_email'
  | 'publish_content'
  | 'purchase'
  | 'external_form'
  | 'share_data'
  | 'destructive_op'
  | 'custom_tool';

export interface Approval {
  id: string;
  ownerId: string;
  actionType: ApprovalActionType;
  title: string;
  description: string;
  destination?: string;
  payload: Record<string, unknown>;
  consequences?: string;
  estimatedCost?: string;
  status: 'pending' | 'approved' | 'rejected';
  policy: 'always_ask' | 'category_based' | 'pre_authorized';
  createdAt: number;
  decidedAt?: number;
  decidedBy?: string;
}

export type ConnectorType =
  | 'gmail'
  | 'google_calendar'
  | 'google_drive'
  | 'onedrive'
  | 'notion'
  | 'github'
  | 'asana'
  | 'instagram'
  | 'telegram'
  | 'whatsapp'
  | 'slack'
  | 'custom';

export interface Connector {
  id: string;
  ownerId: string;
  type: ConnectorType;
  name: string;
  status: 'connected' | 'disconnected' | 'unconfigured' | 'error';
  config: Record<string, unknown>;
  permissions: string[];
  availableActions: string[];
  lastTestedAt?: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DocumentSnapshot {
  id: string;
  ownerId: string;
  filePath: string;
  version: number;
  content: string;
  summary?: string;
  createdAt: number;
}

export type NotificationType =
  | 'task_completed'
  | 'task_failed'
  | 'approval_required'
  | 'monitoring_alert'
  | 'conditional_trigger'
  | 'deadline_approaching'
  | 'info_required';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Notification {
  id: string;
  ownerId?: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  targetId?: string;
  targetUrl?: string;
  sourceId?: string;
  actionUrl?: string;
  isRead: boolean;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export type TaskTriggerType = 'time' | 'condition' | 'threshold' | 'content_change' | 'conditional';

export interface TaskCondition {
  targetUrl?: string;
  topic?: string;
  field?: string;
  operator?: 'lt' | 'gt' | 'eq' | 'contains' | 'changes' | 'less_than' | 'greater_than' | 'equals';
  threshold?: number | string;
  lastValue?: string;
  lastHash?: string;
}

export interface TaskQuietHours {
  enabled: boolean;
  start?: string;
  end?: string;
  startHour?: number;
  endHour?: number;
  timezone?: string;
}

export interface TaskMonitoringConfig {
  checkFrequencySeconds?: number;
  quietHours?: TaskQuietHours;
  notificationPreferences?: {
    inApp?: boolean;
    email?: boolean;
    slack?: boolean;
  };
}

export interface TaskChangeHistoryItem {
  detectedAt: number;
  oldValue?: string;
  newValue?: string;
  description?: string;
  source?: string;
  summary?: string;
  meaningfulChange?: boolean;
}

export interface McpDirectoryItem {
  id: string;
  name: string;
  description: string;
  category: 'search' | 'developer' | 'productivity' | 'utilities' | 'database';
  defaultUrl: string;
  requiresToken: boolean;
  tokenPlaceholder?: string;
  availableTools: Array<{ name: string; description: string; readOnly: boolean }>;
  documentationUrl?: string;
}

export interface WorkflowAnalysisProposal {
  intendedOutcome: string;
  missingInformation: string[];
  requiredConnectors: ConnectorType[];
  proposedSkill: {
    name: string;
    description: string;
    instructions: string;
    tools: string[];
  };
  proposedSchedule?: {
    triggerType: TaskTriggerType;
    intervalSeconds?: number;
    condition?: TaskCondition;
    description: string;
  };
  expectedResourceUsage: {
    estimatedTime: string;
    estimatedCost: string;
    apiCalls: string;
  };
  suggestedActionItems: string[];
}

export interface Task {
  id: string;
  prompt: string;
  status: Status;
  intervalSeconds: number | null;
  nextRunAt: number | null;
  createdAt: number;
  updatedAt: number;
  error: string | null;
  lease: string | null;
  leaseUntil: number | null;
  triggerType?: TaskTriggerType;
  condition?: TaskCondition;
  monitoringConfig?: TaskMonitoringConfig;
  changeHistory?: TaskChangeHistoryItem[];
  dependsOn?: string[];
  idempotencyKey?: string;
}
export interface Source {
  title: string;
  url: string;
  excerpt: string;
}
export interface Result {
  text: string;
  sources: Source[];
  sample: boolean;
  screenshot?: string;
}
export interface Run {
  id: string;
  taskId: string;
  status: string;
  startedAt: number;
  finishedAt: number | null;
  result: Result | null;
  error: string | null;
}
export interface TaskEvent {
  id: number;
  taskId: string;
  runId: string | null;
  text: string;
  createdAt: number;
}
export interface Memory {
  id: string;
  text: string;
  createdAt: number;
}
export interface Detail {
  task: Task;
  runs: Run[];
  events: TaskEvent[];
}
export interface State {
  settings: Settings;
  tasks: Task[];
  memories: Memory[];
  mode: 'sample' | 'live';
  configured: boolean;
}
export type Action = 'run' | 'pause' | 'cancel';
export interface Space {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  goal?: string | null;
  instructions?: string | null;
  status?: 'active' | 'archived' | 'completed';
  archivedAt?: number | null;
}
export interface Dot {
  id: string;
  /** Default destination for saved pages, not ownership. */
  spaceId: string;
  spaceIds: string[];
  name: string;
  instructions: string;
  researchAllowed: boolean;
  memoryAllowed: boolean;
  appsAllowed: boolean;
  composioToolkits: string[];
  composioSessionId?: string | null;
  composioPolicyHash?: string | null;
  createdAt: number;
  learningContainerId?: string | null;
  skillDeliveryEnabled?: boolean;
}
export interface Conversation {
  id: string;
  dotId: string;
  ownerId: string;
  title: string;
  createdAt: number;
  /** Frozen at creation; null means this conversation does not participate. */
  learningContainerId?: string | null;
}
export interface CallReceipt {
  anchorMessageId?: string | null;
  id: string;
  threadId: string;
  startedAt: number;
  endedAt: number | null;
  status: 'connecting' | 'active' | 'ended' | 'failed';
  transcript: string;
  error: string | null;
}
export interface SetupStatus {
  intelligence: boolean;
  model: boolean;
  browser: boolean;
  voice: boolean;
  composio: boolean;
  slack: string;
  missing: string[];
}
export interface WorkspaceState {
  spaces: Space[];
  dots: Dot[];
  conversations: Conversation[];
  setup: SetupStatus;
  calls: CallReceipt[];
}
