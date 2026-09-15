import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { NavigationMenu } from "./NavigationMenu.jsx";

afterEach(cleanup);

function MenuFixture({ menuKey = "/dashboard" }) {
  return (
    <>
      <NavigationMenu key={menuKey} label="Operations" active={false}>
        <a href="/admin/catalog" onClick={(event) => event.preventDefault()}>
          Catalog
        </a>
      </NavigationMenu>
      <button type="button">Outside action</button>
    </>
  );
}

describe("NavigationMenu", () => {
  it("closes when the user clicks outside it", async () => {
    const browser = userEvent.setup();
    render(<MenuFixture />);
    const trigger = screen.getByText("Operations").closest("summary");
    const menu = trigger.closest("details");

    await browser.click(trigger);
    expect(menu).toHaveAttribute("open");

    await browser.click(screen.getByRole("button", { name: "Outside action" }));
    expect(menu).not.toHaveAttribute("open");
  });

  it("closes on Escape and returns focus to its trigger", async () => {
    const browser = userEvent.setup();
    render(<MenuFixture />);
    const trigger = screen.getByText("Operations").closest("summary");
    const menu = trigger.closest("details");

    await browser.click(trigger);
    await browser.keyboard("{Escape}");

    expect(menu).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();
  });

  it("closes after a menu item is selected or navigation changes", async () => {
    const browser = userEvent.setup();
    const view = render(<MenuFixture />);
    const trigger = screen.getByText("Operations").closest("summary");
    const menu = trigger.closest("details");

    await browser.click(trigger);
    await browser.click(screen.getByRole("link", { name: "Catalog" }));
    expect(menu).not.toHaveAttribute("open");

    await browser.click(trigger);
    view.rerender(<MenuFixture menuKey="/admin/catalog" />);
    await waitFor(() =>
      expect(screen.getByText("Operations").closest("details")).not.toHaveAttribute("open"),
    );
  });
});
