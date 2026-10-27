import type { CallToolResult } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockClient, mockTool } = vi.hoisted(() => ({
  mockClient: {
    GET: vi.fn(),
    POST: vi.fn(),
    PUT: vi.fn(),
    PATCH: vi.fn(),
    DELETE: vi.fn(),
  },
  mockTool: vi.fn(),
}));

vi.mock("./shared", () => ({
  karakeepClient: mockClient,
  registerTool: mockTool,
}));

import {
  addPageToListHandler,
  attachTagsToPageHandler,
  createPageHandler,
  detachTagsFromPageHandler,
  getPageHandler,
  listPagesHandler,
  listPageTopicsHandler,
  searchPagesHandler,
  setPageTagsHandler,
  updatePageHandler,
} from "./pages";

const textOf = (result: CallToolResult): string => {
  const first = result.content[0];
  if (!first || first.type !== "text") {
    throw new Error(`expected text content, got ${JSON.stringify(first)}`);
  }
  return first.text;
};

const samplePage = {
  id: "page_1",
  title: "Shakshuka",
  description: "Eggs in tomato sauce",
  content: "# Shakshuka",
  note: null,
  topic: "recipes",
  imageUrl: "https://img.example.com/s.jpg",
  imageAssetId: null,
  sourceUrl: null,
  favourited: false,
  archived: false,
  createdAt: "2026-01-01T00:00:00Z",
  modifiedAt: null,
  tags: [{ id: "t1", name: "breakfast", attachedBy: "human" as const }],
};

afterEach(() => {
  vi.resetAllMocks();
});

describe("create-page", () => {
  it("maps imageUrl to a hotlinked image and drops undefined fields", async () => {
    mockClient.POST.mockResolvedValueOnce({ data: samplePage });

    const result = await createPageHandler({
      title: "Shakshuka",
      topic: "recipes",
      tags: ["breakfast"],
      imageUrl: "https://img.example.com/s.jpg",
    });

    expect(mockClient.POST).toHaveBeenCalledWith("/pages", {
      body: {
        title: "Shakshuka",
        topic: "recipes",
        tags: ["breakfast"],
        image: { url: "https://img.example.com/s.jpg" },
      },
    });
    const text = textOf(result);
    expect(text).toContain("Page ID: page_1");
    expect(text).toContain("Image: https://img.example.com/s.jpg");
    expect(text).not.toContain("# Shakshuka");
  });

  it("maps base64 images", async () => {
    mockClient.POST.mockResolvedValueOnce({ data: samplePage });
    await createPageHandler({
      title: "x",
      imageBase64: "AAAA",
      imageContentType: "image/png",
    });
    expect(mockClient.POST.mock.calls[0][1].body.image).toEqual({
      base64: "AAAA",
      contentType: "image/png",
    });
  });

  it("rejects base64 without a content type", async () => {
    const result = await createPageHandler({ title: "x", imageBase64: "AAAA" });
    expect(result.isError).toBe(true);
    expect(mockClient.POST).not.toHaveBeenCalled();
  });
});

describe("get-page", () => {
  it("includes the markdown content", async () => {
    mockClient.GET.mockResolvedValueOnce({ data: samplePage });
    const result = await getPageHandler({ pageId: "page_1" });
    expect(mockClient.GET).toHaveBeenCalledWith("/pages/{pageId}", {
      params: { path: { pageId: "page_1" } },
    });
    expect(textOf(result)).toContain("Content (markdown):\n# Shakshuka");
  });

  it("uses a signed URL for uploaded images", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: { ...samplePage, imageUrl: null, imageAssetId: "asset_1" },
    });
    mockClient.GET.mockResolvedValueOnce({
      data: { signedUrl: "https://k.example.com/signed" },
    });
    const result = await getPageHandler({ pageId: "page_1" });
    expect(mockClient.GET).toHaveBeenLastCalledWith(
      "/assets/{assetId}/signed-url",
      { params: { path: { assetId: "asset_1" } } },
    );
    expect(textOf(result)).toContain("Image: https://k.example.com/signed");
  });
});

describe("list-pages / search-pages", () => {
  it("forwards filters and prints the cursor", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: { pages: [samplePage], nextCursor: "c1" },
    });
    const result = await listPagesHandler({
      topic: "recipes",
      tag: "breakfast",
      favourited: true,
      limit: 5,
    });
    expect(mockClient.GET).toHaveBeenCalledWith("/pages", {
      params: {
        query: {
          topic: "recipes",
          tag: "breakfast",
          favourited: true,
          limit: 5,
        },
      },
    });
    expect(textOf(result)).toContain("Next page cursor: c1");
  });

  it("maps query to q", async () => {
    mockClient.GET.mockResolvedValueOnce({ data: { pages: [] } });
    const result = await searchPagesHandler({ query: "eggs", archived: true });
    expect(mockClient.GET).toHaveBeenCalledWith("/pages/search", {
      params: { query: { q: "eggs", archived: true } },
    });
    expect(textOf(result)).toBe("No pages found.");
  });
});

describe("update-page", () => {
  it("maps removeImage to image: null", async () => {
    mockClient.PATCH.mockResolvedValueOnce({ data: samplePage });
    await updatePageHandler({
      pageId: "page_1",
      favourited: true,
      note: "n",
      removeImage: true,
    });
    expect(mockClient.PATCH).toHaveBeenCalledWith("/pages/{pageId}", {
      params: { path: { pageId: "page_1" } },
      body: { favourited: true, note: "n", image: null },
    });
  });

  it("leaves the image alone when not given", async () => {
    mockClient.PATCH.mockResolvedValueOnce({ data: samplePage });
    await updatePageHandler({ pageId: "page_1", title: "T" });
    expect(mockClient.PATCH.mock.calls[0][1].body).toEqual({ title: "T" });
  });

  it("returns MCP error on 404", async () => {
    mockClient.PATCH.mockResolvedValueOnce({
      error: { code: "NOT_FOUND", message: "Page not found" },
    });
    const result = await updatePageHandler({ pageId: "x", title: "T" });
    expect(result.isError).toBe(true);
  });
});

describe("tags and lists", () => {
  it("set-page-tags replaces tags", async () => {
    mockClient.PUT.mockResolvedValueOnce({ data: samplePage });
    const result = await setPageTagsHandler({
      pageId: "page_1",
      tags: ["breakfast"],
    });
    expect(mockClient.PUT).toHaveBeenCalledWith("/pages/{pageId}/tags", {
      params: { path: { pageId: "page_1" } },
      body: { tags: ["breakfast"] },
    });
    expect(textOf(result)).toContain("breakfast");
  });

  it("attach/detach map names to tagName", async () => {
    mockClient.POST.mockResolvedValueOnce({ data: { attached: ["t1"] } });
    mockClient.DELETE.mockResolvedValueOnce({ data: { detached: ["t1"] } });
    await attachTagsToPageHandler({ pageId: "p", tags: ["a"] });
    await detachTagsFromPageHandler({ pageId: "p", tags: ["a"] });
    expect(mockClient.POST.mock.calls[0][1].body).toEqual({
      tags: [{ tagName: "a" }],
    });
    expect(mockClient.DELETE.mock.calls[0][1].body).toEqual({
      tags: [{ tagName: "a" }],
    });
  });

  it("add-page-to-list", async () => {
    mockClient.PUT.mockResolvedValueOnce({ data: undefined });
    await addPageToListHandler({ pageId: "p", listId: "l" });
    expect(mockClient.PUT).toHaveBeenCalledWith(
      "/pages/{pageId}/lists/{listId}",
      { params: { path: { pageId: "p", listId: "l" } } },
    );
  });

  it("list-page-topics", async () => {
    mockClient.GET.mockResolvedValueOnce({
      data: { topics: [{ topic: "recipes", count: 3 }] },
    });
    expect(textOf(await listPageTopicsHandler())).toBe("recipes (3)");
  });
});
