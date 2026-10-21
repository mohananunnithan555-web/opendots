export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();

  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host === '169.254.169.254' || // Cloud instance metadata
    host === 'metadata.google.internal'
  ) {
    return true;
  }

  // IPv4 Private blocks: 10.0.0.0/8, 192.168.0.0/16, 172.16.0.0/12
  if (host.startsWith('10.') || host.startsWith('192.168.')) {
    return true;
  }

  if (host.startsWith('172.')) {
    const parts = host.split('.');
    const second = parseInt(parts[1] ?? '0', 10);
    if (second >= 16 && second <= 31) {
      return true;
    }
  }

  return false;
}

export function validateBrowserNavigationUrl(rawUrl: string): { valid: boolean; error?: string } {
  try {
    const url = new URL(rawUrl);

    if (!['http:', 'https:'].includes(url.protocol)) {
      return {
        valid: false,
        error: `Security restriction: Unsupported protocol "${url.protocol}". Only http: and https: are permitted.`,
      };
    }

    if (url.username || url.password) {
      return {
        valid: false,
        error: 'Security restriction: Embedded URL credentials (username/password) are prohibited.',
      };
    }

    if (isPrivateHost(url.hostname)) {
      return {
        valid: false,
        error: `Security restriction: Navigation to private/internal network address "${url.hostname}" is prohibited.`,
      };
    }

    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: `Invalid URL format: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export interface ActionPreview {
  action: string;
  target?: string;
  summary: string;
  requiresApproval: boolean;
  warning?: string;
}

const DESTRUCTIVE_COMMAND_PATTERNS = [
  /\brm\s+-[rf]{1,2}\b/i,
  /\bformat\s+[a-z]:/i,
  /\bdel\s+\/[sq]\b/i,
  /\bdrop\s+database\b/i,
  /\bdrop\s+table\b/i,
  /\bmkfs\b/i,
];

export function inspectActionGuardrails(action: string, input: unknown): ActionPreview {
  const inp = (input as Record<string, unknown>) ?? {};

  if (action === 'navigate') {
    const url = String(inp.url ?? '');
    const validation = validateBrowserNavigationUrl(url);
    if (!validation.valid) {
      return {
        action,
        target: url,
        summary: `Navigate to ${url}`,
        requiresApproval: true,
        warning: validation.error,
      };
    }

    const lower = url.toLowerCase();
    const isSensitive =
      lower.includes('checkout') ||
      lower.includes('payment') ||
      lower.includes('billing') ||
      lower.includes('bank') ||
      lower.includes('delete') ||
      lower.includes('transfer');

    return {
      action,
      target: url,
      summary: `Navigate browser to ${url}`,
      requiresApproval: isSensitive,
      warning: isSensitive ? 'Sensitive web page (financial, billing, or deletion).' : undefined,
    };
  }

  if (action === 'exec') {
    const cmd = String(inp.command ?? '');
    const isDestructive = DESTRUCTIVE_COMMAND_PATTERNS.some((pattern) => pattern.test(cmd));

    return {
      action,
      target: cmd,
      summary: `Execute command: ${cmd}`,
      requiresApproval: isDestructive,
      warning: isDestructive ? 'High-risk shell command detected.' : undefined,
    };
  }

  return {
    action,
    summary: `Execute computer action: ${action}`,
    requiresApproval: false,
  };
}
