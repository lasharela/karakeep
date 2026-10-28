import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { KarakeepAPISchemas } from "@karakeep/sdk";

import { karakeepClient, registerTool } from "./shared";
import { pickDefined, toMcpToolError } from "./utils";

// Pages are standalone markdown documents (recipes, how-tos, notes on a
// subject) with a cover image, a topic, tags and list membership. They're a
// separate entity from bookmarks but share the same tags and manual lists.

type PageSummary = KarakeepAPISchemas["PageSummary"];
type Page = KarakeepAPISchemas["Page"];

const text = (t: string): CallToolResult => ({
  content: [{ type: "text", text: t }],
});

/** Absolute URL for an uploaded cover image (needs the API key to fetch). */
function assetUrl(assetId: string) {
  return `${process.env.KARAKEEP_API_ADDR ?? ""}/api/assets/${assetId}`;
}

export function compactPage(
  page: PageSummary | Page,
  options: { imageUrl?: string } = {},
): string {
  const image =
    options.imageUrl ??
    page.imageUrl ??
    (page.imageAssetId ? assetUrl(page.imageAssetId) : "");
  let out = `Page ID: ${page.id}
Title: ${page.title}
Topic: ${page.topic ?? ""}
Description: ${page.description ?? ""}
Tags: ${page.tags.map((t) => t.name).join(", ")}
Favourited: ${page.favourited}
Archived: ${page.archived}
Image: ${image}
Source URL: ${page.sourceUrl ?? ""}
Note: ${page.note ?? ""}
Created at: ${page.createdAt}`;
  if ("content" in page) {
    out += `\nContent (markdown):\n${page.content}`;
  }
  return out;
}

// Shared field descriptions

const imageUrlField = z
  .string()
  .url()
  .optional()
  .describe(
    `URL of an image on the web to use as the cover. It's displayed directly (hotlinked), so use a stable, publicly reachable image URL. This is the preferred way to set an image.`,
  );
const imageBase64Field = z
  .string()
  .optional()
  .describe(
    `Base64-encoded image bytes (or a data: URL) to upload as the cover image. Use only when no image URL is available. Requires imageContentType.`,
  );
const imageContentTypeField = z
  .enum(["image/png", "image/jpeg", "image/webp", "image/gif"])
  .optional()
  .describe(`Content type of imageBase64.`);

type ImageInput =
  | { url: string }
  | { base64: string; contentType: string; fileName?: string };

function toImageInput(args: {
  imageUrl?: string;
  imageBase64?: string;
  imageContentType?: string;
}): ImageInput | { error: string } | undefined {
  if (args.imageUrl && args.imageBase64) {
    return { error: "Pass either imageUrl or imageBase64, not both." };
  }
  if (args.imageUrl) {
    return { url: args.imageUrl };
  }
  if (args.imageBase64) {
    if (!args.imageContentType) {
      return { error: "imageContentType is required with imageBase64." };
    }
    return { base64: args.imageBase64, contentType: args.imageContentType };
  }
  return undefined;
}

const listFiltersSchema = {
  topic: z
    .string()
    .optional()
    .describe(`Only pages with this topic (case-insensitive).`),
  tag: z.string().optional().describe(`Only pages with this tag name.`),
  listId: z.string().trim().optional().describe(`Only pages in this list.`),
  favourited: z
    .boolean()
    .optional()
    .describe(`Only favourited (true) or non-favourited (false) pages.`),
  archived: z
    .boolean()
    .optional()
    .describe(
      `Only archived (true) or non-archived (false) pages. By default archived pages are hidden.`,
    ),
  sortOrder: z
    .enum(["desc", "asc"])
    .optional()
    .describe(`'desc' (newest first, default) or 'asc' (oldest first).`),
};

// create-page

export const createPageInputSchema = {
  title: z.string().min(1).max(500).describe(`The page title.`),
  description: z
    .string()
    .max(2000)
    .optional()
    .describe(`A short summary (1-3 sentences) shown on the page card.`),
  content: z
    .string()
    .optional()
    .describe(`The page body in markdown. Headings, lists, tables are fine.`),
  topic: z
    .string()
    .optional()
    .describe(
      `A broad category, e.g. "recipes", "how-to", "travel". Reuse existing topics (see list-page-topics) where they fit.`,
    ),
  tags: z
    .array(z.string())
    .optional()
    .describe(`Tag names. Missing tags are created.`),
  sourceUrl: z
    .string()
    .url()
    .optional()
    .describe(`The original source / inspiration, if any.`),
  note: z.string().optional().describe(`A personal note about the page.`),
  imageUrl: imageUrlField,
  imageBase64: imageBase64Field,
  imageContentType: imageContentTypeField,
};

export type CreatePageInput = z.infer<
  z.ZodObject<typeof createPageInputSchema>
>;

export async function createPageHandler(
  input: CreatePageInput,
): Promise<CallToolResult> {
  const { imageUrl, imageBase64, imageContentType, ...rest } = input;
  const image = toImageInput({ imageUrl, imageBase64, imageContentType });
  if (image && "error" in image) {
    return toMcpToolError(image.error);
  }
  const res = await karakeepClient.POST("/pages", {
    body: { ...pickDefined(rest), title: rest.title, image },
  });
  if (!res.data) {
    return toMcpToolError(res.error);
  }
  return text(`Page created.\n${compactPage(stripContent(res.data))}`);
}

function stripContent(page: Page): PageSummary {
  const { content: _content, ...summary } = page;
  return summary;
}

registerTool(
  "create-page",
  {
    description: `Save a new page: a standalone, self-authored markdown document on any topic (a recipe, a how-to, notes on a subject). Give it a clear title, a short description, a topic, tags and ideally a cover image URL so it's easy to recognise. Returns the new page id.`,
    inputSchema: z.object(createPageInputSchema),
  },
  createPageHandler,
);

// get-page

export const getPageInputSchema = {
  pageId: z.string().trim().min(1).describe(`The id of the page.`),
};

export async function getPageHandler({
  pageId,
}: {
  pageId: string;
}): Promise<CallToolResult> {
  const res = await karakeepClient.GET("/pages/{pageId}", {
    params: { path: { pageId } },
  });
  if (!res.data) {
    return toMcpToolError(res.error);
  }
  // Uploaded images need auth; hand out a temporary public link instead.
  let imageUrl: string | undefined;
  if (!res.data.imageUrl && res.data.imageAssetId) {
    const signed = await karakeepClient.GET("/assets/{assetId}/signed-url", {
      params: { path: { assetId: res.data.imageAssetId } },
    });
    imageUrl = signed.data?.signedUrl;
  }
  return text(compactPage(res.data, { imageUrl }));
}

registerTool(
  "get-page",
  {
    description: `Get a page by id, including its full markdown content, tags and an absolute image URL.`,
    inputSchema: z.object(getPageInputSchema),
  },
  getPageHandler,
);

// list-pages

export const listPagesInputSchema = {
  ...listFiltersSchema,
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe(`Maximum number of pages to return (default 20).`),
  cursor: z
    .string()
    .min(1)
    .optional()
    .describe(`Cursor from a previous response to fetch the next page.`),
};

export type ListPagesInput = z.infer<z.ZodObject<typeof listPagesInputSchema>>;

export async function listPagesHandler(
  input: ListPagesInput,
): Promise<CallToolResult> {
  const res = await karakeepClient.GET("/pages", {
    params: { query: pickDefined(input) },
  });
  if (!res.data) {
    return toMcpToolError(res.error);
  }
  const cursorLine = res.data.nextCursor
    ? `\n\nNext page cursor: ${res.data.nextCursor}`
    : "";
  return text(
    (res.data.pages.length > 0
      ? res.data.pages.map((p) => compactPage(p)).join("\n\n")
      : "No pages found.") + cursorLine,
  );
}

registerTool(
  "list-pages",
  {
    description: `List pages (without their content), newest first. Filter by topic, tag, list, favourited or archived. Use get-page to read a page's content.`,
    inputSchema: z.object(listPagesInputSchema),
  },
  listPagesHandler,
);

// search-pages

export const searchPagesInputSchema = {
  query: z
    .string()
    .min(1)
    .describe(
      `Text to look for (case-insensitive substring match on title, description, content and topic).`,
    ),
  ...listFiltersSchema,
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe(`Maximum number of results (default 20).`),
};

export type SearchPagesInput = z.infer<
  z.ZodObject<typeof searchPagesInputSchema>
>;

export async function searchPagesHandler(
  input: SearchPagesInput,
): Promise<CallToolResult> {
  const { query, ...rest } = input;
  const res = await karakeepClient.GET("/pages/search", {
    params: { query: { q: query, ...pickDefined(rest) } },
  });
  if (!res.data) {
    return toMcpToolError(res.error);
  }
  return text(
    res.data.pages.length > 0
      ? res.data.pages.map((p) => compactPage(p)).join("\n\n")
      : "No pages found.",
  );
}

registerTool(
  "search-pages",
  {
    description: `Search pages by text. Accepts the same filters as list-pages. Returns pages without their content; use get-page to read one.`,
    inputSchema: z.object(searchPagesInputSchema),
  },
  searchPagesHandler,
);

// update-page

export const updatePageInputSchema = {
  pageId: z.string().trim().min(1).describe(`The id of the page to update.`),
  title: z.string().min(1).max(500).optional().describe(`New title.`),
  description: z.string().max(2000).optional().describe(`New description.`),
  content: z
    .string()
    .optional()
    .describe(`New markdown body. Replaces the whole content.`),
  topic: z
    .string()
    .optional()
    .describe(`New topic. Pass an empty string to clear it.`),
  sourceUrl: z.string().url().optional().describe(`New source URL.`),
  note: z.string().optional().describe(`New personal note.`),
  favourited: z.boolean().optional().describe(`Favourite / unfavourite.`),
  archived: z.boolean().optional().describe(`Archive / unarchive.`),
  imageUrl: imageUrlField,
  imageBase64: imageBase64Field,
  imageContentType: imageContentTypeField,
  removeImage: z
    .boolean()
    .optional()
    .describe(`Set to true to remove the cover image.`),
};

export type UpdatePageInput = z.infer<
  z.ZodObject<typeof updatePageInputSchema>
>;

export async function updatePageHandler(
  input: UpdatePageInput,
): Promise<CallToolResult> {
  const {
    pageId,
    imageUrl,
    imageBase64,
    imageContentType,
    removeImage,
    ...rest
  } = input;
  const image = toImageInput({ imageUrl, imageBase64, imageContentType });
  if (image && "error" in image) {
    return toMcpToolError(image.error);
  }
  if (removeImage && image) {
    return toMcpToolError("Pass either removeImage or a new image, not both.");
  }
  const res = await karakeepClient.PATCH("/pages/{pageId}", {
    params: { path: { pageId } },
    body: {
      ...pickDefined(rest),
      ...(removeImage ? { image: null } : image ? { image } : {}),
    },
  });
  if (!res.data) {
    return toMcpToolError(res.error);
  }
  return text(`Page updated.\n${compactPage(stripContent(res.data))}`);
}

registerTool(
  "update-page",
  {
    description: `Update a page. Only the fields you pass are changed. Use imageUrl to set a new cover image or removeImage to drop it.`,
    inputSchema: z.object(updatePageInputSchema),
  },
  updatePageHandler,
);

// set-page-tags

export const setPageTagsInputSchema = {
  pageId: z.string().trim().min(1).describe(`The id of the page.`),
  tags: z
    .array(z.string())
    .describe(`The complete new set of tag names. Missing tags are created.`),
};

export async function setPageTagsHandler({
  pageId,
  tags,
}: {
  pageId: string;
  tags: string[];
}): Promise<CallToolResult> {
  const res = await karakeepClient.PUT("/pages/{pageId}/tags", {
    params: { path: { pageId } },
    body: { tags },
  });
  if (!res.data) {
    return toMcpToolError(res.error);
  }
  return text(
    `Tags of page ${pageId} are now: ${res.data.tags.map((t) => t.name).join(", ")}`,
  );
}

registerTool(
  "set-page-tags",
  {
    description: `Replace all tags of a page with the given tag names.`,
    inputSchema: z.object(setPageTagsInputSchema),
  },
  setPageTagsHandler,
);

// attach-tag-to-page / detach-tag-from-page

export const pageTagsInputSchema = {
  pageId: z.string().trim().min(1).describe(`The id of the page.`),
  tags: z.array(z.string()).min(1).describe(`The tag names.`),
};

export async function attachTagsToPageHandler({
  pageId,
  tags,
}: {
  pageId: string;
  tags: string[];
}): Promise<CallToolResult> {
  const res = await karakeepClient.POST("/pages/{pageId}/tags", {
    params: { path: { pageId } },
    body: { tags: tags.map((tagName) => ({ tagName })) },
  });
  if (res.error) {
    return toMcpToolError(res.error);
  }
  return text(`Tags ${JSON.stringify(tags)} attached to page ${pageId}`);
}

registerTool(
  "attach-tag-to-page",
  {
    description: `Attach tags to a page, keeping its existing tags. Missing tags are created.`,
    inputSchema: z.object(pageTagsInputSchema),
  },
  attachTagsToPageHandler,
);

export async function detachTagsFromPageHandler({
  pageId,
  tags,
}: {
  pageId: string;
  tags: string[];
}): Promise<CallToolResult> {
  const res = await karakeepClient.DELETE("/pages/{pageId}/tags", {
    params: { path: { pageId } },
    body: { tags: tags.map((tagName) => ({ tagName })) },
  });
  if (res.error) {
    return toMcpToolError(res.error);
  }
  return text(`Tags ${JSON.stringify(tags)} detached from page ${pageId}`);
}

registerTool(
  "detach-tag-from-page",
  {
    description: `Detach tags from a page. The tags themselves are not deleted.`,
    inputSchema: z.object(pageTagsInputSchema),
  },
  detachTagsFromPageHandler,
);

// add-page-to-list / remove-page-from-list

export const pageListInputSchema = {
  pageId: z.string().trim().min(1).describe(`The id of the page.`),
  listId: z
    .string()
    .min(1)
    .describe(`The id of a manual list (see get-lists).`),
};

export async function addPageToListHandler({
  pageId,
  listId,
}: {
  pageId: string;
  listId: string;
}): Promise<CallToolResult> {
  const res = await karakeepClient.PUT("/pages/{pageId}/lists/{listId}", {
    params: { path: { pageId, listId } },
  });
  if (res.error) {
    return toMcpToolError(res.error);
  }
  return text(`Page ${pageId} added to list ${listId}`);
}

registerTool(
  "add-page-to-list",
  {
    description: `Add a page to a manual list (the same lists bookmarks go into).`,
    inputSchema: z.object(pageListInputSchema),
  },
  addPageToListHandler,
);

export async function removePageFromListHandler({
  pageId,
  listId,
}: {
  pageId: string;
  listId: string;
}): Promise<CallToolResult> {
  const res = await karakeepClient.DELETE("/pages/{pageId}/lists/{listId}", {
    params: { path: { pageId, listId } },
  });
  if (res.error) {
    return toMcpToolError(res.error);
  }
  return text(`Page ${pageId} removed from list ${listId}`);
}

registerTool(
  "remove-page-from-list",
  {
    description: `Remove a page from a list.`,
    inputSchema: z.object(pageListInputSchema),
  },
  removePageFromListHandler,
);

// list-page-topics

export async function listPageTopicsHandler(): Promise<CallToolResult> {
  const res = await karakeepClient.GET("/pages/topics");
  if (!res.data) {
    return toMcpToolError(res.error);
  }
  return text(
    res.data.topics.length > 0
      ? res.data.topics.map((t) => `${t.topic} (${t.count})`).join("\n")
      : "No topics yet.",
  );
}

registerTool(
  "list-page-topics",
  {
    description: `List the topics used by pages, with the number of pages in each. Check this before creating a page to reuse an existing topic.`,
  },
  listPageTopicsHandler,
);

// delete-page

export async function deletePageHandler({
  pageId,
}: {
  pageId: string;
}): Promise<CallToolResult> {
  const res = await karakeepClient.DELETE("/pages/{pageId}", {
    params: { path: { pageId } },
  });
  if (res.error) {
    return toMcpToolError(res.error);
  }
  return text(`Page ${pageId} deleted.`);
}

registerTool(
  "delete-page",
  {
    description: `Permanently delete a page and its uploaded cover image.`,
    inputSchema: z.object(getPageInputSchema),
  },
  deletePageHandler,
);
