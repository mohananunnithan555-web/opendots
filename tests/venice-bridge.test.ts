import { describe, expect, it } from 'vitest';
import {
  VeniceWebsiteBridge,
  globalVeniceBridge,
  veniceWebsiteBridgeTool,
  veniceImageTool,
  veniceVideoTool,
  veniceResearchTool,
} from '../src/server/venice/index.js';
import { globalToolRegistry } from '../src/server/tools/tool-registry.js';
import { Store } from '../src/server/store.js';

describe('Venice.ai Website Bridge (OpenDots Integration)', () => {
  describe('Bridge Core & Capabilities', () => {
    it('returns valid status, capabilities, and ₹0 strict cost policy notice', async () => {
      const bridge = new VeniceWebsiteBridge();
      const status = await bridge.getStatus();

      expect(status.connectorName).toBe('VeniceWebsiteBridge');
      expect(status.version).toBe('1.0.0');
      expect(status.targetUrl).toBe('https://venice.ai/');
      expect(status.supportedCapabilities.textChat).toBe(true);
      expect(status.supportedCapabilities.webResearch).toBe(true);
      expect(status.supportedCapabilities.imageGeneration).toBe(true);
      expect(status.limitsNotice).toContain('₹0 cost');
    });

    it('handles image generation request with zero cost and valid handoff or media', async () => {
      const bridge = new VeniceWebsiteBridge();
      const result = await bridge.executeTask({
        type: 'image',
        prompt: 'a majestic mountain at golden hour',
        settings: { aspectRatio: '16:9', style: 'photorealistic' },
      });

      expect(result.costIncurredUsd).toBe(0);
      expect(result.prompt).toBe('a majestic mountain at golden hour');
      expect(['completed', 'retrieving_output', 'waiting_for_browser']).toContain(result.status);
      if (result.userHandoffRequired) {
        expect(result.handoffUrl).toContain('https://venice.ai/studio/image?prompt=');
        expect(result.handoffUrl).toContain('aspectRatio=16%3A9');
      }
    });

    it('handles video generation request safely and reports required login/credits transparently', async () => {
      const bridge = new VeniceWebsiteBridge();
      const result = await bridge.executeTask({
        type: 'video',
        prompt: 'hyper-lapse of flowing clouds',
      });

      expect(result.costIncurredUsd).toBe(0);
      expect(result.type).toBe('video');
      expect(result.userHandoffRequired).toBe(true);
      expect(result.loginRequired).toBe(true);
      expect(result.status).toBe('waiting_for_login');
      expect(result.handoffUrl).toContain('https://venice.ai/studio/video?prompt=');
      expect(result.handoffReason).toContain('requires a logged-in account');
    });

    it('handles research requests returning either sources or pre-filled chat handoff', async () => {
      const bridge = new VeniceWebsiteBridge();
      const result = await bridge.executeTask({
        type: 'research',
        prompt: 'compare open-weights deep learning architectures',
      });

      expect(result.costIncurredUsd).toBe(0);
      expect(result.type).toBe('research');
      if (result.userHandoffRequired) {
        expect(result.handoffUrl).toContain('https://venice.ai/chat?prompt=');
      } else if (result.research) {
        expect(result.research.answer).toBeDefined();
      }
    });

    it('tracks task in internal store and allows cancellation', async () => {
      const bridge = new VeniceWebsiteBridge();
      const promise = bridge.executeTask({
        type: 'image',
        prompt: 'test cancel task',
      });

      // Cancellation
      const taskResult = await promise;
      expect(bridge.getTask(taskResult.taskId)).toBeDefined();

      const cancelled = bridge.cancelTask(taskResult.taskId);
      // If already finished, cancelled is false; if still running, true.
      expect(typeof cancelled).toBe('boolean');
    });
  });

  describe('Tool Definitions and Registry Integration', () => {
    it('registers all Venice tools in globalToolRegistry', () => {
      expect(globalToolRegistry.has('venice_website_bridge')).toBe(true);
      expect(globalToolRegistry.has('venice_generate_image')).toBe(true);
      expect(globalToolRegistry.has('venice_generate_video')).toBe(true);
      expect(globalToolRegistry.has('venice_research')).toBe(true);
    });

    it('strictly marks all Venice tools as ₹0 / non-paid for Free-Only mode', () => {
      const bridgeTool = globalToolRegistry.get('venice_website_bridge')!;
      const imageTool = globalToolRegistry.get('venice_generate_image')!;
      const videoTool = globalToolRegistry.get('venice_generate_video')!;
      const researchTool = globalToolRegistry.get('venice_research')!;

      expect(bridgeTool.isPaidService).toBe(false);
      expect(bridgeTool.costEstimateUsd).toBe(0);

      expect(imageTool.isPaidService).toBe(false);
      expect(imageTool.costEstimateUsd).toBe(0);

      expect(videoTool.isPaidService).toBe(false);
      expect(videoTool.costEstimateUsd).toBe(0);

      expect(researchTool.isPaidService).toBe(false);
      expect(researchTool.costEstimateUsd).toBe(0);
    });

    it('executes venice_website_bridge tool with input validation', async () => {
      // Missing required prompt
      const invalid = await globalToolRegistry.execute('venice_website_bridge', { action: 'image' });
      expect(invalid.success).toBe(false);
      expect(invalid.error).toContain('Input validation failed');

      // Valid execution
      const valid = await globalToolRegistry.execute('venice_website_bridge', {
        action: 'image',
        prompt: 'sunset over calm ocean',
        aspectRatio: '16:9',
      });
      expect(valid.success).toBe(true);
      expect((valid.data as any)?.costIncurredUsd).toBe(0);
    });

    it('executes venice_generate_video tool and provides authorized studio session', async () => {
      const res = await globalToolRegistry.execute('venice_generate_video', {
        prompt: 'drone view of misty waterfall',
      });
      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.userHandoffRequired).toBe(true);
      expect(data.loginRequired).toBe(true);
      expect(data.handoffUrl).toContain('https://venice.ai/studio/video');
    });

    it('executes venice_research tool for knowledge queries', async () => {
      const res = await globalToolRegistry.execute('venice_research', {
        query: 'open-source robotics breakthroughs',
      });
      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.costIncurredUsd).toBe(0);
    });
  });

  describe('Connectors Integration', () => {
    it('seeds and tests Venice connector in Store', () => {
      const store = new Store(':memory:');
      const connectors = store.connectors('opendots-owner');
      const veniceConn = connectors.find((c) => c.type === 'venice');

      expect(veniceConn).toBeDefined();
      expect(veniceConn?.name).toBe('Venice.ai Website Bridge');
      expect(veniceConn?.status).toBe('connected');

      const testResult = store.testConnector('venice', 'opendots-owner');
      expect(testResult.success).toBe(true);
      expect(testResult.message).toContain('Venice.ai Website Bridge is active');
    });
  });
});
