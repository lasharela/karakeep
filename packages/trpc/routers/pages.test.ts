import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { assets, AssetTypes, pages } from "@karakeep/db/schema";

import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

// Keep image bytes out of the filesystem; we only care about the DB rows here.
const imageStoreMocks = vi.hoisted(() => ({
  savePageImageBytes: vi.fn(),
  deletePageImageBytes: vi.fn(),
}));
vi.mock("../lib/pageImageStore", () => imageStoreMocks);

beforeEach<CustomTestContext>(defaultBeforeEach(true));
beforeEach(() => {
  imageStoreMocks.savePageImageBytes.mockReset();
  imageStoreMocks.deletePageImageBytes.mockReset();
});

// A 1x1 transparent PNG.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("Pages Routes", () => {
  test<CustomTestContext>("create and get a page", async ({ apiCallers }) => {
    const api = apiCallers[0].pages;
    const created = await api.create({
      title: "Shakshuka",
      description: "Eggs poached in tomato sauce",
      content: "# Shakshuka\n\n1. Fry onions",
      topic: "recipes",
      sourceUrl: "https://example.com/shakshuka",
      tags: ["breakfast", "Eggs"],
      image: { url: "https://images.example.com/shakshuka.jpg" },
    });

    expect(created.title).toBe("Shakshuka");
    expect(created.topic).toBe("recipes");
    expect(created.imageUrl).toBe("https://images.example.com/shakshuka.jpg");
    expect(created.imageAssetId).toBeNull();
    expect(created.favourited).toBe(false);
    expect(created.archived).toBe(false);
    expect(created.tags.map((t) => t.name).sort()).toEqual([
      "Eggs",
      "breakfast",
    ]);

    const fetched = await api.get({ pageId: created.id });
    expect(fetched.content).toBe("# Shakshuka\n\n1. Fry onions");
    expect(fetched.description).toBe("Eggs poached in tomato sauce");
    expect(fetched.sourceUrl).toBe("https://example.com/shakshuka");
    expect(fetched.tags).toHaveLength(2);
    // URL images are hotlinked, never downloaded.
    expect(imageStoreMocks.savePageImageBytes).not.toHaveBeenCalled();
  });

  test<CustomTestContext>("pages share the tag vocabulary with bookmarks", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0];
    const tag = await api.tags.create({ name: "shared" });
    const page = await api.pages.create({ title: "p", tags: ["shared"] });
    expect(page.tags).toEqual([
      { id: tag.id, name: "shared", attachedBy: "human" },
    ]);
  });

  test<CustomTestContext>("ownership isolation between users", async ({
    apiCallers,
  }) => {
    const own = apiCallers[0].pages;
    const other = apiCallers[1].pages;
    const page = await own.create({ title: "Mine" });

    await expect(other.get({ pageId: page.id })).rejects.toThrow(/not found/i);
    await expect(
      other.update({ pageId: page.id, title: "Hacked" }),
    ).rejects.toThrow(/not found/i);
    await expect(other.delete({ pageId: page.id })).rejects.toThrow(
      /not found/i,
    );
    await expect(
      other.setTags({ pageId: page.id, tags: ["x"] }),
    ).rejects.toThrow(/not found/i);

    expect((await other.list({})).pages).toHaveLength(0);
    expect((await other.search({ query: "Mine" })).pages).toHaveLength(0);
    expect((await other.listTopics()).topics).toHaveLength(0);
    expect((await own.get({ pageId: page.id })).title).toBe("Mine");
  });

  test<CustomTestContext>("update fields", async ({ apiCallers }) => {
    const api = apiCallers[0].pages;
    const page = await api.create({
      title: "Old",
      description: "desc",
      topic: "notes",
    });

    const updated = await api.update({
      pageId: page.id,
      title: "New",
      description: null,
      content: "body",
      note: "my note",
      topic: "  ",
      favourited: true,
      archived: true,
    });
    expect(updated.title).toBe("New");
    expect(updated.description).toBeNull();
    expect(updated.content).toBe("body");
    expect(updated.note).toBe("my note");
    // Whitespace-only topic clears it.
    expect(updated.topic).toBeNull();
    expect(updated.favourited).toBe(true);
    expect(updated.archived).toBe(true);
  });

  test<CustomTestContext>("delete a page", async ({ apiCallers, db }) => {
    const api = apiCallers[0].pages;
    const page = await api.create({ title: "Bye" });
    await api.delete({ pageId: page.id });
    await expect(api.get({ pageId: page.id })).rejects.toThrow(/not found/i);
    expect(
      await db.query.pages.findFirst({ where: eq(pages.id, page.id) }),
    ).toBeUndefined();
  });

  describe("tags", () => {
    test<CustomTestContext>("setTags replaces the tag set", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0].pages;
      const page = await api.create({ title: "t", tags: ["a", "b"] });

      const res = await api.setTags({ pageId: page.id, tags: ["b", "c"] });
      expect(res.tags.map((t) => t.name).sort()).toEqual(["b", "c"]);

      const empty = await api.setTags({ pageId: page.id, tags: [] });
      expect(empty.tags).toHaveLength(0);
    });

    test<CustomTestContext>("updateTags attaches and detaches", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0].pages;
      const page = await api.create({ title: "t", tags: ["keep", "drop"] });

      const res = await api.updateTags({
        pageId: page.id,
        attach: [{ tagName: "new" }],
        detach: [{ tagName: "drop" }],
      });
      expect(res.attached).toHaveLength(1);
      expect(res.detached).toHaveLength(1);

      const fetched = await api.get({ pageId: page.id });
      expect(fetched.tags.map((t) => t.name).sort()).toEqual(["keep", "new"]);
    });

    test<CustomTestContext>("cannot attach another user's tag by id", async ({
      apiCallers,
    }) => {
      const otherTag = await apiCallers[1].tags.create({ name: "theirs" });
      const api = apiCallers[0].pages;
      const page = await api.create({ title: "t" });
      const res = await api.updateTags({
        pageId: page.id,
        attach: [{ tagId: otherTag.id }],
        detach: [],
      });
      expect(res.attached).toHaveLength(0);
      expect((await api.get({ pageId: page.id })).tags).toHaveLength(0);
    });

    test<CustomTestContext>("deleteUnused keeps tags used only by pages", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0];
      await api.pages.create({ title: "t", tags: ["page-only"] });
      await api.tags.create({ name: "unused" });

      const res = await api.tags.deleteUnused();
      expect(res.deletedTags).toBe(1);
      const page = (await api.pages.list({})).pages[0];
      expect(page.tags.map((t) => t.name)).toEqual(["page-only"]);
    });

    test<CustomTestContext>("merging tags moves page tags too", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0];
      const page = await api.pages.create({ title: "t", tags: ["from"] });
      const into = await api.tags.create({ name: "into" });
      const from = page.tags[0];

      await api.tags.merge({ intoTagId: into.id, fromTagIds: [from.id] });
      const fetched = await api.pages.get({ pageId: page.id });
      expect(fetched.tags.map((t) => t.id)).toEqual([into.id]);
    });
  });

  describe("lists", () => {
    test<CustomTestContext>("add to and remove from a manual list", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0];
      const list = await api.lists.create({
        name: "Cookbook",
        type: "manual",
        icon: "📚",
      });
      const page = await api.pages.create({ title: "in list" });
      await api.pages.create({ title: "not in list" });

      await api.pages.addToList({ pageId: page.id, listId: list.id });
      // Adding twice is a no-op.
      await api.pages.addToList({ pageId: page.id, listId: list.id });

      const lists = await api.pages.getListsOfPage({ pageId: page.id });
      expect(lists.lists.map((l) => l.id)).toEqual([list.id]);

      const inList = await api.pages.list({ listId: list.id });
      expect(inList.pages.map((p) => p.id)).toEqual([page.id]);

      await api.pages.removeFromList({ pageId: page.id, listId: list.id });
      expect((await api.pages.list({ listId: list.id })).pages).toHaveLength(0);
    });

    test<CustomTestContext>("rejects smart lists and other users' lists", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0];
      const page = await api.pages.create({ title: "p" });
      const smart = await api.lists.create({
        name: "Smart",
        type: "smart",
        icon: "🧠",
        query: "is:fav",
      });
      await expect(
        api.pages.addToList({ pageId: page.id, listId: smart.id }),
      ).rejects.toThrow(/manual/i);

      const othersList = await apiCallers[1].lists.create({
        name: "Theirs",
        type: "manual",
        icon: "🔒",
      });
      await expect(
        api.pages.addToList({ pageId: page.id, listId: othersList.id }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe("list and search", () => {
    test<CustomTestContext>("cursor pagination, newest first", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0].pages;
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        ids.push((await api.create({ title: `Page ${i}` })).id);
      }

      const seen: string[] = [];
      let cursor = null;
      let iterations = 0;
      do {
        const res: Awaited<ReturnType<typeof api.list>> = await api.list({
          limit: 2,
          cursor,
        });
        expect(res.pages.length).toBeLessThanOrEqual(2);
        seen.push(...res.pages.map((p) => p.id));
        cursor = res.nextCursor;
        iterations++;
      } while (cursor && iterations < 10);

      expect(iterations).toBe(3);
      expect(new Set(seen).size).toBe(5);
      expect([...seen].sort()).toEqual([...ids].sort());

      const asc = await api.list({ sortOrder: "asc", limit: 100 });
      const desc = await api.list({ sortOrder: "desc", limit: 100 });
      expect(asc.pages.map((p) => p.id)).toEqual(
        desc.pages.map((p) => p.id).reverse(),
      );
      // Summaries don't carry the markdown body.
      expect("content" in asc.pages[0]).toBe(false);
    });

    test<CustomTestContext>("filters", async ({ apiCallers }) => {
      const api = apiCallers[0].pages;
      const recipe = await api.create({
        title: "Pasta",
        topic: "Recipes",
        tags: ["italian"],
        favourited: true,
      });
      const note = await api.create({ title: "Rust notes", topic: "notes" });
      const archived = await api.create({
        title: "Old recipe",
        topic: "recipes",
        archived: true,
      });

      const ids = (r: { pages: { id: string }[] }) =>
        r.pages.map((p) => p.id).sort();

      // Archived pages are hidden by default.
      expect(ids(await api.list({}))).toEqual([recipe.id, note.id].sort());
      expect(ids(await api.list({ includeArchived: true }))).toHaveLength(3);
      expect(ids(await api.list({ archived: true }))).toEqual([archived.id]);
      // Topic matching is case-insensitive.
      expect(ids(await api.list({ topic: "recipes" }))).toEqual([recipe.id]);
      expect(ids(await api.list({ tagName: "italian" }))).toEqual([recipe.id]);
      expect(ids(await api.list({ tagId: recipe.tags[0].id }))).toEqual([
        recipe.id,
      ]);
      expect(ids(await api.list({ favourited: true }))).toEqual([recipe.id]);
      expect(ids(await api.list({ favourited: false }))).toEqual([note.id]);
      expect(ids(await api.list({ query: "rust" }))).toEqual([note.id]);
    });

    test<CustomTestContext>("search matches title, description, content and topic", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0].pages;
      const a = await api.create({ title: "Sourdough starter" });
      const b = await api.create({
        title: "x",
        description: "about SOURDOUGH",
      });
      const c = await api.create({ title: "y", content: "feed the sourdough" });
      const d = await api.create({ title: "z", topic: "sourdough" });
      await api.create({ title: "unrelated" });
      // LIKE wildcards in the query are matched literally.
      await api.create({ title: "100% rye" });

      const res = await api.search({ query: "sourdough" });
      expect(res.pages.map((p) => p.id).sort()).toEqual(
        [a.id, b.id, c.id, d.id].sort(),
      );
      expect((await api.search({ query: "0%" })).pages).toHaveLength(1);
      expect((await api.search({ query: "_" })).pages).toHaveLength(0);
    });

    test<CustomTestContext>("listTopics counts pages per topic", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0].pages;
      await api.create({ title: "1", topic: "recipes" });
      await api.create({ title: "2", topic: "recipes" });
      await api.create({ title: "3", topic: "notes" });
      await api.create({ title: "4" });

      const res = await api.listTopics();
      expect(res.topics).toEqual([
        { topic: "recipes", count: 2 },
        { topic: "notes", count: 1 },
      ]);
    });

    test<CustomTestContext>("topics are case-insensitive and keep the first spelling", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0].pages;
      await api.create({ title: "1", topic: "Recipes" });
      const second = await api.create({ title: "2", topic: "recipes" });
      expect(second.topic).toBe("Recipes");
      const third = await api.create({ title: "3" });
      const updated = await api.update({ pageId: third.id, topic: "RECIPES" });
      expect(updated.topic).toBe("Recipes");

      expect((await api.listTopics()).topics).toEqual([
        { topic: "Recipes", count: 3 },
      ]);
    });
  });

  describe("images", () => {
    test<CustomTestContext>("base64 image is stored as a pageImage asset", async ({
      apiCallers,
      db,
    }) => {
      const api = apiCallers[0].pages;
      const page = await api.create({
        title: "with image",
        image: {
          base64: PNG_BASE64,
          contentType: "image/png",
          fileName: "cover.png",
        },
      });

      expect(page.imageUrl).toBeNull();
      expect(page.imageAssetId).toBeTruthy();
      const asset = await db.query.assets.findFirst({
        where: eq(assets.id, page.imageAssetId!),
      });
      expect(asset?.assetType).toBe(AssetTypes.PAGE_IMAGE);
      expect(asset?.bookmarkId).toBeNull();
      expect(asset?.contentType).toBe("image/png");
      expect(imageStoreMocks.savePageImageBytes).toHaveBeenCalledTimes(1);
    });

    test<CustomTestContext>("accepts data URLs", async ({ apiCallers }) => {
      const api = apiCallers[0].pages;
      const page = await api.create({
        title: "data url",
        image: {
          base64: `data:image/png;base64,${PNG_BASE64}`,
          contentType: "image/png",
        },
      });
      expect(page.imageAssetId).toBeTruthy();
    });

    test<CustomTestContext>("rejects non-image bytes", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0].pages;
      await expect(
        api.create({
          title: "bad",
          image: {
            base64: Buffer.from("<html></html>").toString("base64"),
            contentType: "image/png",
          },
        }),
      ).rejects.toThrow(/image/i);
      expect(imageStoreMocks.savePageImageBytes).not.toHaveBeenCalled();
    });

    test<CustomTestContext>("replacing and removing an image cleans up the asset", async ({
      apiCallers,
      db,
    }) => {
      const api = apiCallers[0].pages;
      const page = await api.create({
        title: "img",
        image: { base64: PNG_BASE64, contentType: "image/png" },
      });
      const firstAssetId = page.imageAssetId!;

      // Switching to a URL drops the uploaded asset.
      const withUrl = await api.update({
        pageId: page.id,
        image: { url: "https://example.com/a.webp" },
      });
      expect(withUrl.imageUrl).toBe("https://example.com/a.webp");
      expect(withUrl.imageAssetId).toBeNull();
      expect(
        await db.query.assets.findFirst({ where: eq(assets.id, firstAssetId) }),
      ).toBeUndefined();
      expect(imageStoreMocks.deletePageImageBytes).toHaveBeenCalledWith(
        expect.anything(),
        firstAssetId,
      );

      const removed = await api.update({ pageId: page.id, image: null });
      expect(removed.imageUrl).toBeNull();
      expect(removed.imageAssetId).toBeNull();

      // Updating other fields leaves the image alone.
      const again = await api.update({
        pageId: page.id,
        image: { base64: PNG_BASE64, contentType: "image/png" },
      });
      const kept = await api.update({ pageId: page.id, title: "renamed" });
      expect(kept.imageAssetId).toBe(again.imageAssetId);
    });

    test<CustomTestContext>("deleting a page deletes its image asset", async ({
      apiCallers,
      db,
    }) => {
      const api = apiCallers[0].pages;
      const page = await api.create({
        title: "img",
        image: { base64: PNG_BASE64, contentType: "image/png" },
      });
      await api.delete({ pageId: page.id });
      expect(
        await db.query.assets.findFirst({
          where: eq(assets.id, page.imageAssetId!),
        }),
      ).toBeUndefined();
      expect(imageStoreMocks.deletePageImageBytes).toHaveBeenCalledWith(
        expect.anything(),
        page.imageAssetId,
      );
    });

    test<CustomTestContext>("attaches a pre-uploaded asset by id", async ({
      apiCallers,
      db,
    }) => {
      const userId = (await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.email, "test1@test.com"),
      }))!.id;
      await db.insert(assets).values({
        id: "uploaded-1",
        assetType: AssetTypes.UNKNOWN,
        bookmarkId: null,
        userId,
        contentType: "image/jpeg",
        size: 10,
        fileName: "x.jpg",
      });
      await db.insert(assets).values({
        id: "uploaded-pdf",
        assetType: AssetTypes.UNKNOWN,
        bookmarkId: null,
        userId,
        contentType: "application/pdf",
        size: 10,
        fileName: "x.pdf",
      });

      const api = apiCallers[0].pages;
      const page = await api.create({
        title: "pre-uploaded",
        image: { assetId: "uploaded-1" },
      });
      expect(page.imageAssetId).toBe("uploaded-1");
      const asset = await db.query.assets.findFirst({
        where: eq(assets.id, "uploaded-1"),
      });
      expect(asset?.assetType).toBe(AssetTypes.PAGE_IMAGE);

      await expect(
        api.create({ title: "pdf", image: { assetId: "uploaded-pdf" } }),
      ).rejects.toThrow(/image/i);
      // Another user can't use this user's asset.
      await expect(
        apiCallers[1].pages.create({
          title: "steal",
          image: { assetId: "uploaded-1" },
        }),
      ).rejects.toThrow(/not found/i);
    });
  });
});
