"use client";

import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";
import { useInfinitePages } from "@/lib/hooks/pages";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  BookOpen,
  Plus,
  Search,
  Star,
  X,
} from "lucide-react";
import {
  parseAsBoolean,
  parseAsString,
  parseAsStringEnum,
  useQueryState,
} from "nuqs";

import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";
import { useDebounce } from "@karakeep/shared-react/hooks/use-debounce";
import { useTRPC } from "@karakeep/shared-react/trpc";

import PageCard from "./PageCard";

function TopicChips({
  topic,
  setTopic,
}: {
  topic: string | null;
  setTopic: (topic: string | null) => void;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const { data } = useQuery(api.pages.listTopics.queryOptions());
  if (!data || data.topics.length === 0) {
    return null;
  }
  const chip = (active: boolean) =>
    cn(
      badgeVariants({ variant: active ? "default" : "outline" }),
      "cursor-pointer text-sm font-normal",
    );
  return (
    <div className="flex flex-wrap gap-2">
      <button className={chip(topic === null)} onClick={() => setTopic(null)}>
        {t("pages.all_topics")}
      </button>
      {data.topics.map((tp) => (
        <button
          key={tp.topic}
          className={chip(topic?.toLowerCase() === tp.topic.toLowerCase())}
          onClick={() => setTopic(tp.topic)}
        >
          {tp.topic}
          <span className="ml-1 opacity-60">{tp.count}</span>
        </button>
      ))}
    </div>
  );
}

function ActiveFilterBadge({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Badge variant="secondary" className="gap-1 text-sm font-normal">
      {label}
      <button aria-label={t("pages.clear_filter")} onClick={onClear}>
        <X className="size-3" />
      </button>
    </Badge>
  );
}

export default function AllPagesView() {
  const { t } = useTranslation();
  const api = useTRPC();

  const [queryRaw, setQuery] = useQueryState("q", { defaultValue: "" });
  const query = useDebounce(queryRaw, 200);
  const [topic, setTopic] = useQueryState("topic", parseAsString);
  const [tagId, setTagId] = useQueryState("tagId", parseAsString);
  const [listId, setListId] = useQueryState("listId", parseAsString);
  const [favourited, setFavourited] = useQueryState(
    "favourited",
    parseAsBoolean,
  );
  const [archived, setArchived] = useQueryState("archived", parseAsBoolean);
  const [sortOrder, setSortOrder] = useQueryState(
    "sort",
    parseAsStringEnum(["desc", "asc"]).withDefault("desc"),
  );

  const { data: tag } = useQuery(
    api.tags.get.queryOptions({ tagId: tagId ?? "" }, { enabled: !!tagId }),
  );
  const { data: lists } = useBookmarkLists(undefined, { enabled: !!listId });
  const list = listId ? lists?.data.find((l) => l.id === listId) : undefined;

  const {
    data: pages,
    isPending,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfinitePages({
    query: query.trim() || undefined,
    topic: topic ?? undefined,
    tagId: tagId ?? undefined,
    listId: listId ?? undefined,
    favourited: favourited ? true : undefined,
    archived: archived ? true : undefined,
    sortOrder,
  });

  const hasFilters =
    !!query.trim() || !!topic || !!tagId || !!listId || !!favourited;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-2xl">
          <BookOpen className="size-6" />
          {t("pages.all_pages")}
        </span>
        <Link href="/dashboard/pages/new" className={buttonVariants()}>
          <Plus className="size-4" />
          {t("pages.new_page")}
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            className="pl-8"
            value={queryRaw}
            onChange={(e) => setQuery(e.target.value || null)}
            placeholder={t("pages.search_placeholder")}
          />
        </div>
        <Toggle
          variant="outline"
          className="bg-background"
          pressed={!!favourited}
          onPressedChange={(v) => setFavourited(v ? true : null)}
        >
          <Star className="size-4" />
          {t("pages.favourites_only")}
        </Toggle>
        <Toggle
          variant="outline"
          className="bg-background"
          pressed={!!archived}
          onPressedChange={(v) => setArchived(v ? true : null)}
        >
          <Archive className="size-4" />
          {t("pages.show_archived")}
        </Toggle>
        <Toggle
          variant="outline"
          className="bg-background"
          pressed={sortOrder === "asc"}
          onPressedChange={(v) => setSortOrder(v ? "asc" : null)}
          title={
            sortOrder === "asc"
              ? t("actions.sort.oldest_first")
              : t("actions.sort.newest_first")
          }
        >
          {sortOrder === "asc" ? (
            <ArrowUpNarrowWide className="size-4" />
          ) : (
            <ArrowDownNarrowWide className="size-4" />
          )}
          {sortOrder === "asc"
            ? t("actions.sort.oldest_first")
            : t("actions.sort.newest_first")}
        </Toggle>
      </div>

      <TopicChips topic={topic} setTopic={setTopic} />

      {(tagId || listId) && (
        <div className="flex flex-wrap gap-2">
          {tagId && (
            <ActiveFilterBadge
              label={`#${tag?.name ?? "…"}`}
              onClear={() => setTagId(null)}
            />
          )}
          {listId && (
            <ActiveFilterBadge
              label={t("pages.in_list", {
                name: list ? `${list.icon} ${list.name}` : "…",
              })}
              onClear={() => setListId(null)}
            />
          )}
        </div>
      )}

      {isPending ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-96 rounded-lg" />
          ))}
        </div>
      ) : pages && pages.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {pages.map((page) => (
              <PageCard key={page.id} page={page} />
            ))}
          </div>
          {hasNextPage && (
            <div className="flex justify-center">
              <ActionButton
                variant="ghost"
                loading={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              >
                {t("actions.load_more")}
              </ActionButton>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <BookOpen className="size-10 text-muted-foreground" />
          {hasFilters || archived ? (
            <p className="text-muted-foreground">
              {t("pages.no_matching_pages")}
            </p>
          ) : (
            <>
              <p className="text-lg">{t("pages.no_pages")}</p>
              <p className="max-w-md text-sm text-muted-foreground">
                {t("pages.no_pages_description")}
              </p>
              <Link href="/dashboard/pages/new" className={buttonVariants()}>
                <Plus className="size-4" />
                {t("pages.new_page")}
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
