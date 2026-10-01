import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createEmptyCard, fsrs, State, type CardInput } from "ts-fsrs";
import { z } from "zod";
import { scanDecks, identifier } from "./decks.ts";
import type {
  Deck,
  Grade,
  ReviewRequest,
  StudyDeck,
} from "../src/contracts.ts";

const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: false });
const dateString = z.iso.datetime();
const numeric = z.number().finite().nonnegative();
const memorySchema = z.object({
  due: dateString,
  stability: numeric,
  difficulty: numeric.max(10),
  elapsed_days: numeric,
  scheduled_days: numeric,
  learning_steps: numeric.int(),
  reps: numeric.int(),
  lapses: numeric.int(),
  state: z.number().int().min(0).max(3),
  last_review: dateString.optional(),
});
const logSchema = z.object({
  rating: z.number().int().min(1).max(4),
  state: z.number().int().min(0).max(3),
  due: dateString,
  stability: numeric,
  difficulty: numeric,
  elapsed_days: numeric,
  last_elapsed_days: numeric,
  scheduled_days: numeric,
  learning_steps: numeric.int(),
  review: dateString,
});
const progressSchema = z.object({
  schemaVersion: z.literal(1),
  deckId: identifier,
  revision: numeric.int(),
  cards: z.record(identifier, memorySchema),
  history: z.array(
    z.object({
      requestId: z.uuid(),
      cardId: identifier,
      grade: z.number().int().min(1).max(4),
      contentVersion: z.string(),
      log: logSchema,
    }),
  ),
});
type Progress = z.infer<typeof progressSchema>;

export class StudyError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export const reviewSchema = z.object({
  cardId: identifier,
  grade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  revision: numeric.int(),
  contentVersion: z.string().regex(/^[a-f0-9]{64}$/),
  requestId: z.uuid(),
});

function contentVersion(deck: Deck): string {
  return createHash("sha256").update(JSON.stringify(deck)).digest("hex");
}

function interval(due: Date, now: Date): string {
  const minutes = Math.max(
    1,
    Math.round((due.getTime() - now.getTime()) / 60000),
  );
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} hr`;
  const days = Math.round(minutes / 1440);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export class ProgressStore {
  private writes: Promise<unknown> = Promise.resolve();
  constructor(public directory: string) {}

  private async read(deckId: string): Promise<Progress> {
    const path = join(this.directory, "progress", `${deckId}.json`);
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return {
          schemaVersion: 1,
          deckId,
          revision: 0,
          cards: {},
          history: [],
        };
      throw error;
    }
    const progress = progressSchema.parse(JSON.parse(raw));
    if (progress.deckId !== deckId)
      throw new Error("Progress deck ID does not match its filename.");
    return progress;
  }

  private async deck(deckId: string): Promise<Deck> {
    identifier.parse(deckId);
    const deck = (await scanDecks(this.directory)).decks.get(deckId);
    if (!deck)
      throw new StudyError(
        "Deck not found or invalid. Refresh the deck list and check its JSON.",
        404,
      );
    return deck;
  }

  async study(deckId: string, now = new Date()): Promise<StudyDeck> {
    identifier.parse(deckId);
    const [deck, progress] = await Promise.all([
      this.deck(deckId),
      this.read(deckId),
    ]);
    return this.snapshot(deck, progress, now);
  }

  private snapshot(deck: Deck, progress: Progress, now: Date): StudyDeck {
    const cards = deck.cards.map((card) => {
      const memory: CardInput = Object.hasOwn(progress.cards, card.id)
        ? progress.cards[card.id]
        : createEmptyCard(now);
      const preview = scheduler.repeat(memory, now);
      const intervals = Object.fromEntries(
        ([1, 2, 3, 4] as Grade[]).map((grade) => [
          grade,
          interval(preview[grade].card.due, now),
        ]),
      ) as Record<Grade, string>;
      return {
        ...card,
        state: State[memory.state as State] as
          "New" | "Learning" | "Review" | "Relearning",
        due: new Date(memory.due).toISOString(),
        reviews: memory.reps,
        lapses: memory.lapses,
        recall: memory.reps
          ? scheduler.get_retrievability(memory, now, false)
          : null,
        intervals,
      };
    });
    const queue = cards
      .filter((card) => card.state === "New" || new Date(card.due) <= now)
      .sort(
        (a, b) =>
          Number(a.state === "New") - Number(b.state === "New") ||
          a.due.localeCompare(b.due),
      )
      .map((card) => card.id);
    const future = cards
      .filter((card) => card.state !== "New" && new Date(card.due) > now)
      .map((card) => card.due)
      .sort();
    return {
      deck,
      contentVersion: contentVersion(deck),
      revision: progress.revision,
      cards,
      queue,
      nextDue: future[0] ?? null,
      counts: {
        new: cards.filter((card) => card.state === "New").length,
        learning: cards.filter(
          (card) => card.state === "Learning" || card.state === "Relearning",
        ).length,
        review: cards.filter((card) => card.state === "Review").length,
        due: queue.length,
      },
    };
  }

  review(
    deckId: string,
    request: ReviewRequest,
    now = new Date(),
  ): Promise<StudyDeck> {
    // One transaction queue covers read-modify-write; rejected writes never poison later ones.
    const operation = this.writes.then(() =>
      this.saveReview(deckId, request, now),
    );
    this.writes = operation.catch(() => undefined);
    return operation;
  }

  private async saveReview(
    deckId: string,
    input: ReviewRequest,
    now: Date,
  ): Promise<StudyDeck> {
    const request = reviewSchema.parse(input);
    const deck = await this.deck(deckId);
    const progress = await this.read(deckId);
    const previous = progress.history.find(
      (entry) => entry.requestId === request.requestId,
    );
    if (previous) {
      if (
        previous.cardId !== request.cardId ||
        previous.grade !== request.grade ||
        previous.contentVersion !== request.contentVersion
      )
        throw new StudyError(
          "Review request ID was reused for a different review.",
          409,
        );
      return this.snapshot(deck, progress, now);
    }
    if (
      request.revision !== progress.revision ||
      request.contentVersion !== contentVersion(deck)
    )
      throw new StudyError(
        "Deck or progress changed in another window. Refresh before rating again.",
        409,
      );
    if (!deck.cards.some((card) => card.id === request.cardId))
      throw new StudyError("Card no longer exists.", 404);
    const memory = Object.hasOwn(progress.cards, request.cardId)
      ? progress.cards[request.cardId]
      : createEmptyCard(now);
    if (new Date(memory.due) > now)
      throw new StudyError("This card is not due yet.", 409);
    const result = scheduler.next(memory, now, request.grade);
    progress.cards[request.cardId] = JSON.parse(
      JSON.stringify(result.card),
    ) as z.infer<typeof memorySchema>;
    progress.history.push({
      requestId: request.requestId,
      cardId: request.cardId,
      grade: request.grade,
      contentVersion: request.contentVersion,
      log: JSON.parse(JSON.stringify(result.log)) as z.infer<typeof logSchema>,
    });
    progress.revision++;
    progressSchema.parse(progress);
    const directory = join(this.directory, "progress");
    await mkdir(directory, { recursive: true });
    const destination = join(directory, `${deckId}.json`);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(progress, null, 2) + "\n", {
        flag: "wx",
        mode: 0o600,
      });
      await rename(temporary, destination);
    } finally {
      await unlink(temporary).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
    return this.snapshot(deck, progress, now);
  }
}
