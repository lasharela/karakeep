import type { QuotaApproved } from "@karakeep/shared/storageQuota";
import { deleteAsset, saveAsset } from "@karakeep/shared-server";

// Thin wrapper around the asset store for page cover images, kept in its own
// module so tests can swap it out without touching the filesystem.

export async function savePageImageBytes(input: {
  userId: string;
  assetId: string;
  bytes: Buffer;
  contentType: string;
  fileName: string | null;
  quotaApproved: QuotaApproved;
}) {
  await saveAsset({
    userId: input.userId,
    assetId: input.assetId,
    asset: input.bytes,
    metadata: {
      contentType: input.contentType,
      fileName: input.fileName,
    },
    quotaApproved: input.quotaApproved,
  });
}

export async function deletePageImageBytes(userId: string, assetId: string) {
  await deleteAsset({ userId, assetId }).catch(() => ({}));
}
