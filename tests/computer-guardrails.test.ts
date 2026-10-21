import { describe, expect, it } from 'vitest';
import {
  isPrivateHost,
  validateBrowserNavigationUrl,
  inspectActionGuardrails,
} from '../src/server/computer-guardrails.js';

describe('Controlled Browser & Computer Automation Guardrails (Phase 10)', () => {
  it('correctly identifies private network hosts and cloud metadata endpoints', () => {
    expect(isPrivateHost('localhost')).toBe(true);
    expect(isPrivateHost('127.0.0.1')).toBe(true);
    expect(isPrivateHost('::1')).toBe(true);
    expect(isPrivateHost('device.local')).toBe(true);
    expect(isPrivateHost('169.254.169.254')).toBe(true);
    expect(isPrivateHost('metadata.google.internal')).toBe(true);

    expect(isPrivateHost('10.0.0.1')).toBe(true);
    expect(isPrivateHost('192.168.1.254')).toBe(true);
    expect(isPrivateHost('172.16.0.1')).toBe(true);
    expect(isPrivateHost('172.31.255.255')).toBe(true);

    // Public valid hosts
    expect(isPrivateHost('google.com')).toBe(false);
    expect(isPrivateHost('github.com')).toBe(false);
    expect(isPrivateHost('142.250.190.46')).toBe(false);
  });

  it('validates public browser navigation URLs and blocks dangerous addresses', () => {
    // Valid public URLs
    expect(validateBrowserNavigationUrl('https://docs.github.com/en').valid).toBe(true);
    expect(validateBrowserNavigationUrl('http://example.com/search?q=ai').valid).toBe(true);

    // Blocked internal & private URLs
    const local = validateBrowserNavigationUrl('http://localhost:8080/admin');
    expect(local.valid).toBe(false);
    expect(local.error).toContain('private/internal network address');

    const meta = validateBrowserNavigationUrl('http://169.254.169.254/latest/meta-data');
    expect(meta.valid).toBe(false);
    expect(meta.error).toContain('private/internal network address');

    // Blocked non-http/https protocols
    const fileProto = validateBrowserNavigationUrl('file:///C:/Windows/win.ini');
    expect(fileProto.valid).toBe(false);
    expect(fileProto.error).toContain('Unsupported protocol');

    // Blocked embedded credentials
    const creds = validateBrowserNavigationUrl('https://admin:secret@dashboard.example.com');
    expect(creds.valid).toBe(false);
    expect(creds.error).toContain('Embedded URL credentials');
  });

  it('inspects actions and flags consequential actions for user approval', () => {
    // Sensitive banking / billing navigation
    const billing = inspectActionGuardrails('navigate', { url: 'https://bank.example/account/transfer' });
    expect(billing.requiresApproval).toBe(true);
    expect(billing.warning).toBeDefined();

    // Normal safe navigation
    const normal = inspectActionGuardrails('navigate', { url: 'https://en.wikipedia.org/wiki/Artificial_intelligence' });
    expect(normal.requiresApproval).toBe(false);

    // Destructive shell execution
    const rmRf = inspectActionGuardrails('exec', { command: 'rm -rf /data/records' });
    expect(rmRf.requiresApproval).toBe(true);
    expect(rmRf.warning).toContain('High-risk shell command');

    const dropTable = inspectActionGuardrails('exec', { command: 'sqlite3 db.sqlite "DROP TABLE users;"' });
    expect(dropTable.requiresApproval).toBe(true);

    // Safe command
    const safeCmd = inspectActionGuardrails('exec', { command: 'node --version' });
    expect(safeCmd.requiresApproval).toBe(false);
  });
});
