"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { BookOpen } from "lucide-react";

import type { ZPageSummary } from "@karakeep/shared/types/pages";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

export function getPageImageSrc(
  page: Pick<ZPageSummary, "imageUrl" | "imageAssetId">,
): string | null {
  if (page.imageUrl) {
    return page.imageUrl;
  }
  if (page.imageAssetId) {
    return getAssetUrl(page.imageAssetId);
  }
  return null;
}

// Placeholder colors derived from the title, so pages without a cover are
// still easy to tell apart at a glance.
const PLACEHOLDER_GRADIENTS = [
  "from-amber-200 to-orange-300 dark:from-amber-900 dark:to-orange-800",
  "from-emerald-200 to-teal-300 dark:from-emerald-900 dark:to-teal-800",
  "from-sky-200 to-indigo-300 dark:from-sky-900 dark:to-indigo-800",
  "from-rose-200 to-pink-300 dark:from-rose-900 dark:to-pink-800",
  "from-violet-200 to-fuchsia-300 dark:from-violet-900 dark:to-fuchsia-800",
  "from-lime-200 to-green-300 dark:from-lime-900 dark:to-green-800",
];

function placeholderGradient(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return PLACEHOLDER_GRADIENTS[Math.abs(hash) % PLACEHOLDER_GRADIENTS.length];
}

/**
 * The cover image of a page: the hotlinked imageUrl if set, else the uploaded
 * asset, else a colored placeholder with the page's initial.
 */
export function PageImage({
  page,
  className,
}: {
  page: Pick<ZPageSummary, "imageUrl" | "imageAssetId" | "title">;
  className?: string;
}) {
  const src = getPageImageSrc(page);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src && failedSrc !== src) {
    return (
      // Hotlinked images can come from any host, so we don't go through
      // next/image (which would need every host allow-listed).
      // oxlint-disable-next-line nextjs/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className={cn("size-full object-cover", className)}
        onError={() => setFailedSrc(src)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex size-full items-center justify-center bg-gradient-to-br",
        placeholderGradient(page.title),
        className,
      )}
    >
      <span className="flex items-center gap-2 text-4xl font-semibold text-foreground/40">
        <BookOpen className="size-8" />
        {page.title.trim().charAt(0).toUpperCase()}
      </span>
    </div>
  );
}
