export function resolveAppOrigins(
  appOrigin: string | undefined,
  nodeEnv: string | undefined,
): string[] | undefined {
  if (appOrigin)
    return appOrigin
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  if (process.env.RENDER_EXTERNAL_URL) {
    return [process.env.RENDER_EXTERNAL_URL.trim()];
  }
  return nodeEnv === 'development'
    ? ['http://localhost:5173', 'http://127.0.0.1:5173']
    : undefined;
}
