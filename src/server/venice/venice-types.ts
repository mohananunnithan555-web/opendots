export type VeniceTaskType = 'image' | 'video' | 'research' | 'chat';

export type VeniceTaskStatus =
  | 'idle'
  | 'waiting_for_browser'
  | 'waiting_for_login'
  | 'submitting_prompt'
  | 'generating'
  | 'retrieving_output'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface VeniceGenerationSettings {
  aspectRatio?: '16:9' | '1:1' | '9:16' | '4:3' | '3:4';
  style?: string; // e.g. "photorealistic", "cinematic", "anime", "digital-art", "3d"
  model?: string; // e.g. "flux-dev", "ideogram", "z-image-turbo", "wan-2.1"
  negativePrompt?: string;
  seed?: number;
  steps?: number;
  cfgScale?: number;
}

export interface VeniceTaskRequest {
  id?: string;
  type: VeniceTaskType;
  prompt: string;
  settings?: VeniceGenerationSettings;
  ownerId?: string;
  threadId?: string;
}

export interface VeniceMediaOutput {
  mediaUrl: string;
  localPath?: string;
  downloadUrl?: string;
  mediaType: 'image' | 'video';
  format: string; // e.g. "png", "webp", "mp4"
  width?: number;
  height?: number;
  fileSizeBytes?: number;
  isLosslessOrOriginal: boolean;
  aspectRatio?: string;
  modelUsed?: string;
}

export interface VeniceResearchOutput {
  answer: string;
  citations: Array<{ title?: string; url: string; snippet?: string }>;
  modelUsed?: string;
  webSearchUsed: boolean;
}

export interface VeniceTaskResult {
  taskId: string;
  type: VeniceTaskType;
  status: VeniceTaskStatus;
  prompt: string;
  media?: VeniceMediaOutput;
  research?: VeniceResearchOutput;
  error?: string;
  userHandoffRequired?: boolean;
  handoffUrl?: string;
  handoffReason?: string;
  loginRequired?: boolean;
  costIncurredUsd: 0; // Strictly $0.00 / ₹0
  executionTimeMs: number;
  createdAt: number;
  finishedAt?: number;
}

export interface VeniceBridgeStatus {
  connectorName: 'VeniceWebsiteBridge';
  version: '1.0.0';
  targetUrl: 'https://venice.ai/';
  browserAvailable: boolean;
  browserType: 'playwright' | 'computer_service' | 'browser_handoff';
  isLoggedIn: boolean;
  accountType?: 'anonymous_free' | 'authenticated_free' | 'pro';
  supportedCapabilities: {
    textChat: boolean;
    webResearch: boolean;
    imageGeneration: boolean;
    videoGeneration: boolean;
  };
  limitsNotice: string;
}
