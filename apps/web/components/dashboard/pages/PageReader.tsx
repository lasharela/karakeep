"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { badgeVariants } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { MarkdownReadonly } from "@/components/ui/markdown/markdown-readonly";
import { toast } from "@/components/ui/sonner";
import { useClientConfig } from "@/lib/clientConfig";
import { useUpdatePage } from "@/lib/hooks/pages";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  ExternalLink,
  List,
  NotebookPen,
  Pencil,
  Trash2,
} from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";

import { ArchivedActionIcon, FavouritedActionIcon } from "../bookmarks/icons";
import ManagePageListsModal from "./ManagePageListsModal";
import { DeletePageConfirmationDialog } from "./PageOptions";
import { getPageImageSrc, PageImage } from "./PageImage";
import { PageTagsEditor } from "./PageTagsEditor";

export default function PageReader({ pageId }: { pageId: string }) {
  const { t } = useTranslation();
  const api = useTRPC();
  const router = useRouter();
  const demoMode = !!useClientConfig().demoMode;
  const [listsOpen, setListsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: page, error } = useQuery(
    api.pages.get.queryOptions({ pageId }),
  );
  const { data: pageLists } = useQuery(
    api.pages.getListsOfPage.queryOptions({ pageId }),
  );
  const { mutate: updatePage } = useUpdatePage({
    onError: () => {
      toast({
        variant: "destructive",
        description: t("common.something_went_wrong"),
      });
    },
  });

  if (error) {
    // Also hit right after deleting the page, before navigating away.
    return (
      <div className="flex flex-col items-center gap-4 p-10 text-muted-foreground">
        <p>{error.message}</p>
        <Link href="/dashboard/pages" className={buttonVariants()}>
          {t("pages.back_to_pages")}
        </Link>
      </div>
    );
  }
  if (!page) {
    return <FullPageSpinner />;
  }

  const hasImage = !!getPageImageSrc(page);

  return (
    <article className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/dashboard/pages"
          className={cn(buttonVariants({ variant: "ghost" }), "px-2")}
        >
          <ArrowLeft className="size-4" />
          {t("pages.back_to_pages")}
        </Link>
        {!demoMode && (
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant="ghost"
              title={
                page.favourited
                  ? t("actions.unfavorite")
                  : t("actions.favorite")
              }
              onClick={() =>
                updatePage({ pageId, favourited: !page.favourited })
              }
            >
              <FavouritedActionIcon favourited={page.favourited} size={16} />
            </Button>
            <Button
              variant="ghost"
              title={
                page.archived ? t("actions.unarchive") : t("actions.archive")
              }
              onClick={() => updatePage({ pageId, archived: !page.archived })}
            >
              <ArchivedActionIcon archived={page.archived} size={16} />
            </Button>
            <Button variant="ghost" onClick={() => setListsOpen(true)}>
              <List className="size-4" />
              {t("actions.manage_lists")}
            </Button>
            <Link
              href={`/dashboard/pages/${pageId}/edit`}
              className={buttonVariants({ variant: "secondary" })}
            >
              <Pencil className="size-4" />
              {t("actions.edit")}
            </Link>
            <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        )}
      </div>

      {hasImage && (
        <div className="aspect-[21/9] w-full overflow-hidden rounded-lg border">
          <PageImage page={page} />
        </div>
      )}

      <header className="flex flex-col gap-3">
        <h1 className="break-words text-3xl font-bold">{page.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {page.topic && (
            <Link
              href={`/dashboard/pages?topic=${encodeURIComponent(page.topic)}`}
              className={badgeVariants({ variant: "default" })}
            >
              {page.topic}
            </Link>
          )}
          <span suppressHydrationWarning>{format(page.createdAt, "PPP")}</span>
          {pageLists?.lists.map((l) => (
            <Link
              key={l.id}
              href={`/dashboard/pages?listId=${l.id}`}
              className={badgeVariants({ variant: "outline" })}
            >
              {l.icon} {l.name}
            </Link>
          ))}
          {page.sourceUrl && (
            <a
              href={page.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 hover:underline"
            >
              <ExternalLink className="size-3" />
              {t("pages.source")}: {new URL(page.sourceUrl).hostname}
            </a>
          )}
        </div>
        {page.description && (
          <p className="text-lg text-muted-foreground">{page.description}</p>
        )}
        <PageTagsEditor page={page} disabled={demoMode} />
      </header>

      {page.note && (
        <div className="flex gap-2 rounded-md border-l-4 border-primary bg-accent/50 p-3 text-sm">
          <NotebookPen className="size-4 shrink-0" />
          <p className="whitespace-pre-wrap">{page.note}</p>
        </div>
      )}

      {page.content.trim() && (
        <div className="rounded-lg border bg-card p-6">
          <MarkdownReadonly>{page.content}</MarkdownReadonly>
        </div>
      )}

      {listsOpen && (
        <ManagePageListsModal
          pageId={pageId}
          open={listsOpen}
          setOpen={setListsOpen}
        />
      )}
      <DeletePageConfirmationDialog
        page={page}
        open={deleteOpen}
        setOpen={setDeleteOpen}
        onDeleted={() => router.push("/dashboard/pages")}
      />
    </article>
  );
}
