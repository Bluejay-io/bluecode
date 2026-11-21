import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderOptionSelection,
  type RuntimeMode,
  type ServerProviderModel,
} from "@t3tools/contracts";
import { createModelCapabilities } from "@t3tools/shared/model";
import { useState } from "react";
import { expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../test/render";
import { DockedPickerContext } from "../components/chat/ProviderModelPicker";
import { resolveRuntimeModeOption, runtimeModeOptions } from "../components/chat/runtimeModeConfig";
import { MODEL_CARD_CONTROLS_FALLBACK } from "./DockedModelPicker";
import { ModelCard } from "./ModelCard";

// Shaped like Devin over ACP: its session mode comes first, and its reasoning id is its own.
const models: ReadonlyArray<ServerProviderModel> = [
  {
    slug: "fusion",
    name: "Fusion",
    isCustom: false,
    capabilities: createModelCapabilities({
      optionDescriptors: [
        {
          id: "mode",
          label: "Session Mode",
          type: "select",
          currentValue: "bypass",
          options: [
            { id: "code", label: "Code" },
            { id: "bypass", label: "Bypass Permissions" },
          ],
        },
        {
          id: "thought_level",
          label: "Thinking",
          type: "select",
          role: "reasoning",
          currentValue: "low",
          options: ["low", "medium", "high", "xhigh", "max"].map((id) => ({ id, label: id })),
        },
        { id: "auto_approve", label: "Auto-approve tools", type: "boolean", currentValue: false },
      ],
    }),
  },
];

const permissionOptions = runtimeModeOptions.map((mode) => resolveRuntimeModeOption(mode));

function Card() {
  const [options, setOptions] = useState<ReadonlyArray<ProviderOptionSelection>>([]);
  const [mode, setMode] = useState<RuntimeMode>("approval-required");
  return (
    <DockedPickerContext value={{ ...MODEL_CARD_CONTROLS_FALLBACK, modelLabel: "Fusion" }}>
      <ModelCard
        traits={{
          provider: ProviderDriverKind.make("acpRegistry"),
          instanceId: ProviderInstanceId.make("devin"),
          models,
          model: "fusion",
          modelOptions: options,
          onModelOptionsChange: (next) => setOptions(next ?? []),
        }}
        permissions={{
          runtimeMode: mode,
          runtimeModeOptions: permissionOptions,
          onRuntimeModeChange: setMode,
          showPermissions: true,
        }}
      />
      <p role="status">{mode}</p>
    </DockedPickerContext>
  );
}

it("moves through the reasoning section and permissions from the keyboard", async () => {
  await using screen = await render(<Card />, { router: false }); // no routes involved

  // The slider comes first: reset holds no tab stop until something changed.
  await expect.element(screen.getByText("Reasoning · low")).toBeVisible();
  await userEvent.tab();
  const levels = screen.getByRole("slider", { name: "Thinking" });
  await expect.element(levels).toHaveFocus();
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(levels).toHaveAttribute("aria-valuetext", "medium");
  await expect.element(screen.getByText("Reasoning · medium")).toBeVisible();
  await userEvent.keyboard("{PageUp}");
  await expect.element(levels).toHaveAttribute("aria-valuetext", "xhigh");
  await userEvent.keyboard("{PageDown}{Home}");
  await expect.element(levels).toHaveAttribute("aria-valuetext", "low");
  await userEvent.keyboard("{End}");
  await expect.element(levels).toHaveAttribute("aria-valuetext", "max");

  // The options are always shown, one tab stop; Up and Down walk them without opening menus.
  await userEvent.tab();
  await expect
    .element(screen.getByRole("button", { name: "Session Mode: Bypass Permissions" }))
    .toHaveFocus();
  await userEvent.keyboard("{ArrowDown}");
  await expect.element(screen.getByRole("switch", { name: "Auto-approve tools" })).toHaveFocus();
  await expect.element(page.getByRole("menuitemradio")).not.toBeInTheDocument();

  // The permission modes are one tab stop. Arrows only move focus, so arrowing onto Full access
  // keeps the mode; Enter picks.
  await userEvent.tab();
  await expect.element(screen.getByRole("radio", { name: "Supervised" })).toHaveFocus();
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(screen.getByRole("radio", { name: "Auto-accept edits" })).toHaveFocus();
  await userEvent.keyboard("{End}");
  const fullAccess = screen.getByRole("radio", { name: "Full access" });
  await expect.element(fullAccess).toHaveFocus();
  await expect.element(screen.getByRole("status")).toHaveTextContent("approval-required");
  await expect.element(fullAccess).toHaveAttribute("aria-checked", "false");
  await userEvent.keyboard("{ArrowLeft}");
  await expect.element(screen.getByRole("radio", { name: "Auto", exact: true })).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await expect.element(screen.getByRole("status")).toHaveTextContent("auto");
  await expect
    .element(screen.getByRole("radio", { name: "Auto", exact: true }))
    .toHaveAttribute("aria-checked", "true");
});

it("gives the effort shortcut to the first option when the model has no slider", async () => {
  const sessionModeOnly: ReadonlyArray<ServerProviderModel> = [
    {
      slug: "swe",
      name: "SWE",
      isCustom: false,
      capabilities: createModelCapabilities({
        optionDescriptors: [models[0]!.capabilities!.optionDescriptors![0]!],
      }),
    },
  ];
  const effortTargets: Array<HTMLElement | null> = [];
  await using screen = await render(
    <DockedPickerContext
      value={{
        ...MODEL_CARD_CONTROLS_FALLBACK,
        modelLabel: "SWE",
        effortFocusRef: (node) => effortTargets.push(node),
      }}
    >
      <ModelCard
        traits={{
          provider: ProviderDriverKind.make("acpRegistry"),
          instanceId: ProviderInstanceId.make("devin"),
          models: sessionModeOnly,
          model: "swe",
          modelOptions: [],
          onModelOptionsChange: () => {},
        }}
      />
    </DockedPickerContext>,
    { router: false }, // no routes involved
  );
  const sessionMode = screen.getByRole("button", { name: "Session Mode: Bypass Permissions" });
  await expect.element(sessionMode).toBeVisible();
  expect(effortTargets.at(-1)).toBe(sessionMode.element());
});

it("gives the effort shortcut to the chosen speed when speed is the model's only option", async () => {
  const speedOnly: ReadonlyArray<ServerProviderModel> = [
    {
      slug: "swift",
      name: "Swift",
      isCustom: false,
      capabilities: createModelCapabilities({
        optionDescriptors: [
          {
            id: "serviceTier",
            label: "Speed",
            type: "select",
            currentValue: "fast",
            options: [
              { id: "standard", label: "Standard" },
              { id: "fast", label: "Fast" },
              { id: "flex", label: "Flex" },
            ],
          },
        ],
      }),
    },
  ];
  const effortTargets: Array<HTMLElement | null> = [];
  await using screen = await render(
    <DockedPickerContext
      value={{
        ...MODEL_CARD_CONTROLS_FALLBACK,
        modelLabel: "Swift",
        effortFocusRef: (node) => effortTargets.push(node),
      }}
    >
      <ModelCard
        traits={{
          provider: ProviderDriverKind.make("acpRegistry"),
          instanceId: ProviderInstanceId.make("swift"),
          models: speedOnly,
          model: "swift",
          modelOptions: [],
          onModelOptionsChange: () => {},
        }}
      />
    </DockedPickerContext>,
    { router: false }, // no routes involved
  );
  const fast = screen.getByRole("radio", { name: "Fast" });
  await expect.element(fast).toBeVisible();
  expect(effortTargets.at(-1)).toBe(fast.element());
});
