import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { InlineMarkdown } from "@/components/common/InlineMarkdown";

describe("InlineMarkdown (mentor replies)", () => {
  it("renders bold, headings, numbered lists and bullets instead of showing the symbols", () => {
    const { container } = render(
      <InlineMarkdown
        text={"### Types of pointers:\n1. **Opposite ends**: start at both ends.\n2. **Same direction**: both start left.\n\n- first\n- second"}
      />
    );
    expect(container.textContent).not.toContain("**");
    expect(container.textContent).not.toContain("###");
    expect(screen.getByText("Types of pointers:")).toHaveClass("font-semibold");
    expect(container.querySelectorAll("ol > li")).toHaveLength(2);
    expect(container.querySelectorAll("ul > li")).toHaveLength(2);
    expect(screen.getByText("Opposite ends").tagName).toBe("STRONG");
  });

  it("shows dollar-sign math as code rather than raw dollar signs", () => {
    render(<InlineMarkdown text={"It is $O(N)$ time instead of $O(N^2)$."} />);
    expect(screen.getByText("O(N)").tagName).toBe("CODE");
    expect(screen.getByText("O(N^2)").tagName).toBe("CODE");
  });

  it("keeps inline code, italics, and a plain price-like dollar sign", () => {
    const { container } = render(<InlineMarkdown text={"Use `left = 0` and *carefully*. It costs 5 dollars, $5 maybe."} />);
    expect(screen.getByText("left = 0").tagName).toBe("CODE");
    expect(screen.getByText("carefully").tagName).toBe("EM");
    expect(container.textContent).toContain("$5 maybe");
  });

  it("never turns text into HTML", () => {
    const { container } = render(<InlineMarkdown text={"<img src=x onerror=alert(1)> **ok**"} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img");
  });
});
