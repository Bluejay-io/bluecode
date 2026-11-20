import { describe, expect, it } from "vite-plus/test";

import { isPublicWebUrl } from "./publicWebUrl";

describe("isPublicWebUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=1", true],
    ["https://duckduckgo.com/?q=react", true],
    ["http://localhost:3000/", false],
    ["http://127.0.0.1:5173/", false],
    ["http://192.168.1.20:8080/", false],
    ["http://devbox:8080/", false],
    ["https://devbox.tail1234.ts.net/", false],
    ["http://app.test/", false],
    ["file:///etc/hosts", false],
  ])("%s → %s", (url, expected) => {
    expect(isPublicWebUrl(url)).toBe(expected);
  });
});
