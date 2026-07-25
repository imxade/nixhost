import { HttpError } from "./errors.ts";

const MAX_ENVIRONMENT_ENTRIES = 200;

export function parseEnvironmentText(text: string): Record<string, string> {
  const variables: Record<string, string> = {};
  const seen = new Set<string>();
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  for (let index = 0; index < lines.length; index++) {
    const original = lines[index] ?? "";
    let line = original.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7).trimStart();

    const separator = line.indexOf("=");
    if (separator <= 0) {
      throw new HttpError(
        400,
        `Environment line ${index + 1} must use KEY=value`,
        "invalid_environment_text",
      );
    }
    const key = line.slice(0, separator).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
      throw new HttpError(
        400,
        `Environment line ${index + 1} has an invalid variable name`,
        "invalid_env_key",
      );
    }
    if (seen.has(key)) {
      throw new HttpError(
        400,
        `Environment variable ${key} appears more than once`,
        "duplicate_env_key",
      );
    }
    seen.add(key);

    const rawValue = line.slice(separator + 1).trim();
    variables[key] = parseValue(rawValue, index + 1);
    if (seen.size > MAX_ENVIRONMENT_ENTRIES) {
      throw new HttpError(
        400,
        `A maximum of ${MAX_ENVIRONMENT_ENTRIES} environment variables can be updated at once`,
        "too_many_env_keys",
      );
    }
  }

  if (seen.size === 0) {
    throw new HttpError(400, "Enter at least one KEY=value line", "empty_environment_text");
  }
  return variables;
}

function parseValue(value: string, lineNumber: number): string {
  if (!value) return "";
  const quote = value[0];
  if (quote !== '"' && quote !== "'") return value;
  if (value.length < 2 || value.at(-1) !== quote) {
    throw new HttpError(
      400,
      `Environment line ${lineNumber} has an unterminated quoted value`,
      "invalid_environment_text",
    );
  }
  const inner = value.slice(1, -1);
  if (quote === "'") return inner;
  return inner.replace(/\\([\\"nrt])/g, (_, escaped: string) => {
    if (escaped === "n") return "\n";
    if (escaped === "r") return "\r";
    if (escaped === "t") return "\t";
    return escaped;
  });
}
