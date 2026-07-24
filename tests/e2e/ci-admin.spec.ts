import { expect, test } from "@playwright/test";

test("CI-only admin can sign in and throttled login responses provide retry timing", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("qwerty123456");
  await page.getByLabel("Password").fill("qwerty123456");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/apps$/);

  const currentUser = await page.evaluate(async () => {
    const response = await fetch("/api/auth/me");
    return response.json();
  });
  expect(currentUser).toMatchObject({
    ok: true,
    data: {
      user: { username: "qwerty123456", role: "admin" },
    },
  });

  const attempts = await page.evaluate(async () => {
    const results: Array<{ status: number; retryAfter: string | null }> = [];
    for (let attempt = 0; attempt < 7; attempt++) {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "rate-limit-target",
          password: "incorrect password",
        }),
      });
      results.push({
        status: response.status,
        retryAfter: response.headers.get("retry-after"),
      });
    }
    return results;
  });

  expect(attempts.slice(0, 6).map(({ status }) => status)).toEqual([401, 401, 401, 401, 401, 401]);
  expect(attempts[6]?.status).toBe(429);
  expect(Number(attempts[6]?.retryAfter)).toBeGreaterThan(0);
  expect(Number(attempts[6]?.retryAfter)).toBeLessThanOrEqual(3600);
});
