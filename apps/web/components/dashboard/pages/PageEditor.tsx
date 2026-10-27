"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import FilePickerButton from "@/components/ui/file-picker-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarkdownReadonly } from "@/components/ui/markdown/markdown-readonly";
import { toast } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useCreatePage, useUpdatePage } from "@/lib/hooks/pages";
import useUpload from "@/lib/hooks/upload-file";
import { useTranslation } from "@/lib/i18n/client";
import { ImagePlus, Trash2 } from "lucide-react";

import type {
  ZPage,
  ZPageImageInput,
  ZUpdatePageRequest,
} from "@karakeep/shared/types/pages";
import type { ZBookmarkTags } from "@karakeep/shared/types/tags";

import { TagsEditor } from "../bookmarks/TagsEditor";
import { PageImage } from "./PageImage";
import { PageTagsEditor } from "./PageTagsEditor";

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

/**
 * Create / edit form for a page. With `page` set it edits that page (tags are
 * saved immediately, like on bookmarks); otherwise it creates a new one.
 */
export default function PageEditor({ page }: { page?: ZPage }) {
  const { t } = useTranslation();
  const router = useRouter();

  const [title, setTitle] = useState(page?.title ?? "");
  const [topic, setTopic] = useState(page?.topic ?? "");
  const [description, setDescription] = useState(page?.description ?? "");
  const [content, setContent] = useState(page?.content ?? "");
  const [note, setNote] = useState(page?.note ?? "");
  const [sourceUrl, setSourceUrl] = useState(page?.sourceUrl ?? "");
  const [imageUrl, setImageUrl] = useState(page?.imageUrl ?? "");
  const [imageAssetId, setImageAssetId] = useState<string | null>(
    page?.imageAssetId ?? null,
  );
  // Only used while creating; when editing, tags are saved right away.
  const [newTags, setNewTags] = useState<ZBookmarkTags[]>([]);

  const onError = (e: { message: string }) => {
    toast({ variant: "destructive", description: e.message });
  };

  const { mutate: upload, isPending: isUploading } = useUpload({
    onSuccess: async (resp) => {
      setImageAssetId(resp.assetId);
      setImageUrl("");
    },
    onError: (e) => {
      toast({ variant: "destructive", description: e.error });
    },
  });

  const { mutate: createPage, isPending: isCreating } = useCreatePage({
    onSuccess: (created) => {
      toast({ description: t("pages.created") });
      router.push(`/dashboard/pages/${created.id}`);
    },
    onError,
  });
  const { mutate: updatePage, isPending: isUpdating } = useUpdatePage({
    onSuccess: (updated) => {
      toast({ description: t("pages.updated") });
      router.push(`/dashboard/pages/${updated.id}`);
    },
    onError,
  });

  const trimmedUrl = imageUrl.trim();

  const imageForCreate = (): ZPageImageInput | undefined => {
    if (trimmedUrl) {
      return { url: trimmedUrl };
    }
    if (imageAssetId) {
      return { assetId: imageAssetId };
    }
    return undefined;
  };

  // undefined = unchanged, null = removed.
  const imageForUpdate = (p: ZPage): ZUpdatePageRequest["image"] => {
    const changed =
      trimmedUrl !== (p.imageUrl ?? "") || imageAssetId !== p.imageAssetId;
    if (!changed) {
      return undefined;
    }
    if (trimmedUrl) {
      return { url: trimmedUrl };
    }
    if (imageAssetId && imageAssetId !== p.imageAssetId) {
      return { assetId: imageAssetId };
    }
    return imageAssetId ? undefined : null;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast({ variant: "destructive", description: t("pages.title_required") });
      return;
    }
    const optional = (v: string) => (v.trim() ? v : undefined);
    if (page) {
      updatePage({
        pageId: page.id,
        title,
        topic,
        description: description.trim() ? description : null,
        content,
        note: note.trim() ? note : null,
        sourceUrl: sourceUrl.trim() ? sourceUrl.trim() : null,
        image: imageForUpdate(page),
      });
    } else {
      createPage({
        title,
        topic: optional(topic),
        description: optional(description),
        content,
        note: optional(note),
        sourceUrl: optional(sourceUrl)?.trim(),
        tags: newTags.map((tag) => tag.name),
        image: imageForCreate(),
      });
    }
  };

  const previewImage = {
    title: title || "?",
    imageUrl: trimmedUrl || null,
    imageAssetId: trimmedUrl ? null : imageAssetId,
  };
  const hasImage = !!trimmedUrl || !!imageAssetId;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <span className="text-2xl">
        {page ? t("pages.edit_page") : t("pages.new_page")}
      </span>

      <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          <Field label={t("common.title")} htmlFor="page-title">
            <Input
              id="page-title"
              value={title}
              maxLength={500}
              placeholder={t("pages.title_placeholder")}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus={!page}
            />
          </Field>
          <Field label={t("pages.topic")} htmlFor="page-topic">
            <Input
              id="page-topic"
              value={topic}
              maxLength={100}
              placeholder={t("pages.topic_placeholder")}
              onChange={(e) => setTopic(e.target.value)}
            />
          </Field>
          <Field label={t("common.description")} htmlFor="page-description">
            <Textarea
              id="page-description"
              value={description}
              maxLength={2000}
              rows={3}
              placeholder={t("pages.description_placeholder")}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field label={t("common.tags")}>
            {page ? (
              <PageTagsEditor page={page} />
            ) : (
              <TagsEditor
                tags={newTags}
                onAttach={({ tagName, tagId }) =>
                  setNewTags((tags) =>
                    tags.some((tag) => tag.name === tagName)
                      ? tags
                      : [
                          ...tags,
                          {
                            id: tagId ?? `new:${tagName}`,
                            name: tagName,
                            attachedBy: "human",
                          },
                        ],
                  )
                }
                onDetach={({ tagId }) =>
                  setNewTags((tags) => tags.filter((tag) => tag.id !== tagId))
                }
              />
            )}
          </Field>
        </div>

        <div className="flex flex-col gap-3">
          <Label>{t("pages.image")}</Label>
          <div className="aspect-video w-full overflow-hidden rounded-lg border">
            <PageImage page={previewImage} />
          </div>
          <Input
            aria-label={t("pages.image_url")}
            value={imageUrl}
            placeholder={t("pages.image_url_placeholder")}
            onChange={(e) => setImageUrl(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <FilePickerButton
              type="button"
              variant="secondary"
              loading={isUploading}
              accept={IMAGE_ACCEPT}
              onFileSelect={(file) => upload(file)}
            >
              <ImagePlus className="size-4" />
              {t("pages.upload_image")}
            </FilePickerButton>
            {hasImage && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setImageUrl("");
                  setImageAssetId(null);
                }}
              >
                <Trash2 className="size-4" />
                {t("pages.remove_image")}
              </Button>
            )}
          </div>
          {!trimmedUrl && imageAssetId && (
            <p className="text-xs text-muted-foreground">
              {t("pages.uploaded_image")}
            </p>
          )}
        </div>
      </div>

      <Field label={t("pages.content")}>
        <Tabs defaultValue="write">
          <TabsList>
            <TabsTrigger value="write">{t("pages.write")}</TabsTrigger>
            <TabsTrigger value="preview">{t("pages.preview")}</TabsTrigger>
          </TabsList>
          <TabsContent value="write">
            <Textarea
              value={content}
              rows={20}
              className="font-mono text-sm"
              placeholder={t("pages.content_placeholder")}
              onChange={(e) => setContent(e.target.value)}
            />
          </TabsContent>
          <TabsContent value="preview">
            <div className="min-h-40 rounded-md border p-4">
              {content.trim() ? (
                <MarkdownReadonly>{content}</MarkdownReadonly>
              ) : (
                <p className="text-muted-foreground">
                  {t("pages.nothing_to_preview")}
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("common.note")} htmlFor="page-note">
          <Textarea
            id="page-note"
            value={note}
            rows={2}
            placeholder={t("pages.note_placeholder")}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <Field label={t("pages.source_url")} htmlFor="page-source">
          <Input
            id="page-source"
            type="url"
            value={sourceUrl}
            placeholder="https://"
            onChange={(e) => setSourceUrl(e.target.value)}
          />
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          {t("actions.cancel")}
        </Button>
        <ActionButton type="submit" loading={isCreating || isUpdating}>
          {page ? t("actions.save") : t("actions.create")}
        </ActionButton>
      </div>
    </form>
  );
}
