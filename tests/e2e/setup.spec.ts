import { test,expect } from "@playwright/test";
test("setup status endpoint responds",async({request})=>{const response=await request.get("/api/setup/status");expect(response.ok()).toBeTruthy();const body=await response.json();expect(body.ok).toBe(true);expect(typeof body.data.complete).toBe("boolean")});
