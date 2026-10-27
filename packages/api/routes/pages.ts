import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import { zManipulatedTagSchema } from "@karakeep/shared/types/bookmarks";
import {
  zNewPageRequestSchema,
  zPageSortOrderSchema,
  zSetPageTagsRequestSchema,
  zUpdatePageRequestSchema,
} from "@karakeep/shared/types/pages";

import { authMiddleware } from "../middlewares/auth";
import { adaptPagination, zPagination } from "../utils/pagination";
import { zStringBool } from "../utils/types";

// Query-string versions of the page filters.
const zPageFiltersQuerySchema = z.object({
  topic: z.string().optional(),
  tag: z.string().optional(),
  tagId: z.string().optional(),
  listId: z.string().optional(),
  favourited: zStringBool.optional(),
  archived: zStringBool.optional(),
  includeArchived: zStringBool.optional(),
  sortOrder: zPageSortOrderSchema.optional().default("desc"),
});

function toFilters(q: z.infer<typeof zPageFiltersQuerySchema>) {
  const { tag, ...rest } = q;
  return { ...rest, tagName: tag };
}

const app = new Hono()
  .use(authMiddleware)

  // GET /pages
  .get(
    "/",
    zValidator(
      "query",
      zPageFiltersQuerySchema
        .extend({ q: z.string().optional() })
        .extend(zPagination.shape),
    ),
    async (c) => {
      const { q, limit, cursor, ...filters } = c.req.valid("query");
      const res = await c.var.api.pages.list({
        ...toFilters(filters),
        query: q,
        limit,
        cursor,
      });
      return c.json(adaptPagination(res), 200);
    },
  )

  // POST /pages
  .post("/", zValidator("json", zNewPageRequestSchema), async (c) => {
    const body = c.req.valid("json");
    const page = await c.var.api.pages.create(body);
    return c.json(page, 201);
  })

  // GET /pages/search
  .get(
    "/search",
    zValidator(
      "query",
      zPageFiltersQuerySchema.extend({
        q: z.string().min(1),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      }),
    ),
    async (c) => {
      const { q, limit, ...filters } = c.req.valid("query");
      const res = await c.var.api.pages.search({
        ...toFilters(filters),
        query: q,
        limit,
      });
      return c.json(res, 200);
    },
  )

  // GET /pages/topics
  .get("/topics", async (c) => {
    const res = await c.var.api.pages.listTopics();
    return c.json(res, 200);
  })

  // GET /pages/[pageId]
  .get("/:pageId", async (c) => {
    const pageId = c.req.param("pageId");
    const page = await c.var.api.pages.get({ pageId });
    return c.json(page, 200);
  })

  // PATCH /pages/[pageId]
  .patch(
    "/:pageId",
    zValidator("json", zUpdatePageRequestSchema.omit({ pageId: true })),
    async (c) => {
      const pageId = c.req.param("pageId");
      const body = c.req.valid("json");
      const page = await c.var.api.pages.update({ pageId, ...body });
      return c.json(page, 200);
    },
  )

  // DELETE /pages/[pageId]
  .delete("/:pageId", async (c) => {
    const pageId = c.req.param("pageId");
    await c.var.api.pages.delete({ pageId });
    return c.body(null, 204);
  })

  // PUT /pages/[pageId]/tags
  .put(
    "/:pageId/tags",
    zValidator("json", zSetPageTagsRequestSchema.omit({ pageId: true })),
    async (c) => {
      const pageId = c.req.param("pageId");
      const body = c.req.valid("json");
      const page = await c.var.api.pages.setTags({ pageId, tags: body.tags });
      return c.json(page, 200);
    },
  )

  // POST /pages/[pageId]/tags
  .post(
    "/:pageId/tags",
    zValidator("json", z.object({ tags: z.array(zManipulatedTagSchema) })),
    async (c) => {
      const pageId = c.req.param("pageId");
      const body = c.req.valid("json");
      const resp = await c.var.api.pages.updateTags({
        pageId,
        attach: body.tags,
        detach: [],
      });
      return c.json({ attached: resp.attached }, 200);
    },
  )

  // DELETE /pages/[pageId]/tags
  .delete(
    "/:pageId/tags",
    zValidator("json", z.object({ tags: z.array(zManipulatedTagSchema) })),
    async (c) => {
      const pageId = c.req.param("pageId");
      const body = c.req.valid("json");
      const resp = await c.var.api.pages.updateTags({
        pageId,
        attach: [],
        detach: body.tags,
      });
      return c.json({ detached: resp.detached }, 200);
    },
  )

  // GET /pages/[pageId]/lists
  .get("/:pageId/lists", async (c) => {
    const pageId = c.req.param("pageId");
    const res = await c.var.api.pages.getListsOfPage({ pageId });
    return c.json(res, 200);
  })

  // PUT /pages/[pageId]/lists/[listId]
  .put("/:pageId/lists/:listId", async (c) => {
    const pageId = c.req.param("pageId");
    const listId = c.req.param("listId");
    await c.var.api.pages.addToList({ pageId, listId });
    return c.body(null, 204);
  })

  // DELETE /pages/[pageId]/lists/[listId]
  .delete("/:pageId/lists/:listId", async (c) => {
    const pageId = c.req.param("pageId");
    const listId = c.req.param("listId");
    await c.var.api.pages.removeFromList({ pageId, listId });
    return c.body(null, 204);
  });

export default app;
