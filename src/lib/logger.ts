/**
 * Logger utility with level-filtered output.
 * In production builds, debug and info messages are suppressed.
 * Warn and error always log.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel =
  import.meta.env.MODE === 'production' ? 'warn' : 'debug';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

export const logger = {
  debug(message: string, ...args: unknown[]) {
    if (shouldLog('debug')) console.debug(`[DEBUG] ${message}`, ...args);
  },
  info(message: string, ...args: unknown[]) {
    if (shouldLog('info')) console.info(`[INFO] ${message}`, ...args);
  },
  warn(message: string, ...args: unknown[]) {
    if (shouldLog('warn')) console.warn(`[WARN] ${message}`, ...args);
  },
  error(message: string, ...args: unknown[]) {
    if (shouldLog('error')) console.error(`[ERROR] ${message}`, ...args);
  },
};

export default logger;
