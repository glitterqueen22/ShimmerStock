import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EmptyState } from "../client/src/components/ui/EmptyState";

describe("EmptyState action rendering", () => {
  it("renders React element actions", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        title="Title"
        description="Description"
        action={<a href="/go">Go now</a>}
      />
    );

    expect(html).toContain("<a href=\"/go\">Go now</a>");
  });

  it("renders object action shape as button", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        title="Title"
        description="Description"
        action={{ label: "Create", onClick: () => {} }}
      />
    );

    expect(html).toContain("Create");
    expect(html).toContain("<button");
  });

  it("renders string and number ReactNode actions", () => {
    const stringHtml = renderToStaticMarkup(
      <EmptyState
        title="Title"
        description="Description"
        action={"Learn more"}
      />
    );
    const numberHtml = renderToStaticMarkup(
      <EmptyState
        title="Title"
        description="Description"
        action={7}
      />
    );

    expect(stringHtml).toContain("Learn more");
    expect(numberHtml).toContain(">7<");
  });

  it("does not render action for null or undefined", () => {
    const nullHtml = renderToStaticMarkup(
      <EmptyState
        title="Title"
        description="Description"
        action={null}
      />
    );
    const undefinedHtml = renderToStaticMarkup(
      <EmptyState
        title="Title"
        description="Description"
        action={undefined}
      />
    );

    expect(nullHtml).not.toContain("<button");
    expect(undefinedHtml).not.toContain("<button");
  });
});
