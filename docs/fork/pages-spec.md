# Fork feature: Pages

Fork: `lasharela/karakeep`, branch `feat/pages`, based on upstream tag `v0.34.1` (what links.lasharela.com runs).
Date: 2026-10-27.

## Goal

Agents (via MCP) and the owner (via web UI) can save **pages**: standalone, self-authored documents on any
topic (recipes, how-tos, notes on a subject). A page has a title, a cover image, a short description and a
markdown body. Pages are a new entity, separate from bookmarks.

## Data model (`packages/db/schema.ts` + one generated drizzle migration)

Table `pages`:

| column | type | notes |
|---|---|---|
| id | text pk | `createId()` like other tables |
| userId | text fk → user.id, cascade delete | indexed |
| title | text not null | 1..500 chars |
| description | text null | short summary shown on cards, ≤ 2000 chars |
| content | text not null default "" | markdown body |
| topic | text null | free-form category, e.g. "recipes"; indexed (userId, topic) |
| imageAssetId | text null | id of an asset row (see below) |
| sourceUrl | text null | optional "inspired by / original" link |
| createdAt / modifiedAt | timestamps | same helpers as bookmarks |

Tags: table `tagsOnPages` (pageId, tagId, attachedAt) reusing the existing `bookmarkTags` tag table, so pages
and bookmarks share one tag vocabulary. Cascade on both sides.

Image storage: reuse the existing asset system. Add a new asset type `pageImage` to the assets `assetType`
enum; the asset row has `bookmarkId = null` (check the column is nullable; if not, add a nullable `pageId`
column on assets instead and use that — pick whichever keeps upstream code paths untouched, and note it in
the commit). Image bytes go through the existing asset store (`saveAsset` / `readAsset` in shared-server),
respecting upload size limits and allowed image mimetypes. Deleting a page deletes its image asset.

Generate the migration with the repo's drizzle-kit command; never hand-edit older migrations.

## Server API

tRPC router `pages` (`packages/trpc/routers/pages.ts`, registered in `_app.ts`), all `authedProcedure`,
everything scoped to `ctx.user.id` (another user's page → NOT_FOUND):

- `create({ title, description?, content?, topic?, sourceUrl?, tags?: string[], image?: ImageInput })`
- `get({ pageId })` → page incl. tags, `imageAssetId`
- `list({ topic?, tagName?, cursor?, limit? (default 20, max 100) })` → `{ pages, nextCursor }`, newest first
- `search({ query, limit? })` → simple SQL `LIKE` match on title/description/content/topic (no meilisearch
  in v1; keep it in this router)
- `update({ pageId, title?, description?, content?, topic?, sourceUrl?, image?: ImageInput | null })`
  (`image: null` removes the image)
- `setTags({ pageId, tags: string[] })` replace the tag set (create missing tags for the user)
- `delete({ pageId })`
- `listTopics()` → `{ topic, count }[]`

`ImageInput` = `{ url: string }` **or** `{ base64: string, contentType: string, fileName?: string }`.
For `url`: server fetches it (use the repo's existing safe fetch helper if there is one, with SSRF
protection / timeout / max size like the crawler uses), validates it's an image, stores it as an asset.
Never hotlink.

Zod schemas live in `packages/shared/types/pages.ts` (mirror how `types/bookmarks.ts` / `types/tags.ts` do it).

REST: `packages/api/routes/pages.ts` mounted at `/api/v1/pages` with the same operations
(`GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `PUT /:id/tags`, `GET /search?q=`,
`GET /topics`), following the pattern of the existing routes (API-key auth works the same). Image is served
by the existing `/api/assets/:assetId` route — make sure ownership checks there accept page images.
Add the endpoints to `packages/open-api` and regenerate the SDK client (`packages/sdk`) so the MCP can call
them typed. If regenerating is painful, the MCP may call the REST endpoints with plain `fetch` — say which.

## Web UI (`apps/web`)

- Sidebar entry "Pages" (icon e.g. `BookOpen`) → `/dashboard/pages`.
- `/dashboard/pages`: responsive card grid (image on top with aspect-ratio cover, title, description clamped
  to 3 lines, topic badge, tags). Topic filter chips (from `listTopics`) and a search box. Infinite scroll or
  "load more" with the cursor. Empty state.
- `/dashboard/pages/[pageId]`: reader view — cover image, title, topic, tags, description, rendered markdown
  (reuse the markdown renderer the app already uses for notes/text bookmarks), source link. Edit button →
  edit form (title, topic, description, image URL or file upload, tags, markdown textarea with preview);
  delete with confirm.
- "New page" button on the list.
- Reuse existing shadcn components and i18n pattern (add English strings only).

## MCP (`apps/mcp/src/pages.ts`, imported from `index.ts`)

Tools, same style as `bookmarks.ts` (descriptions written for agents, text results compact):

- `create-page` (title, description?, content (markdown)?, topic?, tags?, sourceUrl?, imageUrl?,
  imageBase64? + imageContentType?) → returns id + summary
- `get-page` (pageId) → full page incl. markdown content and an absolute image URL
- `list-pages` (topic?, tag?, limit?, cursor?)
- `search-pages` (query, limit?)
- `update-page` (pageId, any field; `removeImage?: boolean`)
- `set-page-tags` (pageId, tags)
- `list-page-topics`
- `delete-page` (pageId) — exists, but the deployed bridge deny-lists it by default

## Tests

- tRPC router tests in `packages/trpc/routers/pages.test.ts` following the existing `*.test.ts` pattern
  (create/get/list/update/delete, tag replace, ownership isolation between two users, cursor pagination,
  image via base64; URL image fetch mocked).
- MCP: at least a unit test for argument → request mapping if the existing MCP tests make that easy.
- `pnpm typecheck` and `pnpm lint` clean for touched packages; the web app builds.

## Non-goals (v1)

Meilisearch indexing, AI tagging, sharing/public pages, mobile app, browser extension, versions/history.

## Upstream-merge hygiene

Keep the change additive: new files where possible, minimal edits to shared files (`schema.ts`, `_app.ts`,
sidebar, routes index, mcp index, assets enum). One migration file.

## Amendment 1 (2026-10-27, from Lasha) — supersedes conflicting parts above

1. **Images are mainly external.** Add column `imageUrl` (text null) on `pages`. An `imageUrl` is stored and
   displayed directly (hotlinked) — it is NOT downloaded. Upload (base64 / file) stays as a secondary option
   stored as a `pageImage` asset (`imageAssetId`). Display rule: `imageUrl` if set, else the asset, else a
   placeholder. `ImageInput` becomes `{ url }` → sets `imageUrl` (no fetch), `{ base64, contentType }` → asset.
   Drop the server-side URL fetching requirement. MCP `create-page`/`update-page` take `imageUrl` as the main
   way. Cards must make pages easy to recognise at a glance (cover image prominent).
2. **Parity with bookmarks ("very similar structure to URLs").** Pages get the same organising features as
   bookmarks:
   - tags (shared tag vocabulary, already specified) incl. attach/detach style ops, not just replace;
   - lists: page membership in the existing `bookmarkLists` lists via a new join table `pagesInLists`
     (manual lists only), with add/remove ops; list view of a list should show its pages too if that is
     cheap, otherwise pages page filtered by list;
   - `favourited` and `archived` booleans, plus `note` (personal note, separate from description);
   - filters on list/search: topic, tag, list, favourited, archived (default hide archived), text query;
     sort newest/oldest.
   - UI: reuse the look & interaction of the bookmark grid/cards as much as possible (tag editor, add-to-list
     dialog, favourite/archive actions, card menu) rather than inventing new widgets.
   - MCP: add `attach-tag-to-page`, `detach-tag-from-page`, `add-page-to-list`, `remove-page-from-list`,
     and favourited/archived/note on `update-page`; `list-pages`/`search-pages` accept the filters above.
