"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import { useClientConfig } from "@/lib/clientConfig";
import { useDeletePage, useUpdatePage } from "@/lib/hooks/pages";
import { useTranslation } from "@/lib/i18n/client";
import {
  Archive,
  ArchiveRestore,
  List,
  MoreHorizontal,
  Pencil,
  Star,
  Tags,
  Trash2,
} from "lucide-react";

import type { ZPageSummary } from "@karakeep/shared/types/pages";

import ManagePageListsModal from "./ManagePageListsModal";
import { PageTagsModal } from "./PageTagsEditor";

export function DeletePageConfirmationDialog({
  page,
  open,
  setOpen,
  onDeleted,
}: {
  page: Pick<ZPageSummary, "id" | "title">;
  open: boolean;
  setOpen: (v: boolean) => void;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const { mutate: deletePage, isPending } = useDeletePage({
    onSuccess: () => {
      toast({ description: t("pages.deleted") });
      setOpen(false);
      onDeleted?.();
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: t("common.something_went_wrong"),
      });
    },
  });

  return (
    <ActionConfirmingDialog
      open={open}
      setOpen={setOpen}
      title={t("pages.delete_page")}
      description={
        <p>{t("pages.delete_page_confirmation", { title: page.title })}</p>
      }
      actionButton={() => (
        <ActionButton
          type="button"
          variant="destructive"
          loading={isPending}
          onClick={() => deletePage({ pageId: page.id })}
        >
          {t("actions.delete")}
        </ActionButton>
      )}
    />
  );
}

/** The "..." menu of a page, mirroring the bookmark card menu. */
export default function PageOptions({
  page,
  onDeleted,
}: {
  page: ZPageSummary;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const demoMode = !!useClientConfig().demoMode;
  const [tagsOpen, setTagsOpen] = useState(false);
  const [listsOpen, setListsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { mutate: updatePage } = useUpdatePage({
    onSuccess: () => {
      toast({ description: t("pages.updated") });
    },
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
    <>
      <PageTagsModal page={page} open={tagsOpen} setOpen={setTagsOpen} />
      {listsOpen && (
        <ManagePageListsModal
          pageId={page.id}
          open={listsOpen}
          setOpen={setListsOpen}
        />
      )}
      <DeletePageConfirmationDialog
        page={page}
        open={deleteOpen}
        setOpen={setDeleteOpen}
        onDeleted={onDeleted}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="px-1 focus-visible:ring-0 has-[>svg]:px-1"
            aria-label={t("actions.more")}
          >
            <MoreHorizontal className="size-6" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="min-w-44"
          onCloseAutoFocus={(e) => {
            // Don't steal focus back from a dialog opened from the menu.
            if (tagsOpen || listsOpen || deleteOpen) {
              e.preventDefault();
            }
          }}
        >
          <DropdownMenuItem
            onClick={() => router.push(`/dashboard/pages/${page.id}/edit`)}
          >
            <Pencil className="size-4" />
            <span>{t("actions.edit")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              updatePage({ pageId: page.id, favourited: !page.favourited })
            }
          >
            <Star className="size-4" />
            <span>
              {page.favourited
                ? t("actions.unfavorite")
                : t("actions.favorite")}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              updatePage({ pageId: page.id, archived: !page.archived })
            }
          >
            {page.archived ? (
              <ArchiveRestore className="size-4" />
            ) : (
              <Archive className="size-4" />
            )}
            <span>
              {page.archived ? t("actions.unarchive") : t("actions.archive")}
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setTagsOpen(true)}>
            <Tags className="size-4" />
            <span>{t("actions.edit_tags")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setListsOpen(true)}>
            <List className="size-4" />
            <span>{t("actions.manage_lists")}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
            <span>{t("actions.delete")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
