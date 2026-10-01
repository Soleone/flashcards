import { lazy, Suspense, useEffect, useState } from "react";
import { LayersIcon, MoonIcon, RefreshCwIcon, SunIcon } from "lucide-react";
import type { DeckCatalog, StudyDeck } from "./contracts";
import { request } from "./lib/api";
const StudySession = lazy(() =>
  import("./components/study-session").then((module) => ({
    default: module.StudySession,
  })),
);
import { Button } from "./components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "./components/ui/empty";
import { Skeleton } from "./components/ui/skeleton";
import { Field, FieldGroup, FieldLabel } from "./components/ui/field";

function initialTheme() {
  try {
    return localStorage.getItem("flashcards.theme.v1") === "dark";
  } catch {
    return false;
  }
}

export default function App() {
  const [catalog, setCatalog] = useState<DeckCatalog | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadedStudy, setLoadedStudy] = useState<{
    selected: string;
    refresh: number;
    value: StudyDeck;
  } | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [failedStudy, setFailedStudy] = useState<{
    selected: string;
    refresh: number;
    message: string;
  } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [dark, setDark] = useState(initialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("flashcards.theme.v1", dark ? "dark" : "light");
    } catch {
      /* Theme still works without storage. */
    }
  }, [dark]);

  useEffect(() => {
    const controller = new AbortController();
    request<DeckCatalog>("/api/decks", { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setCatalogError("");
        setCatalog(result);
        setSelected((previous) =>
          result.decks.some((deck) => deck.id === previous)
            ? previous
            : (result.decks[0]?.id ?? null),
        );
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setCatalogError(
          error instanceof Error ? error.message : "Could not read decks.",
        );
      });
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    request<StudyDeck>(`/api/decks/${selected}`, { signal: controller.signal })
      .then((value) => {
        if (controller.signal.aborted) return;
        setLoadedStudy({ selected, refresh, value });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setFailedStudy({
            selected,
            refresh,
            message:
              error instanceof Error
                ? error.message
                : "Could not load this deck.",
          });
      });
    return () => controller.abort();
  }, [selected, refresh]);

  const study =
    loadedStudy?.selected === selected && loadedStudy.refresh === refresh
      ? loadedStudy.value
      : null;
  const studyError =
    failedStudy?.selected === selected &&
    failedStudy.refresh === refresh &&
    !study
      ? failedStudy.message
      : "";
  const loading =
    !catalogError && (!catalog || (selected !== null && !study && !studyError));
  const items =
    catalog?.decks.map((deck) => ({ label: deck.title, value: deck.id })) ?? [];
  const reload = () => setRefresh((value) => value + 1);

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="Flashcards home">
          <LayersIcon className="size-5" />
          <span>Flashcards</span>
        </a>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            A little practice. Lasting knowledge.
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDark((value) => !value)}
            aria-label={dark ? "Use light theme" : "Use dark theme"}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </Button>
        </div>
      </header>
      <main id="main" className="study-shell">
        <div className="deck-toolbar">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="deck-selector">Your decks</FieldLabel>
              <Select
                items={items}
                value={selected}
                onValueChange={(value) => {
                  if (value === selected) return;
                  setLoadedStudy(null);
                  setFailedStudy(null);
                  setSelected(value);
                }}
                disabled={!items.length}
              >
                <SelectTrigger id="deck-selector" className="w-full">
                  <SelectValue placeholder="Choose a topic" />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {items.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <Button
            variant="outline"
            onClick={reload}
            aria-label="Refresh decks and due cards"
          >
            <RefreshCwIcon data-icon="inline-start" />
            Refresh
          </Button>
        </div>
        {catalogError || studyError ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn't load your cards</AlertTitle>
            <AlertDescription>
              {catalogError || studyError} Use Refresh to try again.
            </AlertDescription>
          </Alert>
        ) : null}
        {catalog?.issues.length ? (
          <Alert>
            <AlertTitle>Some deck files need attention</AlertTitle>
            <AlertDescription>
              <details>
                <summary>
                  Show {catalog.issues.length} file{" "}
                  {catalog.issues.length === 1 ? "issue" : "issues"}
                </summary>
                <ul className="flex flex-col gap-2">
                  {catalog.issues.map((issue) => (
                    <li key={issue} className="break-all">
                      {issue}
                    </li>
                  ))}
                </ul>
              </details>
            </AlertDescription>
          </Alert>
        ) : null}
        {loading ? (
          <div
            className="flex flex-col gap-6"
            aria-label="Loading deck"
            role="status"
          >
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-80 w-full" />
            <span className="sr-only">Loading your cards…</span>
          </div>
        ) : study ? (
          <Suspense
            fallback={
              <Skeleton
                className="h-80 w-full"
                aria-label="Loading study screen"
              />
            }
          >
            <StudySession
              key={`${selected}-${refresh}`}
              initial={study}
              refresh={reload}
            />
          </Suspense>
        ) : !catalogError && !studyError ? (
          <Empty className="min-h-80 border bg-card">
            <EmptyHeader>
              <EmptyTitle>Your next topic starts here.</EmptyTitle>
              <EmptyDescription>
                Ask an agent to create a deck JSON in the folder below, then
                refresh.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <code className="break-all text-xs">
                {catalog?.directory ?? "$DATA/apps/flashcards"}
              </code>
              <p className="text-sm text-muted-foreground">
                See docs/deck-format.md for the agent-ready format.
              </p>
            </EmptyContent>
          </Empty>
        ) : null}
        <footer className="app-footer">
          <span>Local files. No account. Your pace.</span>
          <details>
            <summary>Deck folder</summary>
            <code>{catalog?.directory ?? "$DATA/apps/flashcards"}</code>
          </details>
        </footer>
      </main>
    </div>
  );
}
