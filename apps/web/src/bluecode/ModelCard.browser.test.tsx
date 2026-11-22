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

function Card(props: { width: number }) {
  const [options, setOptions] = useState<ReadonlyArray<ProviderOptionSelection>>([]);
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

it("moves the chips that do not fit behind a more menu, as label and value rows", async () => {
  await using screen = await render(<Card width={260} />, { router: false }); // no routes involved

  await expect.element(screen.getByRole("button", { name: "Reasoning effort: low" })).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Session Mode: Bypass Permissions" }))
    .not.toBeInTheDocument();
  await screen.getByRole("button", { name: "More options" }).click();
  await expect
    .element(page.getByRole("menuitem", { name: /Session Mode\s*Bypass Permissions/ }))
    .toBeVisible();
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
