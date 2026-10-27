import { z } from "zod";

import { zManipulatedTagSchema } from "./bookmarks";
import { zBookmarkTagSchema } from "./tags";

// Pages are standalone, self-authored markdown documents (recipes, how-tos,
// notes on a subject). They share the tag vocabulary and the manual lists
// with bookmarks.

export const DEFAULT_NUM_PAGES_PER_PAGE = 20;
export const MAX_NUM_PAGES_PER_PAGE = 100;
export const MAX_PAGE_TITLE_LENGTH = 500;
export const MAX_PAGE_DESCRIPTION_LENGTH = 2000;
export const MAX_PAGE_TOPIC_LENGTH = 100;

const zHttpUrl = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((u) => /^https?:\/\//i.test(u), "Only http(s) URLs are allowed");

// An empty / whitespace-only topic means "no topic".
const zTopic = z
  .string()
  .trim()
  .max(MAX_PAGE_TOPIC_LENGTH)
  .transform((t) => (t.length > 0 ? t : null));

/**
 * How a page's cover image is provided:
 * - `url`: an external image that's stored as-is and hotlinked (never fetched).
 * - `base64`: raw image bytes, stored as a `pageImage` asset.
 * - `assetId`: an image previously uploaded through `POST /assets`.
 */
export const zPageImageInputSchema = z.union([
  z.object({ url: zHttpUrl }),
  z.object({
    base64: z.string().min(1),
    contentType: z.string().min(1),
    fileName: z.string().max(255).optional(),
  }),
  z.object({ assetId: z.string().min(1) }),
]);
export type ZPageImageInput = z.infer<typeof zPageImageInputSchema>;

export const zPageSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  content: z.string(),
  note: z.string().nullable(),
  topic: z.string().nullable(),
  imageUrl: z.string().nullable(),
  imageAssetId: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  favourited: z.boolean(),
  archived: z.boolean(),
  createdAt: z.date(),
  modifiedAt: z.date().nullable(),
  tags: z.array(zBookmarkTagSchema),
});
export type ZPage = z.infer<typeof zPageSchema>;

// Lists and search results don't carry the (potentially large) markdown body.
export const zPageSummarySchema = zPageSchema.omit({ content: true });
export type ZPageSummary = z.infer<typeof zPageSummarySchema>;

export const zNewPageRequestSchema = z.object({
  title: z.string().trim().min(1).max(MAX_PAGE_TITLE_LENGTH),
  description: z.string().max(MAX_PAGE_DESCRIPTION_LENGTH).optional(),
  content: z.string().optional(),
  note: z.string().optional(),
  topic: zTopic.optional(),
  sourceUrl: zHttpUrl.optional(),
  tags: z.array(z.string()).optional(),
  image: zPageImageInputSchema.optional(),
  favourited: z.boolean().optional(),
  archived: z.boolean().optional(),
});
export type ZNewPageRequest = z.infer<typeof zNewPageRequestSchema>;

export const zUpdatePageRequestSchema = z.object({
  pageId: z.string(),
  title: z.string().trim().min(1).max(MAX_PAGE_TITLE_LENGTH).optional(),
  description: z.string().max(MAX_PAGE_DESCRIPTION_LENGTH).nullish(),
  content: z.string().optional(),
  note: z.string().nullish(),
  topic: zTopic.nullish(),
  sourceUrl: zHttpUrl.nullish(),
  favourited: z.boolean().optional(),
  archived: z.boolean().optional(),
  // `null` removes the image, `undefined` leaves it untouched.
  image: zPageImageInputSchema.nullish(),
});
export type ZUpdatePageRequest = z.infer<typeof zUpdatePageRequestSchema>;

export const zPageSortOrderSchema = z.enum(["desc", "asc"]);

export const zPageCursorSchema = z.object({
  createdAt: z.date(),
  id: z.string(),
});
export type ZPageCursor = z.infer<typeof zPageCursorSchema>;

export const zPageFiltersSchema = z.object({
  topic: z.string().optional(),
  tagId: z.string().optional(),
  tagName: z.string().optional(),
  listId: z.string().optional(),
  favourited: z.boolean().optional(),
  // When set, only pages with this archived state are returned. When unset,
  // archived pages are hidden unless `includeArchived` is true.
  archived: z.boolean().optional(),
  includeArchived: z.boolean().optional(),
  // Case-insensitive substring match on title, description, content and topic.
  query: z.string().optional(),
});
export type ZPageFilters = z.infer<typeof zPageFiltersSchema>;

export const zListPagesRequestSchema = zPageFiltersSchema.extend({
  sortOrder: zPageSortOrderSchema.optional().default("desc"),
  cursor: zPageCursorSchema.nullish(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_NUM_PAGES_PER_PAGE)
    .optional()
    .default(DEFAULT_NUM_PAGES_PER_PAGE),
});
export type ZListPagesRequest = z.input<typeof zListPagesRequestSchema>;

export const zListPagesResponseSchema = z.object({
  pages: z.array(zPageSummarySchema),
  nextCursor: zPageCursorSchema.nullable(),
});
export type ZListPagesResponse = z.infer<typeof zListPagesResponseSchema>;

export const zSearchPagesRequestSchema = zPageFiltersSchema
  .omit({ query: true })
  .extend({
    query: z.string().trim().min(1),
    sortOrder: zPageSortOrderSchema.optional().default("desc"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_NUM_PAGES_PER_PAGE)
      .optional()
      .default(DEFAULT_NUM_PAGES_PER_PAGE),
  });

export const zSearchPagesResponseSchema = z.object({
  pages: z.array(zPageSummarySchema),
});

export const zUpdatePageTagsRequestSchema = z.object({
  pageId: z.string(),
  attach: z.array(zManipulatedTagSchema),
  detach: z.array(zManipulatedTagSchema),
});

export const zSetPageTagsRequestSchema = z.object({
  pageId: z.string(),
  tags: z.array(z.string()),
});

export const zPageTopicSchema = z.object({
  topic: z.string(),
  count: z.number(),
});

export const zListPageTopicsResponseSchema = z.object({
  topics: z.array(zPageTopicSchema),
});
