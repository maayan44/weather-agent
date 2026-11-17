import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { makeAnswer } from "@/test/fixtures";
import { AnswerCard } from "./AnswerCard";

const winterRanking = [
  { rank: 1, hub_id: "minneapolis", metric: "winter" as const, score: 85, note: "Coldest and snowiest" },
  { rank: 2, hub_id: "detroit", metric: "winter" as const, score: 61.2, note: "" },
];

describe("AnswerCard", () => {
  it("shows the answer, one labelled bar per hub, and the confidence in words", () => {
    render(<AnswerCard answer={makeAnswer({ ranking: winterRanking, confidence: "medium" })} />);

    expect(screen.getByText("Minneapolis is the most exposed Midwest hub.")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Minneapolis: 85 out of 100" })).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Detroit: 61.2 out of 100" })).toBeInTheDocument();
    expect(screen.getByText("Medium confidence")).toBeInTheDocument();
  });

  it("groups bars by score so two hazards are never mixed in one list", () => {
    const ranking = [...winterRanking, { rank: 1, hub_id: "houston", metric: "flood" as const, score: 83.9, note: "" }];
    render(<AnswerCard answer={makeAnswer({ ranking })} />);
    expect(screen.getByRole("region", { name: "Winter score" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Flood score" })).getByRole("meter", { name: /Houston/ })).toBeInTheDocument();
  });

  it("shows one hub as a single profile card: overall first, then each hazard, with no per-score sections", () => {
    const profile = [
      { rank: 1, hub_id: "chicago", metric: "composite" as const, score: 36.3, note: "" },
      { rank: 1, hub_id: "chicago", metric: "wind" as const, score: 79.2, note: "" },
      { rank: 1, hub_id: "chicago", metric: "winter" as const, score: 59.9, note: "" },
      { rank: 1, hub_id: "chicago", metric: "flood" as const, score: 44, note: "" },
    ];
    render(<AnswerCard answer={makeAnswer({ answer: "Chicago is mostly exposed to wind.", ranking: profile })} />);

    const card = screen.getByRole("region", { name: "Chicago scores" });
    const bars = within(card).getAllByRole("meter").map((bar) => bar.getAttribute("aria-label"));
    expect(bars).toEqual(["Overall: 36.3 out of 100", "Wind: 79.2 out of 100", "Winter: 59.9 out of 100", "Flood: 44 out of 100"]);
    expect(screen.queryByRole("region", { name: "Wind score" })).not.toBeInTheDocument();
  });

  it("offers Why, Assumptions and Data gaps, and opens them on tap", async () => {
    const user = userEvent.setup();
    render(
      <AnswerCard
        answer={makeAnswer({
          ranking: winterRanking,
          reasoning: ["Minneapolis has the most freezing days."],
          assumptions: ["A snow day is 1 inch or more."],
          data_gaps: ["Wind data may understate extremes.", "County-level FEMA data."],
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Data gaps and limits (2)" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Why" }));
    expect(screen.getByText(/Minneapolis has the most freezing days/)).toBeInTheDocument();
    expect(screen.getByText(/Coldest and snowiest/)).toBeInTheDocument(); // a hub's note is part of the reasoning
    await user.click(screen.getByRole("button", { name: "Assumptions" }));
    expect(screen.getByText("A snow day is 1 inch or more.")).toBeInTheDocument();
  });

  it("leaves out sections the answer does not have", () => {
    render(<AnswerCard answer={makeAnswer({ ranking: [winterRanking[1]] })} />);
    expect(screen.queryByRole("button", { name: "Why" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Data gaps/ })).not.toBeInTheDocument();
  });

  it("puts the numbers up front when they are the whole answer", () => {
    render(<AnswerCard answer={makeAnswer({ answer: "9% of days had snow.", figures: [{ label: "Snow days", value: 33, unit: "days" }] })} />);
    expect(screen.getByText("Snow days")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Key numbers/ })).not.toBeInTheDocument();
  });

  it("folds the numbers away when there is a ranking to show", () => {
    render(<AnswerCard answer={makeAnswer({ ranking: winterRanking, figures: [{ label: "Snow days", value: 33, unit: "days" }] })} />);
    expect(screen.getByRole("button", { name: "Key numbers (1)" })).toBeInTheDocument();
  });

  it("shows a declined question as a plain notice, with no bars and no copy button", () => {
    render(<AnswerCard answer={makeAnswer({ in_scope: false, answer: "Seattle is not one of our hubs.", confidence: "low" })} />);
    expect(screen.getByText("Outside what I can answer")).toBeInTheDocument();
    expect(screen.getByText("Seattle is not one of our hubs.")).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copy answer/ })).not.toBeInTheDocument();
  });

  it("copies the answer as plain text", async () => {
    const user = userEvent.setup();
    render(<AnswerCard answer={makeAnswer({ ranking: winterRanking })} />);
    await user.click(screen.getByRole("button", { name: /Copy answer/ }));
    const copied = await navigator.clipboard.readText();
    expect(copied).toContain("Minneapolis is the most exposed Midwest hub.");
    expect(copied).toContain("1. Minneapolis: 85");
  });
});
