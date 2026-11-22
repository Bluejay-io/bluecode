import { describe, expect, it } from "vite-plus/test";

import { agentStateOf } from "./agentState";

describe("agentStateOf", () => {
  it.each([
    ["preparing", false, false, "starting"],
    ["working", true, true, "working"],
    ["approval", true, false, "approval"],
    ["failed", true, false, "failed"],
    ["ready", true, true, "woke"],
    ["ready", true, false, "unread"],
    ["ready", false, false, "idle"],
  ] as const)("%s, unread %s, woke %s → %s", (status, isUnread, isWoke, expected) => {
    expect(agentStateOf(status, { isUnread, isWoke })).toBe(expected);
  });
});
