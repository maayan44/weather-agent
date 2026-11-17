import { Info } from "lucide-react";
import type { AgentAnswer } from "@/api/types";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { CopyButton } from "@/components/CopyButton";
import { ScoreBar } from "@/components/ScoreBar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { asHubProfile, formatAnswerAsText, groupRanking } from "@/lib/answerText";
import { formatScore, formatUnit, hubLabel, metricLabel } from "@/lib/hazards";

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function KeyNumbers({ figures }: { figures: AgentAnswer["figures"] }) {
  return (
    <dl className="divide-y divide-border">
      {figures.map((figure) => (
        <div key={figure.label} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-base">{figure.label}</dt>
          <dd className="shrink-0 font-semibold tabular-nums">
            {formatScore(figure.value)} <span className="font-normal text-muted-foreground">{formatUnit(figure.value, figure.unit)}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

// A question the agent declined (another city, a forecast...). It says so plainly instead of looking like an answer.
function OutOfScopeCard({ answer }: { answer: AgentAnswer }) {
  return (
    <Card className="bg-muted/60 shadow-none">
      <CardContent className="flex gap-3">
        <Info aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Outside what I can answer</p>
          <p className="mt-1 text-[1.0625rem] leading-relaxed">{answer.answer}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function AnswerCard({ answer }: { answer: AgentAnswer }) {
  if (!answer.in_scope) return <OutOfScopeCard answer={answer} />;

  const groups = groupRanking(answer.ranking);
  const profile = asHubProfile(groups);
  const hubNotes = answer.ranking.filter((entry) => entry.note).map((entry) => `${hubLabel(entry.hub_id)}: ${entry.note}`);
  const why = [...answer.reasoning, ...hubNotes];
  // For a statistics question the numbers are the answer, so they are shown up front instead of folded away.
  const numbersAreTheAnswer = groups.length === 0 && answer.figures.length > 0;

  return (
    <Card>
      <CardContent className="space-y-4">
        <p className="text-[1.0625rem] leading-relaxed">{answer.answer}</p>

        {profile ? (
          // One hub, several scores: a single card with a bar per score, overall first.
          <section aria-label={`${hubLabel(profile.hubId)} scores`} className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">{hubLabel(profile.hubId)} scores (0-100, higher = more exposed)</h3>
            {profile.entries.map((entry) => (
              <ScoreBar key={entry.metric} label={metricLabel(entry.metric)} value={entry.score} />
            ))}
          </section>
        ) : (
          groups.map(({ metric, entries }) => (
            <section key={metric} aria-label={`${metricLabel(metric)} score`} className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">{metricLabel(metric)} score (0-100, higher = more exposed)</h3>
              {entries.map((entry) => (
                <ScoreBar key={`${metric}-${entry.hub_id}`} label={hubLabel(entry.hub_id)} value={entry.score} />
              ))}
            </section>
          ))
        )}

        {numbersAreTheAnswer && <KeyNumbers figures={answer.figures} />}

        <ConfidenceBadge confidence={answer.confidence} />

        <Accordion type="multiple" className="border-t">
          {why.length > 0 && (
            <AccordionItem value="why">
              <AccordionTrigger>Why</AccordionTrigger>
              <AccordionContent>
                <BulletList items={why} />
              </AccordionContent>
            </AccordionItem>
          )}
          {!numbersAreTheAnswer && answer.figures.length > 0 && (
            <AccordionItem value="numbers">
              <AccordionTrigger>Key numbers ({answer.figures.length})</AccordionTrigger>
              <AccordionContent>
                <KeyNumbers figures={answer.figures} />
              </AccordionContent>
            </AccordionItem>
          )}
          {answer.assumptions.length > 0 && (
            <AccordionItem value="assumptions">
              <AccordionTrigger>Assumptions</AccordionTrigger>
              <AccordionContent>
                <BulletList items={answer.assumptions} />
              </AccordionContent>
            </AccordionItem>
          )}
          {answer.data_gaps.length > 0 && (
            <AccordionItem value="gaps">
              <AccordionTrigger>Data gaps and limits ({answer.data_gaps.length})</AccordionTrigger>
              <AccordionContent>
                <BulletList items={answer.data_gaps} />
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>

        <CopyButton text={formatAnswerAsText(answer)} />
      </CardContent>
    </Card>
  );
}
