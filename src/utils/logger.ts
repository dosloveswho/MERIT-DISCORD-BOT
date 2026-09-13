/* Simple structured console logger. Never logs secrets. */

const REDACT_KEYS = new Set([
  "discordtoken",
  "supabaseservicerolekey",
  "token",
  "authorization",
]);

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (key, val) => {
      if (REDACT_KEYS.has(key.toLowerCase())) return "[REDACTED]";
      return val;
    });
  } catch {
    return String(value);
  }
}

function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    console.log(`[${timestamp()}] [INFO] ${message}`, meta ? safeStringify(meta) : "");
  },
  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(`[${timestamp()}] [WARN] ${message}`, meta ? safeStringify(meta) : "");
  },
  error(message: string, error?: unknown, meta?: Record<string, unknown>) {
    const errInfo =
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : error;
    console.error(
      `[${timestamp()}] [ERROR] ${message}`,
      errInfo ? safeStringify(errInfo) : "",
      meta ? safeStringify(meta) : ""
    );
  },
  debug(message: string, meta?: Record<string, unknown>) {
    if (process.env.NODE_ENV === "development") {
      console.debug(`[${timestamp()}] [DEBUG] ${message}`, meta ? safeStringify(meta) : "");
    }
  },
};
