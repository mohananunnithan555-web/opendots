export function createThoughtSignatureFetch(): typeof fetch {
  const toolSignatures = new Map<string, string>();

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (init?.body && typeof init.body === 'string') {
      try {
        const data = JSON.parse(init.body);
        if (Array.isArray(data.messages)) {
          let modified = false;
          for (const msg of data.messages) {
            if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
              for (const tc of msg.tool_calls) {
                if (tc.id && toolSignatures.has(tc.id) && !tc.extra_content) {
                  tc.extra_content = {
                    google: { thought_signature: toolSignatures.get(tc.id) },
                  };
                  modified = true;
                }
              }
            }
          }
          if (modified) {
            init.body = JSON.stringify(data);
          }
        }
      } catch {}
    }

    const res = await fetch(input, init);
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
                  if (tc.id && sig) {
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
