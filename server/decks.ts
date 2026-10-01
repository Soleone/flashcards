import { readdir, readFile, lstat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { Deck, DeckCatalog } from "../src/contracts.ts";

export const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/);
export const deckSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: identifier,
    title: z.string().trim().min(1).max(200),
    description: z.string().max(2000).optional(),
    cards: z
      .array(
        z.object({
          id: identifier,
          question: z.string().trim().min(1).max(50000),
          answer: z.string().trim().min(1).max(50000),
          tags: z.array(z.string().max(100)).max(30).optional(),
        }),
      )
      .min(1)
      .max(10000),
  })
  .superRefine((deck, ctx) => {
    const ids = new Set<string>();
    deck.cards.forEach((card, index) => {
      if (ids.has(card.id))
        ctx.addIssue({
          code: "custom",
          path: ["cards", index, "id"],
          message: `Duplicate card ID: ${card.id}`,
        });
      ids.add(card.id);
    });
  });

export async function scanDecks(
  directory: string,
): Promise<{ catalog: DeckCatalog; decks: Map<string, Deck> }> {
  const decks = new Map<string, Deck>();
  const issues: string[] = [];
  const duplicateIds = new Set<string>();
  const names = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
  for (const name of names) {
    try {
      const path = join(directory, name);
      if ((await lstat(path)).size > 10 * 1024 * 1024)
        throw new Error("Deck exceeds the 10 MB limit.");
      const deck = deckSchema.parse(JSON.parse(await readFile(path, "utf8")));
      if (decks.has(deck.id) || duplicateIds.has(deck.id)) {
        duplicateIds.add(deck.id);
        decks.delete(deck.id);
        throw new Error(
          `Duplicate deck ID ${deck.id}; conflicting decks are excluded.`,
        );
      }
      decks.set(deck.id, deck);
    } catch (error) {
      issues.push(
        `${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return {
    decks,
    catalog: {
      directory,
      issues,
      decks: [...decks.values()].map((deck) => ({
        id: deck.id,
        title: deck.title,
        count: deck.cards.length,
      })),
    },
  };
}
