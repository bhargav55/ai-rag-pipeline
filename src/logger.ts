export type LogLevel = "info" | "error";

export type LogFields = Record<string, unknown>;

export type Logger = {
  info(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
};

type JsonLoggerOptions = {
  nowIso?: () => string;
  write?: (line: string) => void;
};

const secretKeyPattern = /api[_-]?key|authorization|token|secret|password|credential/i;

const redactSecrets = (value: unknown, key = ""): unknown => {
  if (secretKeyPattern.test(key)) return "[REDACTED]";

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        redactSecrets(entryValue, entryKey),
      ]),
    );
  }

  return value;
};

export const createJsonLogger = ({
  nowIso = () => new Date().toISOString(),
  write = (line) => console.error(line),
}: JsonLoggerOptions = {}): Logger => {
  const log = (level: LogLevel, message: string, fields: LogFields = {}): void => {
    write(
      JSON.stringify({
        timestamp: nowIso(),
        level,
        message,
        ...(redactSecrets(fields) as LogFields),
      }),
    );
  };

  return {
    info(message, fields) {
      log("info", message, fields);
    },
    error(message, fields) {
      log("error", message, fields);
    },
  };
};
