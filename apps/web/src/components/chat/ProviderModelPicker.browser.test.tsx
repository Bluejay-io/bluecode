import {
  DEFAULT_CLIENT_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
  type ModelSelection,
} from "@t3tools/contracts";
import {
  compileResolvedKeybindingsConfig,
  DEFAULT_RESOLVED_KEYBINDINGS,
} from "@t3tools/shared/keybindings";
import { use, useState } from "react";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";

import { render } from "../../../test/render";
import { ComposerHandleContext, type ComposerHandleRef } from "../../composerHandleContext";
import { __setClientSettingsForTests } from "../../hooks/useSettings";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import { DockedPickerContext, ProviderModelPicker } from "./ProviderModelPicker";

it("keeps each registry image when adding a model from another ACP agent", async () => {
  const icons = [
    "https://cdn.agentclientprotocol.com/registry/icons/picker-explicit.svg",
    "https://cdn.agentclientprotocol.com/registry/v1/latest/picker-by-id.svg",
  ];
  const cache = await caches.open("t3-acp-registry-icons-v1");
  await using _cachedIcons = {
    async [Symbol.asyncDispose]() {
      await Promise.all(icons.map((url) => cache.delete(url)));
    },
  };
  for (const [index, url] of icons.entries()) {
    await cache.put(
      url,
      new Response(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${11 + index * 6}" height="10"><path d="M0 0h10v10H0z"/></svg>`,
        { headers: { "content-type": "image/svg+xml" } },
      ),
    );
  }
  const entries = deriveProviderInstanceEntries(
    ["First", "Second"].map((name) => ({
      instanceId: ProviderInstanceId.make(name.toLowerCase()),
      driver: ProviderDriverKind.make("acpRegistry"),
      displayName: `${name} agent`,
      enabled: true,
      installed: true,
      version: null,
      status: "ready" as const,
      auth: { status: "authenticated" as const },
      checkedAt: "2026-01-01T00:00:00.000Z",
      models: [
        { slug: name.toLowerCase(), name: `${name} model`, isCustom: false, capabilities: {} },
      ],
      slashCommands: [],
      skills: [],
    })),
  ).map((entry, index) => ({
    ...entry,
    ...(index === 0 ? { acpRegistryIconUrl: icons[0] } : { acpRegistryAgentId: "picker-by-id" }),
  }));
  const first = { instanceId: entries[0]!.instanceId, model: "first" };
  const options = new Map(entries.map((entry) => [entry.instanceId, entry.models]));

  function Picker() {
    const [selection, setSelection] = useState<ReadonlyArray<ModelSelection>>([first]);
    return (
      <ProviderModelPicker
        environmentId={null}
        activeInstanceId={first.instanceId}
        model={first.model}
        {...(selection.length > 1 ? { selectedModels: selection } : {})}
        lockedProvider={null}
        instanceEntries={entries}
        modelOptionsByInstance={options}
        onToggleModel={(instanceId, model) => setSelection([...selection, { instanceId, model }])}
        onInstanceModelChange={(instanceId, model) => setSelection([{ instanceId, model }])}
      />
    );
  }

  await using screen = await render(<Picker />);
  const imageWidths = () =>
    Array.from(
      screen.container.querySelectorAll<HTMLImageElement>("[data-chat-provider-model-picker] img"),
      (image) => image.naturalWidth,
    );
  await vi.waitFor(() => expect(imageWidths()).toEqual([11]));
  await screen.getByRole("button", { name: "First model", exact: true }).click();
  await userEvent.keyboard("{Shift>}");
  try {
    await page.getByRole("option", { name: /Second model/ }).click();
  } finally {
    await userEvent.keyboard("{/Shift}");
  }
  await userEvent.keyboard("{Escape}");
  await vi.waitFor(() => expect(imageWidths()).toEqual([11, 17]));
});

// The settings section's shape: the selected level takes the effort shortcut.
function StubSection(props: { levels: ReadonlyArray<string> }) {
  const { effortFocusRef } = use(DockedPickerContext);
  return (
    <>
      {props.levels.map((level, index, all) => (
        <button
          key={level}
          ref={index === all.length - 1 ? effortFocusRef : undefined}
          type="button"
          role="radio"
          aria-checked={index === all.length - 1}
        >
          {level}
        </button>
      ))}
    </>
  );
}

it("shows a docked picker as one panel: search and tabs, the list, then the model's reasoning", async () => {
  const entries = deriveProviderInstanceEntries(
    ["Codex", "Claude"].map((name) => ({
      instanceId: ProviderInstanceId.make(name.toLowerCase()),
      driver: ProviderDriverKind.make(name.toLowerCase()),
      enabled: true,
      installed: true,
      version: null,
      status: "ready" as const,
      auth: { status: "authenticated" as const },
      checkedAt: "2026-01-01T00:00:00.000Z",
      models: [],
      slashCommands: [],
      skills: [],
    })),
  );
  const [codex, claude] = entries;
  const options = new Map([
    [
      codex!.instanceId,
      [
        { slug: "original", name: "Original model" },
        { slug: "second", name: "Second model" },
      ],
    ],
    [claude!.instanceId, [{ slug: "opus", name: "Opus model" }]],
  ]);
  // The last level is the selected one.
  const levels: Record<string, ReadonlyArray<string>> = {
    original: ["Low", "High"],
    second: ["Medium"],
  };

  function Picker() {
    const [model, setModel] = useState("original");
    return (
      <ProviderModelPicker
        environmentId={null}
        activeInstanceId={codex!.instanceId}
        model={model}
        lockedProvider={null}
        instanceEntries={entries}
        modelOptionsByInstance={options}
        triggerAriaLabel="Choose model"
        isComposerOwned
        onInstanceModelChange={(_, selected) => setModel(selected)}
        keybindings={DEFAULT_RESOLVED_KEYBINDINGS}
        effortColumn={<StubSection levels={levels[model] ?? []} />}
      />
    );
  }

  const composer = { focusAtEnd: vi.fn() };
  await using screen = await render(
    <ComposerHandleContext value={{ current: composer } as unknown as ComposerHandleRef}>
      <Picker />
    </ComposerHandleContext>,
  );
  const trigger = screen.getByRole("button", { name: "Choose model" });
  await trigger.click();
  const search = page.getByPlaceholder("Search models...");
  const high = page.getByRole("radio", { name: "High" });
  // The list and the reasoning show together; focus starts in the search.
  await expect.element(search).toHaveFocus();
  await expect.element(high).toBeVisible();

  // Typing anywhere in the panel lands in the search, keeping what was typed.
  await high.click();
  await userEvent.keyboard("Sec");
  await expect.element(search).toHaveFocus();
  await expect.element(search).toHaveValue("Sec");
  await userEvent.clear(search);

  // A provider tab lists only its models, and keeps focus in the search.
  await page.getByRole("tab", { name: /Claude/ }).click();
  await expect.element(search).toHaveFocus();
  await expect.element(page.getByRole("option", { name: /Opus model/ })).toBeVisible();
  await expect.element(page.getByRole("option", { name: /Second model/ })).not.toBeInTheDocument();
  // With a tab chosen, the provider shortcuts move the filter to the next and previous provider.
  await userEvent.keyboard("{Control>}{Shift>}{ArrowDown}{/Shift}{/Control}");
  await expect
    .element(page.getByRole("tab", { name: /Codex/ }))
    .toHaveAttribute("aria-selected", "true");
  await expect.element(page.getByRole("option", { name: /Second model/ })).toBeVisible();
  await expect.element(page.getByRole("option", { name: /Opus model/ })).not.toBeInTheDocument();
  await userEvent.keyboard("{Control>}{Shift>}{ArrowUp}{/Shift}{/Control}");
  await expect
    .element(page.getByRole("tab", { name: /Claude/ }))
    .toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "All" }).click();

  // A pick keeps the panel open, with the new model's reasoning under the list.
  await page.getByRole("option", { name: /Second model/ }).click();
  await expect.element(page.getByRole("radio", { name: "Medium" })).toBeVisible();
  await expect.element(search).toBeVisible();

  // Opened by a click, Escape closes and returns to the editor.
  await userEvent.keyboard("{Escape}");
  await expect.element(search).not.toBeInTheDocument();
  await vi.waitFor(() => expect(composer.focusAtEnd).toHaveBeenCalledTimes(1));

  // Reached and opened from the keyboard, Escape hands focus back to the trigger.
  (trigger.element() as HTMLElement).focus();
  await userEvent.keyboard("{Enter}");
  await expect.element(search).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await expect.element(search).not.toBeInTheDocument();
  await expect.element(trigger).toHaveFocus();
  expect(composer.focusAtEnd).toHaveBeenCalledTimes(1);

  // composer.effort marks the trigger and clicks it: the panel opens on the selected level.
  const triggerElement = trigger.element() as HTMLElement;
  triggerElement.dataset.openToEffort = "true";
  triggerElement.click();
  await expect.element(page.getByRole("radio", { name: "Medium" })).toHaveFocus();
});

it("lists a model reported twice by one provider once, with contiguous jump shortcuts", async () => {
  const instanceId = ProviderInstanceId.make("claude");
  const entries = deriveProviderInstanceEntries([
    {
      instanceId,
      driver: ProviderDriverKind.make("claudeAgent"),
      enabled: true,
      installed: true,
      version: null,
      status: "ready",
      auth: { status: "authenticated" },
      checkedAt: "2026-01-01T00:00:00.000Z",
      models: [],
      slashCommands: [],
      skills: [],
    },
  ]);
  const options = new Map([
    [
      instanceId,
      ["a", "b", "c", "c", "d", "d"].map((slug) => ({
        slug,
        name: `Model ${slug.toUpperCase()}`,
      })),
    ],
  ]);
  const keybindings = compileResolvedKeybindingsConfig(
    ([1, 2, 3, 4, 5, 6] as const).map((index) => ({
      key: `mod+${index}`,
      command: `modelPicker.jump.${index}` as const,
      when: "modelPickerOpen",
    })),
  );

  await using screen = await render(
    <ProviderModelPicker
      environmentId={null}
      activeInstanceId={instanceId}
      model="a"
      lockedProvider={null}
      instanceEntries={entries}
      modelOptionsByInstance={options}
      keybindings={keybindings}
      triggerAriaLabel="Choose model"
      onInstanceModelChange={() => {}}
    />,
  );
  await screen.getByRole("button", { name: "Choose model" }).click();
  await expect.element(page.getByRole("option", { name: /Model A/ })).toBeVisible();
  await vi.waitFor(() =>
    expect(
      page
        .getByRole("option")
        .elements()
        .map((row) => [
          row.textContent?.match(/Model [A-Z]/)?.[0],
          row.querySelector("kbd")?.textContent?.slice(-1),
        ]),
    ).toEqual([
      ["Model A", "1"],
      ["Model B", "2"],
      ["Model C", "3"],
      ["Model D", "4"],
    ]),
  );
});

it("opens on the active provider when every favorite belongs to a disabled provider", async () => {
  const entries = deriveProviderInstanceEntries(
    ["Codex", "Claude"].map((name) => ({
      instanceId: ProviderInstanceId.make(name.toLowerCase()),
      driver: ProviderDriverKind.make(name.toLowerCase()),
      enabled: name === "Codex",
      installed: true,
      version: null,
      status: "ready" as const,
      auth: { status: "authenticated" as const },
      checkedAt: "2026-01-01T00:00:00.000Z",
      models: [
        { slug: name.toLowerCase(), name: `${name} model`, isCustom: false, capabilities: {} },
      ],
      slashCommands: [],
      skills: [],
    })),
  );
  const [codex, claude] = entries;
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    favorites: [{ provider: claude!.instanceId, model: "claude" }],
  });
  using _settings = {
    [Symbol.dispose]: () => __setClientSettingsForTests(DEFAULT_CLIENT_SETTINGS),
  };

  await using screen = await render(
    <ProviderModelPicker
      environmentId={null}
      activeInstanceId={codex!.instanceId}
      model="codex"
      lockedProvider={null}
      instanceEntries={entries}
      modelOptionsByInstance={new Map(entries.map((entry) => [entry.instanceId, entry.models]))}
      triggerAriaLabel="Choose model"
      onInstanceModelChange={() => {}}
    />,
  );
  await screen.getByRole("button", { name: "Choose model" }).click();
  await expect.element(page.getByRole("option", { name: /Codex model/ })).toBeVisible();
});

it("opens a docked picker at the top, Favorites first, even when the selected model is further down", async () => {
  const entries = deriveProviderInstanceEntries(
    ["Codex", "Claude"].map((name) => ({
      instanceId: ProviderInstanceId.make(name.toLowerCase()),
      driver: ProviderDriverKind.make(name.toLowerCase()),
      enabled: true,
      installed: true,
      version: null,
      status: "ready" as const,
      auth: { status: "authenticated" as const },
      checkedAt: "2026-01-01T00:00:00.000Z",
      models: [],
      slashCommands: [],
      skills: [],
    })),
  );
  const [codex, claude] = entries;
  const options = new Map([
    [
      codex!.instanceId,
      Array.from({ length: 12 }, (_, index) => ({
        slug: `gpt-${index}`,
        name: `GPT ${index}`,
      })),
    ],
    [claude!.instanceId, [{ slug: "opus", name: "Opus model" }]],
  ]);
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    favorites: [{ provider: codex!.instanceId, model: "gpt-5" }],
  });
  using _settings = {
    [Symbol.dispose]: () => __setClientSettingsForTests(DEFAULT_CLIENT_SETTINGS),
  };

  await using screen = await render(
    <ProviderModelPicker
      environmentId={null}
      activeInstanceId={claude!.instanceId}
      model="opus"
      lockedProvider={null}
      instanceEntries={entries}
      modelOptionsByInstance={options}
      triggerAriaLabel="Choose model"
      onInstanceModelChange={() => {}}
      keybindings={DEFAULT_RESOLVED_KEYBINDINGS}
      effortColumn={<StubSection levels={[]} />}
    />,
  );
  await screen.getByRole("button", { name: "Choose model" }).click();
  const headings = () =>
    Array.from(
      document.querySelectorAll("[data-model-picker-content] [role=presentation]"),
      (heading) => heading.textContent,
    );
  const favoritesHeading = page.getByRole("presentation").filter({ hasText: /^Favorites$/ });
  const favoriteRow = page.getByRole("option", { name: /GPT 5/ }).first();

  await expect
    .poll(() =>
      page
        .getByRole("tab")
        .elements()
        .map((tab) => tab.ariaLabel ?? tab.textContent),
    )
    .toEqual(["All", "Favorites", "Codex", "Claude"]);
  await vi.waitFor(() => expect(headings()).toEqual(["Favorites", "Codex", "Claude"]));
  await expect.element(favoritesHeading).toBeInViewport({ ratio: 1 });
  await expect.element(favoriteRow).toBeInViewport({ ratio: 1 });
});

it("keeps the touch keyboard down when the picker opens", async () => {
  const entries = deriveProviderInstanceEntries(
    ["Codex", "Claude"].map((name) => ({
      instanceId: ProviderInstanceId.make(name.toLowerCase()),
      driver: ProviderDriverKind.make(name.toLowerCase()),
      enabled: true,
      installed: true,
      version: null,
      status: "ready" as const,
      auth: { status: "authenticated" as const },
      checkedAt: "2026-01-01T00:00:00.000Z",
      models: [
        { slug: name.toLowerCase(), name: `${name} model`, isCustom: false, capabilities: {} },
      ],
      slashCommands: [],
      skills: [],
    })),
  );
  const [codex] = entries;
  const matchMedia = window.matchMedia.bind(window);
  using _touch = vi.spyOn(window, "matchMedia").mockImplementation((query) =>
    query === "(pointer: coarse)"
      ? ({
          matches: true,
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        } as MediaQueryList)
      : matchMedia(query),
  );

  await using screen = await render(
    <ProviderModelPicker
      environmentId={null}
      activeInstanceId={codex!.instanceId}
      model="codex"
      lockedProvider={null}
      instanceEntries={entries}
      modelOptionsByInstance={new Map(entries.map((entry) => [entry.instanceId, entry.models]))}
      triggerAriaLabel="Choose model"
      onInstanceModelChange={() => {}}
    />,
  );
  await screen.getByRole("button", { name: "Choose model" }).click();
  const search = page.getByPlaceholder("Search models...");
  const popup = search.element().closest('[data-slot="popover-popup"]');
  await vi.waitFor(() => expect(document.activeElement).toBe(popup));
  // Every provider's models are listed together, so another provider needs no tap first.
  await expect.element(page.getByRole("option", { name: /Claude model/ })).toBeVisible();
  await expect.element(search).not.toHaveFocus();
});

it("keeps a docked picker's panel reachable and above its trigger as the window changes", async () => {
  await page.viewport(390, 700);
  const instanceId = ProviderInstanceId.make("codex");
  const entries = deriveProviderInstanceEntries([
    {
      instanceId,
      driver: ProviderDriverKind.make("codex"),
      enabled: true,
      installed: true,
      version: null,
      status: "ready",
      auth: { status: "authenticated" },
      checkedAt: "2026-01-01T00:00:00.000Z",
      models: [],
      slashCommands: [],
      skills: [],
    },
  ]);
  const models = Array.from({ length: 20 }, (_, index) => ({
    slug: `model-${index}`,
    name: `Model ${index}`,
  }));

  await using screen = await render(
    <div style={{ position: "fixed", left: 16, bottom: 16 }}>
      <ProviderModelPicker
        environmentId={null}
        activeInstanceId={instanceId}
        model="model-0"
        lockedProvider={null}
        instanceEntries={entries}
        modelOptionsByInstance={new Map([[instanceId, models]])}
        triggerAriaLabel="Choose model"
        onInstanceModelChange={() => {}}
        // The reasoning section's shape: rows at their own height above a footer.
        effortColumn={
          <div className="flex shrink-0 flex-col">
            {["Low", "Medium", "High", "Extra high"].map((level) => (
              <button key={level} type="button" className="h-8 shrink-0">
                {level}
              </button>
            ))}
            <button type="button" role="switch" aria-checked="false" className="h-8 shrink-0">
              Fast mode
            </button>
          </div>
        }
        footer={
          <button type="button" className="h-16 shrink-0">
            Permissions
          </button>
        }
      />
    </div>,
  );
  const trigger = screen.getByRole("button", { name: "Choose model" });
  await trigger.click();
  const fastMode = page.getByRole("switch", { name: "Fast mode" });
  const hitsCentre = (element: Element) => {
    const box = element.getBoundingClientRect();
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === element;
  };
  // On a phone, the panel shows every reasoning row above its footer.
  await vi.waitFor(() => expect(hitsCentre(fastMode.element())).toBe(true));

  const cardsAboveTrigger = () => {
    const triggerTop = trigger.element().getBoundingClientRect().top;
    return Array.from(document.querySelectorAll("[data-model-picker-card]"), (card) => {
      const box = card.getBoundingClientRect();
      return box.bottom <= triggerTop && box.right <= window.innerWidth;
    });
  };
  await vi.waitFor(() => expect(cardsAboveTrigger()).toEqual([true]));
  // Filtering the list keeps the panel above the trigger at either width.
  await userEvent.keyboard("Model 13");
  await vi.waitFor(() => expect(page.getByRole("option").elements()).toHaveLength(1));
  await vi.waitFor(() => expect(cardsAboveTrigger()).toEqual([true]));
  await page.viewport(900, 700);
  await vi.waitFor(() => expect(cardsAboveTrigger()).toEqual([true]));
  await expect.element(fastMode).toBeVisible();

  // Too short for the reasoning rows and the footer under the list's minimum, the panel scrolls
  // to the footer.
  await page.viewport(900, 260);
  const permissions = page.getByRole("button", { name: "Permissions" });
  await vi.waitFor(() => expect(hitsCentre(permissions.element())).toBe(false));
  await userEvent.wheel(page.getByRole("button", { name: "Low" }), { direction: "down", times: 5 });
  await vi.waitFor(() => expect(hitsCentre(permissions.element())).toBe(true));
});
