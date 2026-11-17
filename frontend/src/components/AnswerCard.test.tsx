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

  describe("a hub profile that shows the extra risk behind a moderate overall score", () => {
    const profileEntry = (metric: "composite" | "wind" | "winter" | "flood" | "hurricane" | "heat", score: number, rank: number) => ({
      rank,
      hub_id: "chicago",
      metric,
      score,
      note: `${rank === 1 ? "1st" : rank === 3 ? "3rd" : `${rank}th`} of 10 hubs`,
    });
    // Chicago on the live site: overall 36 (1st of 10) with a high wind score and a high winter score.
    const chicago = [
      profileEntry("composite", 36.3, 1),
      profileEntry("wind", 79.2, 1),
      profileEntry("winter", 59.9, 3),
      profileEntry("flood", 44, 5),
      profileEntry("hurricane", 3.1, 7),
      profileEntry("heat", 0.4, 10),
    ];

    it("shows all six scores, each hub rank beside its bar", () => {
      render(<AnswerCard answer={makeAnswer({ ranking: chicago })} />);
      const card = screen.getByRole("region", { name: "Chicago scores" });
      expect(within(card).getAllByRole("meter")).toHaveLength(6);
      expect(within(card).getAllByText("1st of 10 hubs")).toHaveLength(2); // overall and wind
      expect(within(card).getByText("3rd of 10 hubs")).toBeInTheDocument();
      expect(within(card).getByText("10th of 10 hubs")).toBeInTheDocument();
    });

    it("labels each hazard High, Moderate or Low in words, and leaves the overall score unlabelled", () => {
      render(<AnswerCard answer={makeAnswer({ ranking: chicago })} />);
      const card = screen.getByRole("region", { name: "Chicago scores" });
      expect(within(card).getAllByText("High")).toHaveLength(2); // wind 79.2 and winter 59.9
      expect(within(card).getAllByText("Moderate")).toHaveLength(1); // flood 44
      expect(within(card).getAllByText("Low")).toHaveLength(2); // hurricane and heat
    });

    it("says in a sentence that the overall score understates the high hazards", () => {
      render(<AnswerCard answer={makeAnswer({ ranking: chicago })} />);
      expect(screen.getByRole("note")).toHaveTextContent("The overall score averages five hazards, so it understates Wind (79.2) and Winter (59.9).");
      expect(screen.getByText(/Hazard levels: High 50\+/)).toBeInTheDocument();
    });

    it("gives no such sentence when the overall score is itself high", () => {
      const allHigh = chicago.map((item) => (item.metric === "composite" ? { ...item, score: 64 } : item));
      render(<AnswerCard answer={makeAnswer({ ranking: allHigh })} />);
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
    });

    it("does not repeat the rank notes under Why", async () => {
      const user = userEvent.setup();
      render(<AnswerCard answer={makeAnswer({ ranking: chicago, reasoning: ["Wind drives it."] })} />);
      await user.click(screen.getByRole("button", { name: "Why" }));
      expect(screen.getByText("Wind drives it.")).toBeInTheDocument();
      expect(screen.queryByText(/Chicago: 1st of 10 hubs/)).not.toBeInTheDocument();
    });

    it("copies the profile with levels, ranks and the understated-risk sentence", async () => {
      const user = userEvent.setup();
      render(<AnswerCard answer={makeAnswer({ ranking: chicago })} />);
      await user.click(screen.getByRole("button", { name: /Copy answer/ }));
      const copied = await navigator.clipboard.readText();
      expect(copied).toContain("- Overall: 36.3 (1st of 10 hubs)");
      expect(copied).toContain("- Wind: 79.2, High (1st of 10 hubs)");
      expect(copied).toContain("- Flood: 44, Moderate (5th of 10 hubs)");
      expect(copied).toContain("understates Wind (79.2) and Winter (59.9)");
    });
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

  it("writes a count of exactly one with the singular unit", () => {
    render(<AnswerCard answer={makeAnswer({ answer: "One windy day.", figures: [{ label: "Gust days", value: 1, unit: "days" }, { label: "Rain days", value: 7, unit: "days" }] })} />);
    expect(screen.getByText("day")).toBeInTheDocument();
    expect(screen.getByText("days")).toBeInTheDocument();
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
