import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "bun:test";
import { Tabs } from "../client/src/components/ui/Tabs";

describe("Tabs default active behavior", () => {
  it("activates the first tab when no active prop and no tab IDs are provided", () => {
    const html = renderToStaticMarkup(
      React.createElement(Tabs, {
        tabs: [{ label: "First" }, { label: "Second" }],
      })
    );

    const buttonClasses = [...html.matchAll(/<button[^>]*class="([^"]*)"/g)].map(
      (match) => match[1]
    );

    expect(buttonClasses.length).toBe(2);
    expect(buttonClasses[0]).toContain("bg-white text-rose-600 shadow-sm");
    expect(buttonClasses[1]).not.toContain("bg-white text-rose-600 shadow-sm");
  });
});
