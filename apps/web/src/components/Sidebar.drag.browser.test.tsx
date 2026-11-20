import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../test/render";
import { makeThreadFixture } from "../test-fixtures";
import { SidebarSearchResultRow } from "./sidebar/SidebarThreadRow";

it("keeps focus in the search box when a click picks a search result", async () => {
  const onSelect = vi.fn();
  await using screen = await render(
    <>
      <input aria-label="Search threads" />
      <ul role="listbox">
        <SidebarSearchResultRow
          isSettled={false}
          thread={makeThreadFixture({ title: "Invoice export" })}
          project={null}
          projectDisplayName={null}
          environmentLabel={null}
          environmentMachine="server"
          providerEntryByInstanceId={new Map()}
          isHighlighted={false}
          isRouteActive={false}
          resultId="result-0"
          searchMatch={null}
          searchQuery="invoice"
          onHighlight={() => {}}
          onSelect={onSelect}
          onContextMenu={() => {}}
          onFileDropThreads={() => {}}
        />
      </ul>
    </>,
  );
  const search = screen.getByRole("textbox", { name: "Search threads" });
  await userEvent.click(search);
  await userEvent.click(screen.getByRole("option"));
  expect(onSelect).toHaveBeenCalledOnce();
  // Picking clears the results; a focused result would drop focus, and its recovery scrolls the list.
  await expect.element(search).toHaveFocus();
});
