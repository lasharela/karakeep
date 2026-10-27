"use client";

import Link from "next/link";
import { badgeVariants } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useClientConfig } from "@/lib/clientConfig";
import { useUpdatePage } from "@/lib/hooks/pages";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Maximize2 } from "lucide-react";

import type { ZPageSummary } from "@karakeep/shared/types/pages";

import BookmarkFormattedCreatedAt from "../bookmarks/BookmarkFormattedCreatedAt";
import { ArchivedActionIcon, FavouritedActionIcon } from "../bookmarks/icons";
import { PageImage } from "./PageImage";
import PageOptions from "./PageOptions";

function HoverActionBar({ page }: { page: ZPageSummary }) {
  const { t } = useTranslation();
  const demoMode = !!useClientConfig().demoMode;
  const { mutate } = useUpdatePage({
    onError: () => {
      toast({
        variant: "destructive",
        description: t("common.something_went_wrong"),
      });
    },
  });
  if (demoMode) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute right-2 top-2 z-[60] hidden gap-1 rounded bg-white/50 p-1 opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 dark:bg-black/50 [@media(pointer:fine)]:pointer-events-auto [@media(pointer:fine)]:flex">
      <button
        title={
          page.favourited ? t("actions.unfavorite") : t("actions.favorite")
        }
        className="rounded p-0.5 hover:bg-background/50"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          mutate({ pageId: page.id, favourited: !page.favourited });
        }}
      >
        <FavouritedActionIcon favourited={page.favourited} size={16} />
      </button>
      <button
        title={page.archived ? t("actions.unarchive") : t("actions.archive")}
        className="rounded p-0.5 hover:bg-background/50"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          mutate({ pageId: page.id, archived: !page.archived });
        }}
      >
        <ArchivedActionIcon archived={page.archived} size={16} />
      </button>
    </div>
  );
}

/** A page card, styled like the bookmark grid card. */
export default function PageCard({ page }: { page: ZPageSummary }) {
  const href = `/dashboard/pages/${page.id}`;
  return (
    <div className="group relative flex h-96 flex-col overflow-hidden rounded-lg border border-border bg-card hover:shadow-lg hover:transition-shadow">
      <HoverActionBar page={page} />
      <Link href={href} className="h-48 w-full shrink-0 overflow-hidden">
        <PageImage page={page} className="rounded-t-lg" />
      </Link>
      <div className="flex h-full flex-col justify-between gap-2 overflow-hidden p-2">
        <div className="flex flex-col gap-2 overflow-hidden">
          <Link
            href={href}
            className="line-clamp-2 flex-none shrink-0 overflow-hidden text-ellipsis break-words text-lg"
          >
            {page.title}
          </Link>
          {page.description && (
            <p className="line-clamp-3 shrink-0 text-sm text-muted-foreground">
              {page.description}
            </p>
          )}
          <div className="flex shrink-0 flex-wrap gap-1 overflow-hidden">
            {page.topic && (
              <Link
                href={`/dashboard/pages?topic=${encodeURIComponent(page.topic)}`}
                className={cn(
                  badgeVariants({ variant: "default" }),
                  "text-nowrap",
                )}
              >
                {page.topic}
              </Link>
            )}
            {page.tags.map((tag) => (
              <Link
                key={tag.id}
                href={`/dashboard/pages?tagId=${tag.id}`}
                className={cn(
                  badgeVariants({ variant: "secondary" }),
                  "text-nowrap font-light text-gray-700 hover:bg-foreground hover:text-secondary dark:text-gray-400",
                )}
              >
                {tag.name}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex w-full shrink-0 justify-between text-gray-500">
          <div className="flex items-center gap-2 overflow-hidden text-nowrap font-light">
            <Link href={href} suppressHydrationWarning>
              <BookmarkFormattedCreatedAt createdAt={page.createdAt} />
            </Link>
          </div>
          <div className="flex text-gray-500">
            {page.favourited && (
              <FavouritedActionIcon
                className="m-1 size-8 rounded p-1"
                favourited
              />
            )}
            <Link
              href={href}
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "px-2 has-[>svg]:px-2",
              )}
            >
              <Maximize2 size={16} />
            </Link>
            <PageOptions page={page} />
          </div>
        </div>
      </div>
    </div>
  );
}
