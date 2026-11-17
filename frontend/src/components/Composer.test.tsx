import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "./Composer";

describe("Composer", () => {
  it("cannot send an empty or blank message", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Composer disabled={false} onSend={onSend} />);

    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();
    await user.type(screen.getByRole("textbox"), "   ");
    expect(send).toBeDisabled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends the message and clears the box", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Composer disabled={false} onSend={onSend} />);

    await user.type(screen.getByRole("textbox"), "Which hubs flood most?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith("Which hubs flood most?");
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("sends on Enter with a keyboard, but Shift+Enter adds a new line", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Composer disabled={false} onSend={onSend} />);

    await user.type(screen.getByRole("textbox"), "line one{Shift>}{Enter}{/Shift}line two");
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("line one\nline two");

    await user.type(screen.getByRole("textbox"), "{Enter}");
    expect(onSend).toHaveBeenCalledWith("line one\nline two");
  });

  it("does not send on Enter on a phone, where Return adds a new line", async () => {
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Composer disabled={false} onSend={onSend} />);

    await user.type(screen.getByRole("textbox"), "hello{Enter}");
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("hello\n");
  });

  it("is disabled while an answer is being prepared", () => {
    render(<Composer disabled onSend={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("limits the message to 1000 characters and shows a counter near the limit", async () => {
    const user = userEvent.setup();
    render(<Composer disabled={false} onSend={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("maxlength", "1000");
    expect(screen.queryByText(/\/ 1000/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("textbox"));
    await user.paste("x".repeat(850));
    expect(screen.getByText("850 / 1000")).toBeInTheDocument();
  });

  it("comes in a large hero size for an empty chat and a slim compact size under a conversation", () => {
    const { rerender } = render(<Composer variant="hero" disabled={false} onSend={vi.fn()} />);
    const hero = screen.getByRole("textbox");
    expect(hero).toHaveAttribute("data-variant", "hero");
    expect(hero).toHaveAttribute("rows", "3");
    expect(hero.className).toContain("min-h-24"); // 96 px, more than twice the compact bar

    rerender(<Composer variant="compact" disabled={false} onSend={vi.fn()} />);
    const compact = screen.getByRole("textbox");
    expect(compact).toHaveAttribute("data-variant", "compact");
    expect(compact.className).toContain("min-h-11"); // 44 px
  });

  it("follows the same rules in the hero size: blank cannot be sent, a message sends and clears", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Composer variant="hero" disabled={false} onSend={onSend} />);

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.type(screen.getByRole("textbox"), "Which hubs should we prioritize?{Enter}");
    expect(onSend).toHaveBeenCalledWith("Which hubs should we prioritize?");
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("keeps the send button at least 44 px in the hero size", () => {
    render(<Composer variant="hero" disabled={false} onSend={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Send" }).className).toMatch(/\bsize-12\b/);
  });

  it("shows the character counter near the limit in the hero size too", async () => {
    const user = userEvent.setup();
    render(<Composer variant="hero" disabled={false} onSend={vi.fn()} />);
    await user.click(screen.getByRole("textbox"));
    await user.paste("x".repeat(900));
    expect(screen.getByText("900 / 1000")).toBeInTheDocument();
  });

  it("exposes its text box so another screen can focus it", () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Composer disabled={false} onSend={vi.fn()} textareaRef={ref} />);
    expect(ref.current).toBe(screen.getByRole("textbox"));
  });

  it("uses a 16 px or larger font so iPhone Safari does not zoom in", () => {
    render(<Composer disabled={false} onSend={vi.fn()} />);
    const classes = screen.getByRole("textbox").className;
    expect(classes).toContain("text-base");
    expect(classes).not.toMatch(/\btext-(xs|sm)\b/);
  });
});
