import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultWorkspace } from "../../state/workspace";
import { SettingsView } from "./OperationalViews";

afterEach(cleanup);

describe("SettingsView", () => {
  it("requires explicit consent before showing NSFW configuration", () => {
    const settings = createDefaultWorkspace().settings;
    const onChange = vi.fn();
    const { rerender } = render(
      <SettingsView
        settings={settings}
        health={{ online: true, latencyMs: 1 }}
        system={null}
        models={[]}
        onChange={onChange}
        onCheckRuntime={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Generation/ }));
    expect(
      screen.queryByLabelText("Browse NSFW segmentation models"),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Allow NSFW content" }),
    );
    expect(onChange).toHaveBeenCalledWith({ nsfwConsent: true });

    rerender(
      <SettingsView
        settings={{ ...settings, nsfwConsent: true }}
        health={{ online: true, latencyMs: 1 }}
        system={null}
        models={[]}
        onChange={onChange}
        onCheckRuntime={vi.fn()}
      />,
    );
    expect(
      screen.getByLabelText("Browse NSFW segmentation models"),
    ).toBeVisible();
  });
});
