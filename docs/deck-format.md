# Deck format for agents

Create one UTF-8 `.json` file per topic directly in `$DATA/apps/flashcards` (normally `/home/soleone/data/apps/flashcards`). Only top-level JSON files are scanned. Filenames are descriptive; deck and card IDs define identity.

````json
{
  "schemaVersion": 1,
  "id": "javascript-basics",
  "title": "JavaScript basics",
  "description": "Small questions about everyday JavaScript.",
  "cards": [
    {
      "id": "const-binding",
      "question": "Does `const` make an object immutable?",
      "answer": "No. It prevents reassignment of the binding. The object can still change.\n\n```js\nconst user = { name: 'Ada' };\nuser.name = 'Grace'; // allowed\n```",
      "tags": ["Variables"]
    }
  ]
}
````

## Contract

- `schemaVersion`: exactly `1`.
- `id`: globally unique deck ID. Use letters, digits, hyphens, underscores; start with a letter or digit, at most 100 characters.
- `title`: nonempty, at most 200 characters.
- `description`: optional, at most 2,000 characters.
- `cards`: 1 to 10,000 cards; every card ID unique within its deck.
- `question` and `answer`: nonempty Markdown strings, at most 50,000 characters each. Markdown and fenced code render without executing HTML. GFM tables and lists are supported. Remote images are deliberately omitted to avoid surprise network access. Links open only when clicked.
- `tags`: optional array of at most 30 strings, each at most 100 characters.
- Maximum file size: 10 MB. Write using a temporary non-JSON filename and rename when finished so the app never reads a partially written deck.

Keep deck and card IDs unchanged when polishing wording. Give a genuinely different concept a new card ID. Removed cards retain their old history on disk, but are not shown. Reintroducing the same ID restores its learning state. Decks sharing an ID are excluded until the conflict is fixed.

**Never edit `progress/` or `.server.lock`.** The app owns those. New decks do not contain scheduling fields, mastery scores, or review history.

## Agent prompt

> Generate a flashcard deck about [TOPIC] using docs/deck-format.md from this repository. Write the JSON to $DATA/apps/flashcards/[topic].json. Use stable, descriptive IDs, one precise concept per card, and concise answers. Include code examples where useful. Do not modify app-owned progress files. Check JSON syntax, duplicate IDs, and factual accuracy before delivery. Preserve existing IDs when improving an existing deck.

## Learning model

The app uses ts-fsrs with 90% target retention and deterministic interval previews. New and due cards are eligible, with due previously studied cards ahead of new ones. Ratings are Again (failed recall), Hard (correct with effort), Good (correct), Easy (immediate). Short learning steps can return cards within minutes; long-term intervals adapt with repeated reviews.

Typed recall is optional, self-rated, and held only in memory. It is not sent to the server or saved. Ratings, FSRS state, and timestamped review logs are persisted separately in `progress/<deck-id>.json`. Estimated recall is a scheduling prediction, not proof that a fact is mastered.
