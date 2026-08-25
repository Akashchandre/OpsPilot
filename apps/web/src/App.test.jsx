import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App.jsx";

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading and then the healthy foundation state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { status: "ok" } }),
      }),
    );

    render(<App />);

    expect(screen.getByText("Checking the platform foundation…")).toBeInTheDocument();
    expect(await screen.findByText("Foundation ready")).toBeInTheDocument();
    expect(screen.getByText("Frontend, API, and database are connected.")).toBeInTheDocument();
  });

  it("shows a safe unavailable state when the API fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network failed")));

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByText("The platform foundation is currently unavailable."),
      ).toBeInTheDocument();
    });
  });

  it("treats a malformed success payload as unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: {} }) }),
    );

    render(<App />);

    expect(
      await screen.findByText("The platform foundation is currently unavailable."),
    ).toBeInTheDocument();
  });
});
