import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import LoadingSpinner from "@/components/ui/spinner";
import { useAddPageToList, useRemovePageFromList } from "@/lib/hooks/pages";
import { useTranslation } from "@/lib/i18n/client";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";
import { useTRPC } from "@karakeep/shared-react/trpc";

import { BookmarkListSelector } from "../lists/BookmarkListSelector";

// Same as the bookmarks' ManageListsModal, but for a page.
export default function ManagePageListsModal({
  pageId,
  open,
  setOpen,
}: {
  pageId: string;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const api = useTRPC();
  const { t } = useTranslation();

  const { data: allLists, isPending: isAllListsPending } = useBookmarkLists(
    undefined,
    { enabled: open },
  );
  const { data: alreadyInList, isPending: isAlreadyInListPending } = useQuery(
    api.pages.getListsOfPage.queryOptions({ pageId }, { enabled: open }),
  );
  const isLoading = isAllListsPending || isAlreadyInListPending;

  const onError = (e: { message: string; data?: { code?: string } | null }) => {
    toast({
      variant: "destructive",
      description:
        e.data?.code == "BAD_REQUEST" || e.data?.code == "FORBIDDEN"
          ? e.message
          : t("common.something_went_wrong"),
    });
  };
  const onSuccess = () => {
    toast({ description: t("toasts.lists.updated") });
  };

  const { mutate: addToList, isPending: isAdding } = useAddPageToList({
    onSuccess,
    onError,
  });
  const { mutate: removeFromList, isPending: isRemoving } =
    useRemovePageFromList({ onSuccess, onError });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("actions.manage_lists")}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <LoadingSpinner className="my-4" />
        ) : (
          <ul className="flex flex-col gap-2 pb-2 pt-4">
            {alreadyInList?.lists.map((list) => {
              const path = allLists?.getPathById(list.id);
              return (
                <li
                  key={list.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-background px-2 py-1 text-foreground"
                >
                  <p>
                    {path
                      ? path.map((l) => `${l.icon} ${l.name}`).join(" / ")
                      : `${list.icon} ${list.name}`}
                  </p>
                  <ActionButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    loading={isRemoving}
                    onClick={() => removeFromList({ pageId, listId: list.id })}
                    aria-label={t("actions.remove_from_list")}
                  >
                    <X className="size-4" />
                  </ActionButton>
                </li>
              );
            })}
          </ul>
        )}

        <div className="pb-4">
          <BookmarkListSelector
            hideBookmarkIds={alreadyInList?.lists.map((l) => l.id)}
            onChange={(listId) => {
              if (!isLoading && !isAdding) {
                addToList({ pageId, listId });
              }
            }}
            listTypes={["manual"]}
            disabled={isLoading || isAdding}
          />
        </div>
        <DialogFooter className="sm:justify-end">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              {t("actions.close")}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
