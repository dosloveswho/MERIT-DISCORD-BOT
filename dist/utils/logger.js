"use strict";
/* Simple structured console logger. Never logs secrets. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const REDACT_KEYS = new Set([
    "discordtoken",
    "supabaseservicerolekey",
    "token",
    "authorization",
]);
function safeStringify(value) {
    try {
        return JSON.stringify(value, (key, val) => {
            if (REDACT_KEYS.has(key.toLowerCase()))
                return "[REDACTED]";
            return val;
        });
    }
    catch {
        return String(value);
    }
}
function timestamp() {
    return new Date().toISOString();
}
exports.logger = {
    info(message, meta) {
        console.log(`[${timestamp()}] [INFO] ${message}`, meta ? safeStringify(meta) : "");
    },
    warn(message, meta) {
        console.warn(`[${timestamp()}] [WARN] ${message}`, meta ? safeStringify(meta) : "");
    },
    error(message, error, meta) {
        const errInfo = error instanceof Error
            ? { message: error.message, stack: error.stack }
            : error;
        console.error(`[${timestamp()}] [ERROR] ${message}`, errInfo ? safeStringify(errInfo) : "", meta ? safeStringify(meta) : "");
    },
    debug(message, meta) {
        if (process.env.NODE_ENV === "development") {
            console.debug(`[${timestamp()}] [DEBUG] ${message}`, meta ? safeStringify(meta) : "");
        }
    },
};
