import { describe, expect, it } from "vite-plus/test";

import { siteName } from "./siteName";

describe("siteName", () => {
  it.each([
    ["https://admin.shopify.com/store/example-store/", "shopify.com"],
    ["https://www.github.com/pingdotgg", "github.com"],
    ["https://www.bbc.co.uk/news", "bbc.co.uk"],
    ["https://shop.example.com.au/", "example.com.au"],
    ["https://my-app-git-main.vercel.app/", "my-app-git-main.vercel.app"],
    ["https://docs.user.github.io/x", "user.github.io"],
    ["http://localhost:5173/settings", "localhost:5173"],
    ["http://app.localhost:3000/", "app.localhost:3000"],
    ["http://127.0.0.1:8080/", "127.0.0.1:8080"],
    ["http://[::1]:4000/", "[::1]:4000"],
    ["http://devbox:3000/", "devbox:3000"],
    ["http://box.tail1234.ts.net:5173/", "box.tail1234.ts.net:5173"],
    ["http://devbox.local:3000/", "devbox.local:3000"],
    ["https://example.com./", "example.com"],
    ["about:blank", null],
    ["file:///tmp/index.html", null],
    ["not a url", null],
  ])("%s → %s", (url, expected) => {
    expect(siteName(url)).toBe(expected);
  });
});
