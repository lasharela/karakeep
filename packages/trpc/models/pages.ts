import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  getTableColumns,
  gt,
  inArray,
  isNotNull,
  lt,
  or,
  sql,
  SQL,
} from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";

import {
  assets,
  AssetTypes,
  bookmarkLists,
  bookmarkTags,
  pages,
  pagesInLists,
  tagsOnPages,
} from "@karakeep/db/schema";
import {
  newAssetId,
  QuotaService,
  StorageQuotaError,
} from "@karakeep/shared-server";
import { IMAGE_ASSET_TYPES } from "@karakeep/shared/assetdb";
import serverConfig from "@karakeep/shared/config";
import type {
  ZListPagesResponse,
  ZNewPageRequest,
  ZPage,
  ZPageCursor,
  ZPageFilters,
  ZPageImageInput,
  ZPageSummary,
  ZUpdatePageRequest,
} from "@karakeep/shared/types/pages";
import type { ZBookmarkTags } from "@karakeep/shared/types/tags";
import { normalizeTagName } from "@karakeep/shared/utils/tag";

import type { AuthedContext } from "..";
import {
  deletePageImageBytes,
  savePageImageBytes,
} from "../lib/pageImageStore";
import { List } from "./lists";

type PageRow = typeof pages.$inferSelect;
type PageSummaryRow = Omit<PageRow, "content">;

// Everything but the markdown body, for list/search results.
const { content: _content, ...summaryColumns } = getTableColumns(pages);

interface ImageColumns {
  imageUrl: string | null;
  imageAssetId: string | null;
}

/** Mirrors the SQL `normalizedName` column on bookmarkTags. */
function normalizedTagKey(name: string) {
  return name.toLowerCase().replace(/[ \-_]/g, "");
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Sniffs the image formats we accept (IMAGE_ASSET_TYPES) from magic bytes.
function sniffImageType(bytes: Buffer): string | null {
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return bytes[2] === 0xff ? "image/jpeg" : null;
  }
  if (bytes.length >= 6 && bytes.subarray(0, 4).toString("ascii") === "GIF8") {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export class Page {
  private constructor(
    private ctx: AuthedContext,
    public page: PageRow,
  ) {}

  /** Loads a page owned by the current user, NOT_FOUND otherwise. */
  static async fromId(ctx: AuthedContext, pageId: string): Promise<Page> {
    const page = await ctx.db.query.pages.findFirst({
      where: and(eq(pages.id, pageId), eq(pages.userId, ctx.user.id)),
    });
    if (!page) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
    }
    return new Page(ctx, page);
  }

  static async create(ctx: AuthedContext, input: ZNewPageRequest) {
    const image = input.image
      ? await Page.resolveImage(ctx, input.image)
      : { imageUrl: null, imageAssetId: null };

    let page: PageRow;
    try {
      [page] = await ctx.db
        .insert(pages)
        .values({
          userId: ctx.user.id,
          title: input.title,
          description: input.description ?? null,
          content: input.content ?? "",
          note: input.note ?? null,
          topic: input.topic ?? null,
          sourceUrl: input.sourceUrl ?? null,
          favourited: input.favourited ?? false,
          archived: input.archived ?? false,
          ...image,
        })
        .returning();
    } catch (e) {
      if (image.imageAssetId) {
        await Page.deleteImageAsset(ctx, image.imageAssetId);
      }
      throw e;
    }

    const p = new Page(ctx, page);
    if (input.tags && input.tags.length > 0) {
      await p.updateTags({
        attach: input.tags.map((tagName) => ({ tagName })),
        detach: [],
      });
    }
    return p;
  }

  async update(input: Omit<ZUpdatePageRequest, "pageId">) {
    let image: ImageColumns | undefined;
    if (input.image === null) {
      image = { imageUrl: null, imageAssetId: null };
    } else if (input.image !== undefined) {
      image = await Page.resolveImage(this.ctx, input.image);
    }
    const previousAssetId = this.page.imageAssetId;

    const [updated] = await this.ctx.db
      .update(pages)
      .set({
        title: input.title,
        description: input.description,
        content: input.content,
        note: input.note,
        topic: input.topic,
        sourceUrl: input.sourceUrl,
        favourited: input.favourited,
        archived: input.archived,
        ...image,
        modifiedAt: new Date(),
      })
      .where(
        and(eq(pages.id, this.page.id), eq(pages.userId, this.ctx.user.id)),
      )
      .returning();
    this.page = updated;

    if (image && previousAssetId && previousAssetId !== updated.imageAssetId) {
      await Page.deleteImageAsset(this.ctx, previousAssetId);
    }
  }

  async delete() {
    await this.ctx.db
      .delete(pages)
      .where(
        and(eq(pages.id, this.page.id), eq(pages.userId, this.ctx.user.id)),
      );
    if (this.page.imageAssetId) {
      await Page.deleteImageAsset(this.ctx, this.page.imageAssetId);
    }
  }

  async toZPage(): Promise<ZPage> {
    const tags = await Page.fetchTags(this.ctx, [this.page.id]);
    return { ...this.page, tags: tags.get(this.page.id) ?? [] };
  }

  // Tags

  /**
   * Attaches/detaches tags, creating missing tags (by name) for the user.
   * Mirrors bookmarks.updateTags. Returns the attached/detached tag ids.
   */
  async updateTags(input: {
    attach: { tagId?: string; tagName?: string; attachedBy?: "ai" | "human" }[];
    detach: { tagId?: string; tagName?: string }[];
  }): Promise<{ attached: string[]; detached: string[] }> {
    const attach = input.attach.map((t) => ({
      tagId: t.tagId,
      tagName: t.tagName ? normalizeTagName(t.tagName).trim() : undefined,
      attachedBy: t.attachedBy ?? "human",
    }));

    const newNames = attach.flatMap((t) =>
      t.tagName && t.tagName.length > 0 ? [t.tagName] : [],
    );
    if (newNames.length > 0) {
      await this.ctx.db
        .insert(bookmarkTags)
        .values(newNames.map((name) => ({ name, userId: this.ctx.user.id })))
        .onConflictDoNothing();
    }

    const [toAttach, toDetach] = await Promise.all([
      this.resolveTagIds(attach),
      this.resolveTagIds(input.detach),
    ]);
    const attachedByOf = (tag: { id: string; name: string }) =>
      attach.find((t) => t.tagId === tag.id || t.tagName === tag.name)
        ?.attachedBy ?? "human";

    const attachIds = toAttach.map((t) => t.id);
    const detachIds = toDetach.map((t) => t.id);

    await this.ctx.db.transaction((tx) => {
      if (detachIds.length > 0) {
        tx.delete(tagsOnPages)
          .where(
            and(
              eq(tagsOnPages.pageId, this.page.id),
              inArray(tagsOnPages.tagId, detachIds),
            ),
          )
          .run();
      }
      if (toAttach.length > 0) {
        tx.insert(tagsOnPages)
          .values(
            toAttach.map((t) => ({
              pageId: this.page.id,
              tagId: t.id,
              attachedBy: attachedByOf(t),
            })),
          )
          .onConflictDoNothing()
          .run();
      }
      tx.update(pages)
        .set({ modifiedAt: new Date() })
        .where(eq(pages.id, this.page.id))
        .run();
    });

    return { attached: attachIds, detached: detachIds };
  }

  /** Replaces the page's tag set with the given tag names. */
  async setTags(tagNames: string[]) {
    const wanted = new Set(
      tagNames.map((n) => normalizeTagName(n).trim()).filter((n) => n),
    );
    const current = (await Page.fetchTags(this.ctx, [this.page.id])).get(
      this.page.id,
    );
    await this.updateTags({
      attach: [...wanted].map((tagName) => ({ tagName })),
      detach: (current ?? [])
        .filter((t) => !wanted.has(t.name))
        .map((t) => ({ tagId: t.id })),
    });
  }

  private async resolveTagIds(
    identifiers: { tagId?: string; tagName?: string }[],
  ): Promise<{ id: string; name: string }[]> {
    const ids = identifiers.flatMap((t) => (t.tagId ? [t.tagId] : []));
    const names = identifiers.flatMap((t) => (t.tagName ? [t.tagName] : []));
    if (ids.length === 0 && names.length === 0) {
      return [];
    }
    const conditions: SQL[] = [];
    if (ids.length > 0) {
      conditions.push(inArray(bookmarkTags.id, ids));
    }
    if (names.length > 0) {
      conditions.push(inArray(bookmarkTags.name, names));
    }
    return this.ctx.db
      .select({ id: bookmarkTags.id, name: bookmarkTags.name })
      .from(bookmarkTags)
      .where(and(eq(bookmarkTags.userId, this.ctx.user.id), or(...conditions)));
  }

  // Lists

  async addToList(listId: string) {
    const list = await List.fromId(this.ctx, listId);
    if (list.type !== "manual") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Pages can only be added to manual lists",
      });
    }
    list.ensureCanEdit();
    await this.ctx.db
      .insert(pagesInLists)
      .values({ pageId: this.page.id, listId })
      .onConflictDoNothing();
  }

  async removeFromList(listId: string) {
    const res = await this.ctx.db
      .delete(pagesInLists)
      .where(
        and(
          eq(pagesInLists.pageId, this.page.id),
          eq(pagesInLists.listId, listId),
        ),
      );
    if (res.changes === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Page ${this.page.id} is already not in list ${listId}`,
      });
    }
  }

  async getLists() {
    return this.ctx.db
      .select({
        id: bookmarkLists.id,
        name: bookmarkLists.name,
        icon: bookmarkLists.icon,
      })
      .from(pagesInLists)
      .innerJoin(bookmarkLists, eq(bookmarkLists.id, pagesInLists.listId))
      .where(eq(pagesInLists.pageId, this.page.id))
      .orderBy(asc(bookmarkLists.name));
  }

  // Queries

  static async list(
    ctx: AuthedContext,
    input: ZPageFilters & {
      sortOrder: "asc" | "desc";
      cursor?: ZPageCursor | null;
      limit: number;
    },
  ): Promise<ZListPagesResponse> {
    const conditions: (SQL | undefined)[] = [eq(pages.userId, ctx.user.id)];

    if (input.topic !== undefined) {
      conditions.push(
        sql`lower(${pages.topic}) = lower(${input.topic.trim()})`,
      );
    }
    if (input.favourited !== undefined) {
      conditions.push(eq(pages.favourited, input.favourited));
    }
    if (input.archived !== undefined) {
      conditions.push(eq(pages.archived, input.archived));
    } else if (!input.includeArchived) {
      conditions.push(eq(pages.archived, false));
    }
    if (input.tagId !== undefined || input.tagName !== undefined) {
      const tagConditions: SQL[] = [eq(tagsOnPages.pageId, pages.id)];
      if (input.tagId !== undefined) {
        tagConditions.push(eq(bookmarkTags.id, input.tagId));
      }
      if (input.tagName !== undefined) {
        tagConditions.push(
          eq(bookmarkTags.normalizedName, normalizedTagKey(input.tagName)),
        );
      }
      conditions.push(
        exists(
          ctx.db
            .select({ one: sql`1` })
            .from(tagsOnPages)
            .innerJoin(bookmarkTags, eq(bookmarkTags.id, tagsOnPages.tagId))
            .where(and(...tagConditions)),
        ),
      );
    }
    if (input.listId !== undefined) {
      conditions.push(
        exists(
          ctx.db
            .select({ one: sql`1` })
            .from(pagesInLists)
            .where(
              and(
                eq(pagesInLists.pageId, pages.id),
                eq(pagesInLists.listId, input.listId),
              ),
            ),
        ),
      );
    }
    const query = input.query?.trim();
    if (query) {
      // SQLite's LIKE is case-insensitive for ASCII.
      const pattern = `%${escapeLike(query)}%`;
      const likeEscaped = (col: SQLWrapper) =>
        sql`${col} LIKE ${pattern} ESCAPE '\\'`;
      conditions.push(
        or(
          likeEscaped(pages.title),
          likeEscaped(pages.description),
          likeEscaped(pages.content),
          likeEscaped(pages.topic),
        ),
      );
    }
    if (input.cursor) {
      const cmp = input.sortOrder === "asc" ? gt : lt;
      conditions.push(
        or(
          cmp(pages.createdAt, input.cursor.createdAt),
          and(
            eq(pages.createdAt, input.cursor.createdAt),
            cmp(pages.id, input.cursor.id),
          ),
        ),
      );
    }

    const order = input.sortOrder === "asc" ? asc : desc;
    const rows: PageSummaryRow[] = await ctx.db
      .select(summaryColumns)
      .from(pages)
      .where(and(...conditions))
      .orderBy(order(pages.createdAt), order(pages.id))
      .limit(input.limit + 1);

    let nextCursor: ZPageCursor | null = null;
    if (rows.length > input.limit) {
      rows.pop();
      const last = rows[rows.length - 1];
      nextCursor = { createdAt: last.createdAt, id: last.id };
    }

    const tags = await Page.fetchTags(
      ctx,
      rows.map((r) => r.id),
    );
    const summaries: ZPageSummary[] = rows.map((r) => ({
      ...r,
      tags: tags.get(r.id) ?? [],
    }));
    return { pages: summaries, nextCursor };
  }

  static async listTopics(ctx: AuthedContext) {
    const rows = await ctx.db
      .select({ topic: pages.topic, count: count() })
      .from(pages)
      .where(and(eq(pages.userId, ctx.user.id), isNotNull(pages.topic)))
      .groupBy(pages.topic)
      .orderBy(desc(count()), asc(pages.topic));
    return rows.flatMap((r) =>
      r.topic ? [{ topic: r.topic, count: r.count }] : [],
    );
  }

  private static async fetchTags(
    ctx: AuthedContext,
    pageIds: string[],
  ): Promise<Map<string, ZBookmarkTags[]>> {
    const result = new Map<string, ZBookmarkTags[]>();
    if (pageIds.length === 0) {
      return result;
    }
    const rows = await ctx.db
      .select({
        pageId: tagsOnPages.pageId,
        id: bookmarkTags.id,
        name: bookmarkTags.name,
        attachedBy: tagsOnPages.attachedBy,
      })
      .from(tagsOnPages)
      .innerJoin(bookmarkTags, eq(bookmarkTags.id, tagsOnPages.tagId))
      .where(inArray(tagsOnPages.pageId, pageIds))
      .orderBy(asc(bookmarkTags.name));
    for (const { pageId, ...tag } of rows) {
      const list = result.get(pageId) ?? [];
      list.push(tag);
      result.set(pageId, list);
    }
    return result;
  }

  // Images

  /**
   * Turns an image input into the page's image columns. URLs are stored as-is
   * (hotlinked, never fetched); bytes are stored as a `pageImage` asset.
   */
  private static async resolveImage(
    ctx: AuthedContext,
    input: ZPageImageInput,
  ): Promise<ImageColumns> {
    if ("url" in input) {
      return { imageUrl: input.url, imageAssetId: null };
    }
    if ("assetId" in input) {
      return {
        imageUrl: null,
        imageAssetId: await Page.claimUploadedAsset(ctx, input.assetId),
      };
    }
    return {
      imageUrl: null,
      imageAssetId: await Page.storeBase64Image(ctx, input),
    };
  }

  private static async storeBase64Image(
    ctx: AuthedContext,
    input: { base64: string; contentType: string; fileName?: string },
  ): Promise<string> {
    if (!IMAGE_ASSET_TYPES.has(input.contentType)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Unsupported image type: ${input.contentType}`,
      });
    }
    // Accept data URLs too, they're what agents tend to have at hand.
    const raw = input.base64.replace(/^data:[^,]*;base64,/, "");
    const maxBytes = serverConfig.maxAssetSizeMb * 1024 * 1024;
    // Rough pre-check before decoding to avoid allocating huge buffers.
    if ((raw.length * 3) / 4 > maxBytes + 4) {
      throw new TRPCError({
        code: "PAYLOAD_TOO_LARGE",
        message: "Image is too big",
      });
    }
    const bytes = Buffer.from(raw, "base64");
    if (bytes.byteLength > maxBytes) {
      throw new TRPCError({
        code: "PAYLOAD_TOO_LARGE",
        message: "Image is too big",
      });
    }
    // Trust the bytes, not the declared type.
    const contentType = sniffImageType(bytes);
    if (!contentType) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "The provided data is not a supported image",
      });
    }

    let quotaApproved;
    try {
      quotaApproved = await QuotaService.checkStorageQuota(
        ctx.db,
        ctx.user.id,
        bytes.byteLength,
      );
    } catch (e) {
      if (e instanceof StorageQuotaError) {
        throw new TRPCError({ code: "FORBIDDEN", message: e.message });
      }
      throw e;
    }

    const assetId = newAssetId();
    const fileName = input.fileName?.replace(/[^\x20-\x7E]/g, "_") ?? null;
    await savePageImageBytes({
      userId: ctx.user.id,
      assetId,
      bytes,
      contentType,
      fileName,
      quotaApproved,
    });
    try {
      await ctx.db.insert(assets).values({
        id: assetId,
        assetType: AssetTypes.PAGE_IMAGE,
        bookmarkId: null,
        userId: ctx.user.id,
        contentType,
        size: bytes.byteLength,
        fileName,
      });
    } catch (e) {
      await deletePageImageBytes(ctx.user.id, assetId);
      throw e;
    }
    return assetId;
  }

  /** Takes over an image uploaded through `POST /assets`. */
  private static async claimUploadedAsset(
    ctx: AuthedContext,
    assetId: string,
  ): Promise<string> {
    const asset = await ctx.db.query.assets.findFirst({
      where: and(eq(assets.id, assetId), eq(assets.userId, ctx.user.id)),
    });
    if (!asset) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Asset not found" });
    }
    if (
      asset.bookmarkId ||
      (asset.assetType !== AssetTypes.UNKNOWN &&
        asset.assetType !== AssetTypes.PAGE_IMAGE)
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This asset can't be used as a page image",
      });
    }
    if (!asset.contentType || !IMAGE_ASSET_TYPES.has(asset.contentType)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Page image asset must be an image",
      });
    }
    if (asset.assetType === AssetTypes.PAGE_IMAGE) {
      const usedBy = await ctx.db.query.pages.findFirst({
        where: eq(pages.imageAssetId, assetId),
        columns: { id: true },
      });
      if (usedBy) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This image is already used by another page",
        });
      }
    } else {
      await ctx.db
        .update(assets)
        .set({ assetType: AssetTypes.PAGE_IMAGE })
        .where(eq(assets.id, assetId));
    }
    return assetId;
  }

  private static async deleteImageAsset(ctx: AuthedContext, assetId: string) {
    await ctx.db
      .delete(assets)
      .where(
        and(
          eq(assets.id, assetId),
          eq(assets.userId, ctx.user.id),
          eq(assets.assetType, AssetTypes.PAGE_IMAGE),
        ),
      );
    await deletePageImageBytes(ctx.user.id, assetId);
  }
}
