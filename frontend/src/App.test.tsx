import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { makeAnswer, RANKING, stubApi } from "@/test/fixtures";
import App from "./App";

const CONVERSATION_ID = "11111111-2222-4333-8444-555555555555";
const STORAGE_KEY = "weatherhub.conversationId";
const STARTER = "Which hubs in the Midwest are most exposed to winter disruption?";

const ranking = { "/ranking": () => ({ body: RANKING }) };
const chatReply = (text: string) => () => ({ body: { conversation_id: CONVERSATION_ID, answer: makeAnswer({ answer: text }) } });

describe("Overview", () => {
  it("ranks the hubs and shows each one's main hazard", async () => {
    stubApi(ranking);
    render(<App />);

    expect(await screen.findByRole("button", { name: /Chicago, rank 1/ })).toBeInTheDocument();
    expect(screen.getByText(/Main: Wind/)).toBeInTheDocument();
    expect(screen.getByText(/Main: Flood/)).toBeInTheDocument();
    expect(screen.getByText(/No notable hazard/)).toBeInTheDocument();
    expect(screen.getByText(/Weather history 2025-11-13 – 2026-11-12/)).toBeInTheDocument();
    expect(screen.getByText(/not forecasts, cost estimates or investment advice/)).toBeInTheDocument();
  });

  it("ranks by one hazard when a filter is chosen", async () => {
    const user = userEvent.setup();
    const calls = stubApi(ranking);
    render(<App />);
    await screen.findByRole("button", { name: /Chicago/ });

    await user.click(screen.getByRole("radio", { name: "Flood" }));
    await waitFor(() => expect(calls.map((call) => call.path)).toContain("/ranking?hazard=flood"));
  });

  it("explains a loading failure in plain words and can try again", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    stubApi({
      "/ranking": () => (++attempts === 1 ? { status: 503, body: { error: "x", code: "data_loading" } } : { body: RANKING }),
    });
    render(<App />);

    expect(await screen.findByText(/weather data is still loading/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: /Chicago, rank 1/ })).toBeInTheDocument();
  });
});

describe("The agent is easy to find", () => {
  it("shows an Ask the agent bar on the Overview that opens the chat with the input ready, and sends nothing", async () => {
    const user = userEvent.setup();
    const calls = stubApi(ranking);
    render(<App />);
    await screen.findByRole("button", { name: /Chicago, rank 1/ });

    await user.click(screen.getByRole("button", { name: "Ask the agent a question" }));

    expect(screen.getByRole("button", { name: "Ask" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("textbox")).toHaveFocus();
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(calls.some((call) => call.path === "/chat")).toBe(false); // opening the chat costs nothing
  });

  it("hides the Ask bar on wide screens, where the chat already sits beside the Overview", async () => {
    stubApi(ranking);
    render(<App />);
    expect(screen.getByRole("button", { name: "Ask the agent a question" }).className).toContain("lg:hidden");
  });

  it("says to wait, instead of silently dropping it, when a hub is tapped while an answer is coming", async () => {
    const user = userEvent.setup();
    const calls = stubApi({ ...ranking, "/chat": () => new Promise(() => {}) }); // never answers
    render(<App />);

    await user.click(screen.getByRole("button", { name: STARTER }));
    await user.click(await screen.findByRole("button", { name: /Chicago, rank 1/ }));

    expect(await screen.findByText("Wait for the current answer, then ask about this hub.")).toBeInTheDocument();
    expect(calls.filter((call) => call.path === "/chat")).toHaveLength(1);
  });

  it("keeps the empty chat minimal: app name, slogan, one greeting, the input and two examples", async () => {
    stubApi(ranking);
    render(<App />);

    expect(screen.getByRole("heading", { name: "WeatherHub" })).toBeInTheDocument();
    expect(screen.getByText("Prioritize hub resilience before the storm hits.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hey, how can we help you today?" })).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", "Ask anything about weather risk, for example which hubs to prioritize…");
    const chat = screen.getByRole("region", { name: "Chat with the agent" });
    expect(within(chat).getAllByRole("button", { name: /\?$|\.$/ })).toHaveLength(2);
  });

  it("makes the input the main thing on an empty chat, then shrinks it once the conversation starts", async () => {
    const user = userEvent.setup();
    stubApi({ ...ranking, "/chat": chatReply("A first answer.") });
    render(<App />);

    expect(screen.getByRole("textbox")).toHaveAttribute("data-variant", "hero");

    await user.click(screen.getByRole("button", { name: STARTER }));
    await screen.findByText("A first answer.");
    expect(screen.getByRole("textbox")).toHaveAttribute("data-variant", "compact");

    await user.click(screen.getByRole("button", { name: "New chat" }));
    expect(screen.getByRole("textbox")).toHaveAttribute("data-variant", "hero");
  });

  it("sends a question typed into the large input", async () => {
    const user = userEvent.setup();
    const calls = stubApi({ ...ranking, "/chat": chatReply("Typed answer.") });
    render(<App />);

    await user.type(screen.getByRole("textbox"), "Which hubs should we prioritize?{Enter}");
    expect(await screen.findByText("Typed answer.")).toBeInTheDocument();
    expect(calls.find((call) => call.path === "/chat")?.body).toEqual({ message: "Which hubs should we prioritize?" });
  });

  it("never shows two inputs at once", async () => {
    const user = userEvent.setup();
    stubApi({ ...ranking, "/chat": chatReply("Answer.") });
    render(<App />);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: STARTER }));
    await screen.findByText("Answer.");
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });
});

describe("Chat", () => {
  it("opens the chat and asks why when a hub is tapped", async () => {
    const user = userEvent.setup();
    const calls = stubApi({ ...ranking, "/chat": chatReply("Chicago is driven by wind.") });
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Chicago, rank 1/ }));

    expect(await screen.findByText("Chicago is driven by wind.")).toBeInTheDocument();
    expect(calls.find((call) => call.path === "/chat")?.body).toEqual({ message: "Why is Chicago's weather risk score what it is?" });
    expect(screen.getByRole("button", { name: "Ask" })).toHaveAttribute("aria-current", "page");
    expect(localStorage.getItem(STORAGE_KEY)).toBe(CONVERSATION_ID);
  });

  it("names the hazard in the question when a hazard filter is active", async () => {
    const user = userEvent.setup();
    const calls = stubApi({ ...ranking, "/chat": chatReply("ok") });
    render(<App />);
    await screen.findByRole("button", { name: /Chicago/ });

    await user.click(screen.getByRole("radio", { name: "Flood" }));
    await user.click(await screen.findByRole("button", { name: /Chicago/ }));
    await screen.findByText("ok");
    expect(calls.find((call) => call.path === "/chat")?.body.message).toBe("Why is Chicago's flood risk score what it is?");
  });

  it("sends a starter question straight away", async () => {
    const user = userEvent.setup();
    const calls = stubApi({ ...ranking, "/chat": chatReply("Minneapolis leads.") });
    render(<App />);

    await user.click(screen.getByRole("button", { name: STARTER }));
    expect(await screen.findByText("Minneapolis leads.")).toBeInTheDocument();
    expect(calls.find((call) => call.path === "/chat")?.body.message).toBe(STARTER);
    expect(screen.getByText(STARTER, { selector: "div" })).toBeInTheDocument(); // the user's own bubble
  });

  it("keeps a follow-up question in the same conversation", async () => {
    const user = userEvent.setup();
    const calls = stubApi({ ...ranking, "/chat": chatReply("An answer.") });
    render(<App />);

    await user.click(screen.getByRole("button", { name: STARTER }));
    await screen.findByText("An answer.");
    await user.type(screen.getByRole("textbox"), "What about flood?{Enter}");
    await waitFor(() => expect(calls.filter((call) => call.path === "/chat")).toHaveLength(2));

    const [first, second] = calls.filter((call) => call.path === "/chat");
    expect(first.body.conversation_id).toBeUndefined();
    expect(second.body).toEqual({ message: "What about flood?", conversation_id: CONVERSATION_ID });
  });

  it("shows a friendly error and retries the same question", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const calls = stubApi({
      ...ranking,
      "/chat": () => (++attempts === 1 ? { status: 503, body: { error: "x", code: "ai_busy" } } : { body: { conversation_id: CONVERSATION_ID, answer: makeAnswer({ answer: "Second try worked." }) } }),
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: STARTER }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/AI service is busy/);
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Second try worked.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(calls.filter((call) => call.path === "/chat").map((call) => call.body.message)).toEqual([STARTER, STARTER]);
  });

  it("does not offer a retry when the daily limit is reached", async () => {
    const user = userEvent.setup();
    stubApi({ ...ranking, "/chat": () => ({ status: 429, body: { error: "x", code: "daily_limit_reached" } }) });
    render(<App />);

    await user.click(screen.getByRole("button", { name: STARTER }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/daily question limit/);
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("restores the earlier conversation after a reload", async () => {
    localStorage.setItem(STORAGE_KEY, CONVERSATION_ID);
    stubApi({
      ...ranking,
      "/conversations/": () => ({
        body: { conversation_id: CONVERSATION_ID, turns: [{ user_message: "Earlier question", answer: makeAnswer({ answer: "Earlier answer." }), created_at: "2026-11-17T00:00:00Z" }] },
      }),
    });
    render(<App />);

    expect(await screen.findByText("Earlier answer.")).toBeInTheDocument();
    expect(screen.getByText("Earlier question")).toBeInTheDocument();
  });

  it("forgets a conversation the server no longer has", async () => {
    localStorage.setItem(STORAGE_KEY, CONVERSATION_ID);
    stubApi({ ...ranking, "/conversations/": () => ({ status: 404, body: { error: "x", code: "not_found" } }) });
    render(<App />);

    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBeNull());
    expect(await screen.findByRole("button", { name: STARTER })).toBeInTheDocument();
  });

  it("starts fresh when New chat is tapped", async () => {
    const user = userEvent.setup();
    stubApi({ ...ranking, "/chat": chatReply("A first answer.") });
    render(<App />);

    await user.click(screen.getByRole("button", { name: STARTER }));
    await screen.findByText("A first answer.");
    await user.click(screen.getByRole("button", { name: "New chat" }));

    expect(screen.queryByText("A first answer.")).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(screen.getByRole("button", { name: STARTER })).toBeInTheDocument();
  });
});
