import { describe,expect,it } from "vitest";
describe("application naming contract",()=>{it("documents URL-safe expected names",()=>expect("My API".toLowerCase().replace(/[^a-z0-9]+/g,"-")).toBe("my-api"))});
