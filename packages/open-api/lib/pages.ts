import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import * as z from "zod";

import { zManipulatedTagSchema } from "@karakeep/shared/types/bookmarks";
import {
  zListPageTopicsResponseSchema,
  zNewPageRequestSchema,
  zPageSchema,
  zPageSortOrderSchema,
  zPageSummarySchema,
  zSetPageTagsRequestSchema,
  zUpdatePageRequestSchema,
} from "@karakeep/shared/types/pages";

import { BearerAuth } from "./common";
import { ErrorSchema, UnauthorizedResponse } from "./errors";
import { PaginationSchema } from "./pagination";

export const registry = new OpenAPIRegistry();

const PageSchema = zPageSchema.openapi("Page");
const PageSummarySchema = zPageSummarySchema.openapi("PageSummary");

export const PageIdSchema = registry.registerParameter(
  "PageId",
  z.string().openapi({
    param: {
      name: "pageId",
      in: "path",
    },
    description: "The unique identifier of the page.",
    example: "ieidlxygmwj87oxz5hxttoc8",
  }),
);

const ListIdParamSchema = z.string().openapi({
  param: {
    name: "listId",
    in: "path",
  },
  description: "The unique identifier of the list.",
  example: "ieidlxygmwj87oxz5hxttoc8",
});

const PageFiltersQuerySchema = z.object({
  topic: z
    .string()
    .optional()
    .describe("Only pages with this topic (case-insensitive)."),
  tag: z.string().optional().describe("Only pages with this tag name."),
  tagId: z.string().optional().describe("Only pages with this tag id."),
  listId: z.string().optional().describe("Only pages in this list."),
  favourited: z.boolean().optional().describe("Filter by favourited status."),
  archived: z
    .boolean()
    .optional()
    .describe(
      "Filter by archived status. When omitted, archived pages are hidden unless includeArchived is true.",
    ),
  includeArchived: z
    .boolean()
    .optional()
    .describe("Include archived pages when `archived` is not set."),
  sortOrder: zPageSortOrderSchema
    .optional()
    .describe("Sort by creation date. Defaults to 'desc' (newest first)."),
});

const pageNotFound = {
  description: "Page not found.",
  content: { "application/json": { schema: ErrorSchema } },
};

const pageResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: PageSchema } },
});

const security = [{ [BearerAuth.name]: [] }];

registry.registerPath({
  operationId: "listPages",
  method: "get",
  path: "/pages",
  description:
    "Retrieve a paginated list of pages (without their markdown content), newest first by default. Supports filtering by topic, tag, list, favourited/archived status and a text query.",
  summary: "Get all pages",
  tags: ["Pages"],
  security,
  request: {
    query: PageFiltersQuerySchema.extend({
      q: z
        .string()
        .optional()
        .describe(
          "Case-insensitive substring match on title, description, content and topic.",
        ),
    }).merge(PaginationSchema),
  },
  responses: {
    200: {
      description: "A paginated list of pages.",
      content: {
        "application/json": {
          schema: z.object({
            pages: z.array(PageSummarySchema),
            nextCursor: z
              .string()
              .nullable()
              .describe(
                "Cursor for the next page, or null if no more results.",
              ),
          }),
        },
      },
    },
    401: UnauthorizedResponse,
  },
});

registry.registerPath({
  operationId: "createPage",
  method: "post",
  path: "/pages",
  description:
    "Create a new page. The cover image can be an external URL (stored and hotlinked as-is), base64 image bytes or the id of an asset uploaded via POST /assets.",
  summary: "Create a new page",
  tags: ["Pages"],
  security,
  request: {
    body: {
      description: "The page to create.",
      content: { "application/json": { schema: zNewPageRequestSchema } },
    },
  },
  responses: {
    201: pageResponse("The created page."),
    400: {
      description: "Bad request — invalid input or unsupported image.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    401: UnauthorizedResponse,
  },
});

registry.registerPath({
  operationId: "searchPages",
  method: "get",
  path: "/pages/search",
  description:
    "Search pages with a case-insensitive substring match on title, description, content and topic. Accepts the same filters as listing pages.",
  summary: "Search pages",
  tags: ["Pages"],
  security,
  request: {
    query: PageFiltersQuerySchema.extend({
      q: z.string().describe("The text to search for."),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of results (default 20, max 100)."),
    }),
  },
  responses: {
    200: {
      description: "The matching pages.",
      content: {
        "application/json": {
          schema: z.object({ pages: z.array(PageSummarySchema) }),
        },
      },
    },
    401: UnauthorizedResponse,
  },
});

registry.registerPath({
  operationId: "listPageTopics",
  method: "get",
  path: "/pages/topics",
  description:
    "List the distinct page topics with the number of pages in each, most used first.",
  summary: "Get page topics",
  tags: ["Pages"],
  security,
  responses: {
    200: {
      description: "The page topics.",
      content: {
        "application/json": { schema: zListPageTopicsResponseSchema },
      },
    },
    401: UnauthorizedResponse,
  },
});

registry.registerPath({
  operationId: "getPage",
  method: "get",
  path: "/pages/{pageId}",
  description:
    "Retrieve a single page, including its markdown content and tags.",
  summary: "Get a single page",
  tags: ["Pages"],
  security,
  request: { params: z.object({ pageId: PageIdSchema }) },
  responses: {
    200: pageResponse("The requested page."),
    401: UnauthorizedResponse,
    404: pageNotFound,
  },
});

registry.registerPath({
  operationId: "updatePage",
  method: "patch",
  path: "/pages/{pageId}",
  description:
    "Update a page. Only the provided fields are changed. Pass `image: null` to remove the cover image.",
  summary: "Update a page",
  tags: ["Pages"],
  security,
  request: {
    params: z.object({ pageId: PageIdSchema }),
    body: {
      description: "The fields to update.",
      content: {
        "application/json": {
          schema: zUpdatePageRequestSchema.omit({ pageId: true }),
        },
      },
    },
  },
  responses: {
    200: pageResponse("The updated page."),
    401: UnauthorizedResponse,
    404: pageNotFound,
  },
});

registry.registerPath({
  operationId: "deletePage",
  method: "delete",
  path: "/pages/{pageId}",
  description: "Delete a page and its uploaded cover image, if any.",
  summary: "Delete a page",
  tags: ["Pages"],
  security,
  request: { params: z.object({ pageId: PageIdSchema }) },
  responses: {
    204: { description: "No content — the page was deleted successfully." },
    401: UnauthorizedResponse,
    404: pageNotFound,
  },
});

registry.registerPath({
  operationId: "setPageTags",
  method: "put",
  path: "/pages/{pageId}/tags",
  description:
    "Replace the page's tags with the given tag names. Missing tags are created.",
  summary: "Replace the tags of a page",
  tags: ["Pages"],
  security,
  request: {
    params: z.object({ pageId: PageIdSchema }),
    body: {
      description: "The new set of tag names.",
      content: {
        "application/json": {
          schema: zSetPageTagsRequestSchema.omit({ pageId: true }),
        },
      },
    },
  },
  responses: {
    200: pageResponse("The updated page."),
    401: UnauthorizedResponse,
    404: pageNotFound,
  },
});

registry.registerPath({
  operationId: "attachTagsToPage",
  method: "post",
  path: "/pages/{pageId}/tags",
  description:
    "Attach tags to a page, by id or name. Tags that don't exist yet are created.",
  summary: "Attach tags to a page",
  tags: ["Pages"],
  security,
  request: {
    params: z.object({ pageId: PageIdSchema }),
    body: {
      description: "The tags to attach.",
      content: {
        "application/json": {
          schema: z.object({ tags: z.array(zManipulatedTagSchema) }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The ids of the attached tags.",
      content: {
        "application/json": {
          schema: z.object({ attached: z.array(z.string()) }),
        },
      },
    },
    401: UnauthorizedResponse,
    404: pageNotFound,
  },
});

registry.registerPath({
  operationId: "detachTagsFromPage",
  method: "delete",
  path: "/pages/{pageId}/tags",
  description: "Detach tags from a page, by id or name.",
  summary: "Detach tags from a page",
  tags: ["Pages"],
  security,
  request: {
    params: z.object({ pageId: PageIdSchema }),
    body: {
      description: "The tags to detach.",
      content: {
        "application/json": {
          schema: z.object({ tags: z.array(zManipulatedTagSchema) }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The ids of the detached tags.",
      content: {
        "application/json": {
          schema: z.object({ detached: z.array(z.string()) }),
        },
      },
    },
    401: UnauthorizedResponse,
    404: pageNotFound,
  },
});

registry.registerPath({
  operationId: "getPageLists",
  method: "get",
  path: "/pages/{pageId}/lists",
  description: "Get the lists that a page belongs to.",
  summary: "Get the lists of a page",
  tags: ["Pages"],
  security,
  request: { params: z.object({ pageId: PageIdSchema }) },
  responses: {
    200: {
      description: "The lists containing the page.",
      content: {
        "application/json": {
          schema: z.object({
            lists: z.array(
              z.object({ id: z.string(), name: z.string(), icon: z.string() }),
            ),
          }),
        },
      },
    },
    401: UnauthorizedResponse,
    404: pageNotFound,
  },
});

registry.registerPath({
  operationId: "addPageToList",
  method: "put",
  path: "/pages/{pageId}/lists/{listId}",
  description:
    "Add a page to a manual list. Idempotent — adding a page that's already in the list has no effect.",
  summary: "Add a page to a list",
  tags: ["Pages"],
  security,
  request: {
    params: z.object({ pageId: PageIdSchema, listId: ListIdParamSchema }),
  },
  responses: {
    204: { description: "No content — the page was added to the list." },
    400: {
      description: "The list is not a manual list.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    401: UnauthorizedResponse,
    404: {
      description: "Page or list not found.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

registry.registerPath({
  operationId: "removePageFromList",
  method: "delete",
  path: "/pages/{pageId}/lists/{listId}",
  description: "Remove a page from a list.",
  summary: "Remove a page from a list",
  tags: ["Pages"],
  security,
  request: {
    params: z.object({ pageId: PageIdSchema, listId: ListIdParamSchema }),
  },
  responses: {
    204: { description: "No content — the page was removed from the list." },
    400: {
      description: "The page is not in the list.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    401: UnauthorizedResponse,
    404: pageNotFound,
  },
});
