const levelPriority = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

const stringFields = Object.freeze({
  errorClass: 64,
  errorCode: 64,
  host: 255,
  method: 16,
  requestId: 64,
  route: 256,
  signal: 16,
});

const numberFields = new Set(["durationMs", "port", "statusCode"]);

function safeEventName(event) {
  return typeof event === "string" && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(event)
    ? event
    : "invalid_event";
}

function allowlistedFields(fields) {
  const safe = {};

  for (const [name, maximumLength] of Object.entries(stringFields)) {
    const value = fields?.[name];
    if (typeof value === "string" && value.length <= maximumLength) safe[name] = value;
  }

  for (const name of numberFields) {
    const value = fields?.[name];
    if (typeof value === "number" && Number.isFinite(value)) safe[name] = value;
  }

  return safe;
}

export function createJsonLogger(config, { write = (line) => console.log(line) } = {}) {
  const configuredLevel = config.logging?.level ?? "info";
  const minimumLevel =
    config.nodeEnv === "production" && configuredLevel === "debug" ? "info" : configuredLevel;

  function log(level, event, fields = {}) {
    if (!(level in levelPriority) || levelPriority[level] < levelPriority[minimumLevel]) return;

    const record = {
      timestamp: new Date().toISOString(),
      level,
      service: "opspilot-api",
      environment: config.nodeEnv,
      event: safeEventName(event),
      ...allowlistedFields(fields),
    };

    try {
      write(JSON.stringify(record));
    } catch {
      // Logging is best effort; request and shutdown paths must remain available if stdout fails.
    }
  }

  return Object.freeze({ log });
}
