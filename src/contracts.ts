export type Grade = 1 | 2 | 3 | 4;

export interface DeckCard {
  id: string;
  question: string;
  answer: string;
  tags?: string[];
}

export interface Deck {
  schemaVersion: 1;
  id: string;
  title: string;
  description?: string;
  cards: DeckCard[];
}

export interface DeckCatalog {
  directory: string;
  decks: { id: string; title: string; count: number }[];
  issues: string[];
}

export interface StudyCard extends DeckCard {
  state: "New" | "Learning" | "Review" | "Relearning";
  due: string;
  reviews: number;
  lapses: number;
  recall: number | null;
  intervals: Record<Grade, string>;
}

export interface StudyDeck {
  deck: Deck;
  contentVersion: string;
  revision: number;
  cards: StudyCard[];
  queue: string[];
  nextDue: string | null;
  counts: { new: number; learning: number; review: number; due: number };
}

export interface ReviewRequest {
  cardId: string;
  grade: Grade;
  revision: number;
  contentVersion: string;
  requestId: string;
}
