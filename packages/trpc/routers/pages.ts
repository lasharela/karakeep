import { experimental_trpcMiddleware } from "@trpc/server";
import { z } from "zod";

import {
  zListPagesRequestSchema,
  zListPagesResponseSchema,
  zListPageTopicsResponseSchema,
  zNewPageRequestSchema,
  zPageSchema,
  zSearchPagesRequestSchema,
  zSearchPagesResponseSchema,
  zSetPageTagsRequestSchema,
  zUpdatePageRequestSchema,
  zUpdatePageTagsRequestSchema,
} from "@karakeep/shared/types/pages";

import type { AuthedContext } from "../index";
import { createScopedAuthedProcedure, router } from "../index";
import { Page } from "../models/pages";

// Pages piggyback on the bookmarks API key scope rather than introducing a new
// scope resource, which would touch the shared scope list and the key UI.
const pagesProcedure = createScopedAuthedProcedure("bookmarks");

const ensurePageOwnership = experimental_trpcMiddleware<{
  ctx: AuthedContext;
  input: { pageId: string };
}>().create(async (opts) => {
  const page = await Page.fromId(opts.ctx, opts.input.pageId);
  return opts.next({
    ctx: {
      ...opts.ctx,
      page,
    },
  });
});

const zPageIdInput = z.object({ pageId: z.string() });
const zPageListInput = z.object({ pageId: z.string(), listId: z.string() });

export const pagesAppRouter = router({
  create: pagesProcedure
    .input(zNewPageRequestSchema)
    .output(zPageSchema)
    .mutation(async ({ input, ctx }) => {
      const page = await Page.create(ctx, input);
      return await page.toZPage();
    }),

  get: pagesProcedure
    .input(zPageIdInput)
    .output(zPageSchema)
    .use(ensurePageOwnership)
    .query(async ({ ctx }) => {
      return await ctx.page.toZPage();
    }),

  list: pagesProcedure
    .input(zListPagesRequestSchema)
    .output(zListPagesResponseSchema)
    .query(async ({ input, ctx }) => {
      return await Page.list(ctx, input);
    }),

  search: pagesProcedure
    .input(zSearchPagesRequestSchema)
    .output(zSearchPagesResponseSchema)
    .query(async ({ input, ctx }) => {
      const res = await Page.list(ctx, input);
      return { pages: res.pages };
    }),

  update: pagesProcedure
    .input(zUpdatePageRequestSchema)
    .output(zPageSchema)
    .use(ensurePageOwnership)
    .mutation(async ({ input, ctx }) => {
      const { pageId: _pageId, ...rest } = input;
      await ctx.page.update(rest);
      return await ctx.page.toZPage();
    }),

  updateTags: pagesProcedure
    .input(zUpdatePageTagsRequestSchema)
    .output(
      z.object({
        attached: z.array(z.string()),
        detached: z.array(z.string()),
      }),
    )
    .use(ensurePageOwnership)
    .mutation(async ({ input, ctx }) => {
      return await ctx.page.updateTags(input);
    }),

  setTags: pagesProcedure
    .input(zSetPageTagsRequestSchema)
    .output(zPageSchema)
    .use(ensurePageOwnership)
    .mutation(async ({ input, ctx }) => {
      await ctx.page.setTags(input.tags);
      return await ctx.page.toZPage();
    }),

  delete: pagesProcedure
    .input(zPageIdInput)
    .use(ensurePageOwnership)
    .mutation(async ({ ctx }) => {
      await ctx.page.delete();
    }),

  addToList: pagesProcedure
    .input(zPageListInput)
    .use(ensurePageOwnership)
    .mutation(async ({ input, ctx }) => {
      await ctx.page.addToList(input.listId);
    }),

  removeFromList: pagesProcedure
    .input(zPageListInput)
    .use(ensurePageOwnership)
    .mutation(async ({ input, ctx }) => {
      await ctx.page.removeFromList(input.listId);
    }),

  getListsOfPage: pagesProcedure
    .input(zPageIdInput)
    .output(
      z.object({
        lists: z.array(
          z.object({ id: z.string(), name: z.string(), icon: z.string() }),
        ),
      }),
    )
    .use(ensurePageOwnership)
    .query(async ({ ctx }) => {
      return { lists: await ctx.page.getLists() };
    }),

  listTopics: pagesProcedure
    .output(zListPageTopicsResponseSchema)
    .query(async ({ ctx }) => {
      return { topics: await Page.listTopics(ctx) };
    }),
});
