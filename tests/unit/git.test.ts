import { describe, expect, it } from "vitest";
import {
  defaultBranchFromLsRemote,
  FALLBACK_DEFAULT_BRANCH,
  isValidGitBranchName,
} from "../../src/server/git.ts";

describe("Git branch handling", () => {
  it("uses the symbolic remote HEAD branch", () => {
    expect(
      defaultBranchFromLsRemote(
        "ref: refs/heads/release/v2\tHEAD\n2f5f3b38\tHEAD\n2f5f3b38\trefs/heads/release/v2\n",
      ),
    ).toBe("release/v2");
  });

  it("falls back to main when remote HEAD has no branch", () => {
    expect(defaultBranchFromLsRemote("2f5f3b38\tHEAD\n")).toBe(FALLBACK_DEFAULT_BRANCH);
    expect(defaultBranchFromLsRemote("")).toBe("main");
  });

  it.each(["main", "release/v2", "feature.with-dots", "users/alice_topic"])(
    "accepts a safe branch name: %s",
    (branch) => {
      expect(isValidGitBranchName(branch)).toBe(true);
    },
  );

  it.each([
    "-upload-pack=malicious",
    "../main",
    "release//v2",
    "release.lock",
    "feature@{1}",
    "feature:main",
    "feature main",
    ".hidden/main",
  ])("rejects an unsafe or invalid branch name: %s", (branch) => {
    expect(isValidGitBranchName(branch)).toBe(false);
  });
});
