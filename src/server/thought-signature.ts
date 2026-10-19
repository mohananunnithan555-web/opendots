const FALLBACK_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-latest',
  'gemini-3.7-flash',
];

const toolSignatures = new Map<string, string>();

export function createThoughtSignatureFetch(): typeof fetch {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    let parsedBody: Record<string, unknown> | null = null;
    if (init?.body && typeof init.body === 'string') {
      try {
        parsedBody = JSON.parse(init.body);
        if (parsedBody && Array.isArray(parsedBody.messages)) {
          let modified = false;
          for (const msg of parsedBody.messages as Array<Record<string, unknown>>) {
            if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
              for (const tc of msg.tool_calls as Array<Record<string, unknown>>) {
                if (
                  typeof tc.id === 'string' &&
                  toolSignatures.has(tc.id) &&
                  !tc.extra_content
                ) {
                  tc.extra_content = {
                    google: { thought_signature: toolSignatures.get(tc.id) },
                  };
                  modified = true;
                }
              }
            }
          }
          if (modified) {
            init.body = JSON.stringify(parsedBody);
          }
        }
      } catch {}
    }

    let res = await fetch(input, init);

    // If 400 Bad Request (commonly due to invalid/missing thought_signature in multi-turn tool history),
    // sanitize prior tool_calls into plain conversational messages and retry seamlessly
    if (res.status === 400 && parsedBody && Array.isArray(parsedBody.messages) && init) {
      try {
        let converted = false;
        const sanitizedMessages = (parsedBody.messages as Array<Record<string, unknown>>).map((msg) => {
          if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
            converted = true;
            const toolSummary = (msg.tool_calls as Array<Record<string, any>>)
              .map((tc) => `[Executed tool: ${tc.function?.name ?? 'action'}]`)
              .join('\n');
            const newMsg = { ...msg };
            newMsg.content = (typeof msg.content === 'string' && msg.content ? msg.content + '\n' : '') + toolSummary;
            delete newMsg.tool_calls;
            return newMsg;
          }
          if (msg.role === 'tool') {
            converted = true;
            return {
              role: 'user',
              content: `[Tool result]: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`,
            };
          }
          return msg;
        });

        if (converted) {
          parsedBody.messages = sanitizedMessages;
          init.body = JSON.stringify(parsedBody);
          const retryRes = await fetch(input, init);
          if (retryRes.status === 200) {
            res = retryRes;
          }
        }
      } catch {}
    }

    // If rate-limited (429), server overloaded (503), or retired model (404), try fallback models
    if (
      (res.status === 429 || res.status === 503 || res.status === 404) &&
      parsedBody &&
      typeof parsedBody.model === 'string' &&
      init
    ) {
      const originalModel = parsedBody.model;
      for (const fallback of FALLBACK_MODELS) {
        if (fallback === originalModel) continue;
        parsedBody.model = fallback;
        init.body = JSON.stringify(parsedBody);
        try {
          const altRes = await fetch(input, init);
          if (altRes.status === 200) {
            res = altRes;
            break;
          }
        } catch {}
      }
    }

    if (!res.body) return res;

    // Inspect stream for thought_signature in tool_calls to retain for subsequent turns
    const [stream1, stream2] = res.body.tee();
    (async () => {
      try {
        const reader = stream2.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ') || line.trim() === 'data: [DONE]')
              continue;
            try {
              const parsed = JSON.parse(line.slice(6));
              const toolCalls = parsed.choices?.[0]?.delta?.tool_calls;
              if (Array.isArray(toolCalls)) {
                for (const tc of toolCalls) {
                  const sig = tc.extra_content?.google?.thought_signature;
                  if (typeof tc.id === 'string' && typeof sig === 'string') {
                    toolSignatures.set(tc.id, sig);
                  }
                }
              }
            } catch {}
          }
        }
      } catch {}
    })();

    return new Response(stream1, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  };
}
