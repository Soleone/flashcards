import { useEffect, useRef, useState } from "react";
import {
  ArrowRightIcon,
  CheckIcon,
  CircleHelpIcon,
  ClockIcon,
} from "lucide-react";
import type { Grade, ReviewRequest, StudyDeck } from "@/contracts";
import { request, ApiError } from "@/lib/api";
import { Markdown } from "./markdown";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./ui/field";
import { Textarea } from "./ui/textarea";
import { Separator } from "./ui/separator";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";

const ratings: { grade: Grade; name: string; description: string }[] = [
  { grade: 1, name: "Again", description: "Could not recall" },
  { grade: 2, name: "Hard", description: "Recalled with effort" },
  { grade: 3, name: "Good", description: "Recalled correctly" },
  { grade: 4, name: "Easy", description: "Immediate recall" },
];

export function StudySession({
  initial,
  refresh,
}: {
  initial: StudyDeck;
  refresh: () => void;
}) {
  const [study, setStudy] = useState(initial);
  const [revealed, setRevealed] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<Grade>(3);
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [lastSave, setLastSave] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const savingRef = useRef(false);
  const pending = useRef<ReviewRequest | null>(null);
  const recallStartedAt = useRef(0);
  const recallInput = useRef<HTMLTextAreaElement>(null);
  const ratingFocus = useRef<HTMLDivElement>(null);
  const card = study.cards.find((item) => item.id === study.queue[0]);

  useEffect(() => {
    if (!revealed) {
      recallStartedAt.current = performance.now();
      recallInput.current?.focus();
    }
  }, [card?.id, revealed]);

  useEffect(() => {
    if (revealed) {
      ratingFocus.current
        ?.querySelector<HTMLButtonElement>(`[data-grade="${selectedGrade}"]`)
        ?.focus();
    }
  }, [revealed, selectedGrade]);

  useEffect(() => {
    if (card) return;
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, [card]);

  function revealAnswer() {
    if (!card || revealed) return;
    setSelectedGrade(performance.now() - recallStartedAt.current <= 5000 ? 4 : 3);
    setRevealed(true);
  }

  async function rate(grade: Grade) {
    if (!card || !revealed || savingRef.current || conflict) return;
    savingRef.current = true;
    setSelectedGrade(grade);
    setSaving(true);
    setError("");
    if (
      !pending.current ||
      pending.current.grade !== grade ||
      pending.current.cardId !== card.id
    ) {
      pending.current = {
        cardId: card.id,
        grade,
        revision: study.revision,
        contentVersion: study.contentVersion,
        requestId: crypto.randomUUID(),
      };
    }
    try {
      const updated = await request<StudyDeck>(
        `/api/decks/${study.deck.id}/reviews`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pending.current),
        },
      );
      setStudy(updated);
      setRevealed(false);
      setAnswer("");
      setReviewed((count) => count + 1);
      setLastSave(
        `${ratings[grade - 1].name} saved. Next review in ${card.intervals[grade]}.`,
      );
      pending.current = null;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not save this review. Retry the same rating.",
      );
      setConflict(failure instanceof ApiError && failure.status === 409);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const inRatings = ratingFocus.current?.contains(target);
      if (event.repeat && inRatings) {
        if (event.key === "Enter" || event.code === "Space")
          event.preventDefault();
        return;
      }
      if (
        event.repeat ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        saving ||
        conflict ||
        !card
      )
        return;
      if (
        !inRatings &&
        target.closest(
          'input, textarea, button, a, [role="combobox"], [role="switch"], [role="listbox"], [contenteditable="true"]',
        )
      )
        return;
      if (event.code === "Space" && !revealed) {
        event.preventDefault();
        revealAnswer();
      } else if (revealed && /^[1-4]$/.test(event.key)) {
        event.preventDefault();
        void rate(Number(event.key) as Grade);
      } else if (revealed && event.key === "Enter") {
        event.preventDefault();
        void rate(selectedGrade);
      } else if (
        revealed &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        setSelectedGrade((grade) =>
          Math.max(1, Math.min(4, grade + direction)) as Grade,
        );
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  const ready =
    study.nextDue !== null && new Date(study.nextDue).getTime() <= now;

  return (
    <section className="flex flex-col gap-6" aria-label="Study session">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1>{study.deck.title}</h1>
          {study.deck.description ? (
            <p className="text-sm text-muted-foreground">
              {study.deck.description}
            </p>
          ) : null}
        </div>
        <Badge variant="secondary">{study.counts.due} ready</Badge>
      </div>
      <div
        className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground tabular-nums"
        role="group"
        aria-label="Learning progress"
      >
        <span>{study.counts.new} new</span>
        <span>{study.counts.learning} learning</span>
        <span>{study.counts.review} in review</span>
        <span>{reviewed} reviewed this session</span>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Review not confirmed</AlertTitle>
          <AlertDescription>
            {error}{" "}
            {conflict ? (
              <Button variant="outline" onClick={refresh}>
                Reload deck
              </Button>
            ) : (
              "Choose the same rating to retry safely."
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      {card ? (
        <Card className="study-card" aria-busy={saving}>
          <CardHeader className="flex flex-row items-center gap-3">
            <Badge variant="outline">{card.state}</Badge>
            {card.tags?.length ? (
              <CardDescription>{card.tags.join(" · ")}</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div
              className="question-prompt"
              role="heading"
              aria-level={2}
            >
              <span className="sr-only">Question: </span>
              <Markdown>{card.question}</Markdown>
            </div>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="recall-answer">Your recall</FieldLabel>
                <Textarea
                  ref={recallInput}
                  id="recall-answer"
                  placeholder="What do you remember?"
                  rows={3}
                  value={answer}
                  readOnly={revealed}
                  onChange={(event) => setAnswer(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      (event.ctrlKey || event.metaKey) &&
                      event.key === "Enter" &&
                      !revealed &&
                      !event.repeat &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      revealAnswer();
                    }
                  }}
                />
                <FieldDescription>
                  For comparison only. Not graded or saved.
                </FieldDescription>
              </Field>
            </FieldGroup>
            {revealed ? (
              <div className="answer-reveal flex flex-col gap-4">
                <Separator />
                <h3>Reference answer</h3>
                <Markdown>{card.answer}</Markdown>
              </div>
            ) : null}
            {revealed ? (
              <div
                ref={ratingFocus}
                className="flex flex-col gap-4"
                role="group"
                aria-label="Recall rating"
              >
                <div>
                  <p className="text-sm font-medium">
                    How well did you recall it?
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Rate your memory, not how familiar the answer looks.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {ratings.map((rating) => (
                    <div key={rating.grade} className="flex flex-col gap-2">
                      <Button
                        variant={
                          rating.grade === selectedGrade ? "default" : "outline"
                        }
                        size="lg"
                        data-grade={rating.grade}
                        disabled={saving || conflict}
                        onFocus={() => setSelectedGrade(rating.grade)}
                        onClick={() => void rate(rating.grade)}
                        title={rating.description}
                      >
                        <span>{rating.name}</span>
                        <span className="rating-key" aria-hidden="true">
                          {rating.grade}
                        </span>
                      </Button>
                      <span className="text-center text-xs text-muted-foreground">
                        {card.intervals[rating.grade]}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  {saving
                    ? "Saving your review…"
                    : "←/→ to choose · Enter to save · 1–4 to rate directly"}
                </p>
              </div>
            ) : (
              <Button size="lg" onClick={revealAnswer}>
                Reveal answer <ArrowRightIcon data-icon="inline-end" />
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Empty className="min-h-80 border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckIcon />
            </EmptyMedia>
            <EmptyTitle>You're caught up.</EmptyTitle>
            <EmptyDescription>
              {study.nextDue ? (
                <>
                  Next card due{" "}
                  {new Date(study.nextDue).toLocaleString([], {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  . Short learning steps are part of spaced repetition.
                </>
              ) : (
                "No cards waiting for review."
              )}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant={ready ? "default" : "outline"} onClick={refresh}>
              <ClockIcon data-icon="inline-start" />
              {ready ? "Review ready cards" : "Check for due cards"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Choose another deck above to keep learning.
            </p>
          </EmptyContent>
        </Empty>
      )}

      <p
        className="min-h-5 text-center text-xs text-muted-foreground"
        role="status"
      >
        {lastSave ||
          (card
            ? "Space or Ctrl/⌘ + Enter to reveal · ←/→ to choose · Enter to save · 1–4 to rate"
            : `${reviewed} reviews saved this session`)}
      </p>
      <details className="learning-details">
        <summary>
          <CircleHelpIcon className="size-4" /> Card-by-card progress
        </summary>
        <div className="overflow-x-auto">
          <table>
            <caption className="sr-only">
              Per-card learning state and estimated recall
            </caption>
            <thead>
              <tr>
                <th scope="col">Card</th>
                <th scope="col">State</th>
                <th scope="col">Reviews</th>
                <th scope="col">Recall</th>
              </tr>
            </thead>
            <tbody>
              {study.cards.map((item) => (
                <tr key={item.id}>
                  <th scope="row">{item.question}</th>
                  <td>{item.state}</td>
                  <td>{item.reviews}</td>
                  <td>
                    {item.recall === null
                      ? "Not studied"
                      : `${Math.round(item.recall * 100)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Recall is FSRS’s estimate of remembering the answer, not a test score.
          New cards have no estimate yet.
        </p>
      </details>
    </section>
  );
}
