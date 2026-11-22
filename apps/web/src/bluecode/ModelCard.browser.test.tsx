import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderOptionSelection,
  type ServerProviderModel,
} from "@t3tools/contracts";
import { createModelCapabilities } from "@t3tools/shared/model";
import { useState } from "react";
import { expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { render } from "../../test/render";
import { DockedPickerContext } from "../components/chat/ProviderModelPicker";
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
            { id: "plan", label: "Plan first, then ask before editing outside the workspace" },
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

function Card(props: { width: number; options?: ReadonlyArray<ProviderOptionSelection> }) {
  const [options, setOptions] = useState(props.options ?? []);
  return (
    <DockedPickerContext value={{ ...MODEL_CARD_CONTROLS_FALLBACK, modelLabel: "Fusion" }}>
      <div style={{ width: props.width }}>
        <ModelCard
          traits={{
            provider: ProviderDriverKind.make("acpRegistry"),
            instanceId: ProviderInstanceId.make("devin"),
            models,
            model: "fusion",
            modelOptions: options,
            onModelOptionsChange: (next) => setOptions(next ?? []),
          }}
        />
      </div>
    </DockedPickerContext>
  );
}

it("picks a level and toggles an option from the chips by keyboard", async () => {
  await using screen = await render(<Card width={600} />, { router: false }); // no routes involved

  // Effort comes first; Enter opens its levels on the current one.
  await userEvent.tab();
  await expect.element(screen.getByRole("button", { name: "Reasoning effort: low" })).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await expect.element(page.getByRole("menuitemradio", { name: "low" })).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}{Enter}");
  await expect
    .element(screen.getByRole("button", { name: "Reasoning effort: medium" }))
    .toHaveFocus();
  await expect.element(page.getByRole("menuitemradio")).not.toBeInTheDocument();

  // Escape closes a chip's menu back to the chip.
  await userEvent.keyboard("{Enter}");
  await expect.element(page.getByRole("menuitemradio", { name: "medium" })).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await expect
    .element(screen.getByRole("button", { name: "Reasoning effort: medium" }))
    .toHaveFocus();

  // Every chip is a tab stop; Space toggles a two-state option.
  await userEvent.tab();
  await expect
    .element(screen.getByRole("button", { name: "Session Mode: Bypass Permissions" }))
    .toHaveFocus();
  await userEvent.tab();
  const autoApprove = screen.getByRole("button", { name: "Auto-approve tools" });
  await expect.element(autoApprove).toHaveFocus();
  await expect.element(autoApprove).toHaveAttribute("aria-pressed", "false");
  await userEvent.keyboard(" ");
  await expect.element(autoApprove).toHaveAttribute("aria-pressed", "true");
});

it("keeps keyboard focus when a chip moves behind the more chip and back", async () => {
  // Session Mode fits as "Code" and moves behind "⋯" as "Bypass Permissions".
  await using screen = await render(
    <Card width={300} options={[{ id: "mode", value: "code" }]} />,
    { router: false }, // no routes involved
  );
  await userEvent.tab();
  await userEvent.tab();
  await expect.element(screen.getByRole("button", { name: "Session Mode: Code" })).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await expect.element(page.getByRole("menuitemradio", { name: "Code" })).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}{Enter}");
  await expect.element(page.getByRole("menuitemradio")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: /^Session Mode/ }))
    .not.toBeInTheDocument();
  await expect.element(screen.getByRole("button", { name: "More options" })).toHaveFocus();

  // Once every chip fits, "⋯" goes and focus lands on the first chip that was behind it.
  await screen.rerender(<Card width={900} options={[{ id: "mode", value: "code" }]} />);
  await expect
    .element(screen.getByRole("button", { name: "Session Mode: Bypass Permissions" }))
    .toHaveFocus();
});

it("moves the chips that do not fit behind a more menu, as label and value rows", async () => {
  const plan = "Plan first, then ask before editing outside the workspace";
  await using screen = await render(
    <Card width={260} options={[{ id: "mode", value: "plan" }]} />,
    { router: false }, // no routes involved
  );

  await expect.element(screen.getByRole("button", { name: "Reasoning effort: low" })).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: `Session Mode: ${plan}` }))
    .not.toBeInTheDocument();
  await screen.getByRole("button", { name: "More options" }).click();
  const row = page.getByRole("menuitem", { name: new RegExp(`^Session Mode\\s*${plan}$`) });
  await expect.element(row).toBeVisible();
  // At phone width a long value truncates (its full text stays in the name above); the name and
  // the submenu chevron keep their room.
  const [name, value] = Array.from(row.element().children) as HTMLElement[];
  expect(name!.scrollWidth).toBeLessThanOrEqual(name!.clientWidth);
  expect(value!.scrollWidth).toBeGreaterThan(value!.clientWidth);
  const chevron = row.element().querySelector("svg:last-child")!.getBoundingClientRect();
  expect(chevron.right).toBeLessThanOrEqual(row.element().getBoundingClientRect().right);
  const autoApprove = page.getByRole("menuitemcheckbox", { name: "Auto-approve tools" });
  await expect.element(autoApprove).toHaveAttribute("aria-checked", "false");
  await autoApprove.click();
  await expect.element(autoApprove).toHaveAttribute("aria-checked", "true");
});

it("gives the effort shortcut to the first chip when the model has no levels", async () => {
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

it("gives the effort shortcut to the next chip while ultrathink locks the levels", async () => {
  const claudeLike: ReadonlyArray<ServerProviderModel> = [
    {
      slug: "opus",
      name: "Opus",
      isCustom: false,
      capabilities: createModelCapabilities({
        optionDescriptors: [
          {
            id: "effort",
            label: "Effort",
            type: "select",
            role: "reasoning",
            currentValue: "high",
            promptInjectedValues: ["ultrathink"],
            options: ["low", "high", "ultrathink"].map((id) => ({ id, label: id })),
          },
          models[0]!.capabilities!.optionDescriptors![2]!,
        ],
      }),
    },
  ];
  const effortTargets: Array<HTMLElement | null> = [];
  await using screen = await render(
    <DockedPickerContext
      value={{
        ...MODEL_CARD_CONTROLS_FALLBACK,
        modelLabel: "Opus",
        effortFocusRef: (node) => effortTargets.push(node),
      }}
    >
      <ModelCard
        traits={{
          provider: ProviderDriverKind.make("claudeAgent"),
          instanceId: ProviderInstanceId.make("claudeAgent"),
          models: claudeLike,
          model: "opus",
          modelOptions: [],
          promptUltrathink: "body",
          onModelOptionsChange: () => {},
        }}
      />
    </DockedPickerContext>,
    { router: false }, // no routes involved
  );
  await expect.element(screen.getByRole("button", { name: /^Reasoning effort/ })).toBeDisabled();
  expect(effortTargets.at(-1)).toBe(
    screen.getByRole("button", { name: "Auto-approve tools" }).element(),
  );
});
