import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("owner setup, session auth, origin checks, and viewer RBAC work end to end", async ({
  browser,
  page,
  request,
}) => {
  const dataDirectory = path.resolve(
    process.env.NIXHOST_E2E_DATA_DIR || path.join(process.cwd(), ".e2e-data"),
  );
  const tokenPath = path.join(dataDirectory, "setup-token.txt");
  const token = fs.readFileSync(tokenPath, "utf8").trim();

  const unauthenticated = await request.get("/api/apps");
  expect(unauthenticated.status()).toBe(401);

  const setupDocument = await request.get("/setup");
  const setupHtml = await setupDocument.text();
  expect(setupDocument.ok()).toBe(true);
  expect(setupHtml.indexOf('src="/theme-init.js"')).toBeGreaterThan(-1);
  expect(setupHtml.indexOf('src="/theme-init.js"')).toBeLessThan(setupHtml.indexOf("<body"));
  expect((await request.get("/theme-init.js")).ok()).toBe(true);

  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole("button", { name: "Toggle color theme" })).toBeVisible();

  const labels = ["Setup token", "Owner username", "Password"];
  const boxes = await Promise.all(labels.map((label) => page.getByLabel(label).boundingBox()));
  expect(boxes.every(Boolean)).toBe(true);
  for (const box of boxes.slice(1)) {
    expect(Math.abs((box?.x ?? 0) - (boxes[0]?.x ?? 0))).toBeLessThan(1);
    expect(Math.abs((box?.width ?? 0) - (boxes[0]?.width ?? 0))).toBeLessThan(1);
  }

  await page.evaluate(() => localStorage.setItem("nixhost-theme", "dracula"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dracula");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dracula");
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "cupcake");

  await page.setViewportSize({ width: 390, height: 844 });
  const authCard = await page.locator("main section").boundingBox();
  expect(authCard?.x).toBeGreaterThanOrEqual(16);
  expect((authCard?.x ?? 0) + (authCard?.width ?? 0)).toBeLessThanOrEqual(374);
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.getByLabel("Setup token").fill(token);
  await page.getByLabel("Owner username").fill("owner");
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create owner account" }).click();
  await expect(page).toHaveURL(/\/apps$/);
  await expect(page.getByRole("heading", { name: "Applications", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle color theme" })).toBeVisible();
  expect(fs.existsSync(tokenPath)).toBe(false);

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of [
      "/apps",
      "/deployments",
      "/integrations/github",
      "/integrations/cloudflare",
      "/system",
      "/users",
    ]) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator('button[aria-label="Toggle color theme"]:visible')).toHaveCount(1);
      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        elements: Array.from(document.querySelectorAll<HTMLElement>("body *"))
          .filter((element) => {
            const bounds = element.getBoundingClientRect();
            return bounds.right > document.documentElement.clientWidth + 1 || bounds.left < -1;
          })
          .slice(0, 8)
          .map((element) => ({
            tag: element.tagName,
            className: element.className,
            left: element.getBoundingClientRect().left,
            right: element.getBoundingClientRect().right,
          })),
      }));
      expect(
        overflow.scrollWidth,
        `${route} overflowed at ${viewport.width}x${viewport.height}: ${JSON.stringify(overflow.elements)}`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);
    }
  }
  await page.setViewportSize({ width: 1280, height: 720 });

  const rejectedOrigin = await page.request.post("/api/users", {
    headers: { origin: "https://attacker.invalid" },
    data: { username: "blocked", password: "blocked-password", role: "viewer" },
  });
  expect(rejectedOrigin.status()).toBe(403);

  await page.goto("/users");
  await page.getByLabel("Username").fill("viewer");
  await page.getByLabel("Temporary password").fill("viewer password 123");
  await page.getByLabel("Role").selectOption("viewer");
  await page.getByRole("button", { name: "Create user" }).click();
  await expect(page.getByRole("cell", { name: "viewer" }).first()).toBeVisible();

  const viewerContext = await browser.newContext();
  const viewerPage = await viewerContext.newPage();
  await viewerPage.goto("/login");
  await viewerPage.getByLabel("Username").fill("viewer");
  await viewerPage.getByLabel("Password").fill("viewer password 123");
  await viewerPage.getByRole("button", { name: "Sign in" }).click();
  await expect(viewerPage).toHaveURL(/\/apps$/);

  await viewerPage.goto("/users");
  await expect(viewerPage).toHaveURL(/\/apps$/);
  const viewerMutation = await viewerPage.evaluate(async () => {
    const response = await fetch("/api/apps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Forbidden",
        repositoryUrl: "https://github.com/example/forbidden.git",
      }),
    });
    return response.status;
  });
  expect(viewerMutation).toBe(403);
  await viewerContext.close();
});
