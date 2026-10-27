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
import { useUpdatePageTags } from "@/lib/hooks/pages";
import { useTranslation } from "@/lib/i18n/client";

import type { ZPageSummary } from "@karakeep/shared/types/pages";

import { TagsEditor } from "../bookmarks/TagsEditor";

export function PageTagsEditor({
  page,
  disabled,
}: {
  page: Pick<ZPageSummary, "id" | "tags">;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { mutate } = useUpdatePageTags({
    onError: () => {
      toast({
        variant: "destructive",
        description: t("common.something_went_wrong"),
      });
    },
  });

  return (
    <TagsEditor
      tags={page.tags}
      disabled={disabled}
      onAttach={({ tagName, tagId }) => {
        mutate({ pageId: page.id, attach: [{ tagName, tagId }], detach: [] });
      }}
      onDetach={({ tagId }) => {
        mutate({ pageId: page.id, attach: [], detach: [{ tagId }] });
      }}
    />
  );
}

export function PageTagsModal({
  page,
  open,
  setOpen,
}: {
  page: Pick<ZPageSummary, "id" | "tags">;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("actions.edit_tags")}</DialogTitle>
        </DialogHeader>
        <PageTagsEditor page={page} />
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
