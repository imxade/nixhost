import { describe, expect, it } from "vitest";
import { parseEnvironmentText } from "../../src/server/environment.ts";

describe("environment text parser", () => {
  it("accepts dotenv-style lines without exposing values later", () => {
    expect(
      parseEnvironmentText(`
# comment
DATABASE_URL=postgres://localhost/db
export API_TOKEN="line\\nvalue"
EMPTY=
`),
    ).toEqual({
      DATABASE_URL: "postgres://localhost/db",
      API_TOKEN: "line\nvalue",
      EMPTY: "",
    });
  });

  it("rejects malformed and duplicate keys", () => {
    expect(() => parseEnvironmentText("NOT A VARIABLE")).toThrow(/KEY=value/);
    expect(() => parseEnvironmentText("TOKEN=one\nTOKEN=two")).toThrow(/more than once/);
    expect(() => parseEnvironmentText("BAD-NAME=value")).toThrow(/invalid variable name/);
  });
});
