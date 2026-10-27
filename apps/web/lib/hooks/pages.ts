import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type { ZListPagesRequest } from "@karakeep/shared/types/pages";
import { useTRPC } from "@karakeep/shared-react/trpc";

// React-query hooks for the pages router (fork feature). Every mutation
// invalidates all pages queries; page collections are small enough for that.

type TRPCApi = ReturnType<typeof useTRPC>;

function useInvalidatePages() {
  const api = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries(api.pages.pathFilter());
}

export function useInfinitePages(input: Omit<ZListPagesRequest, "cursor">) {
  const api = useTRPC();
  return useInfiniteQuery({
    ...api.pages.list.infiniteQueryOptions(input, {
      placeholderData: keepPreviousData,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }),
    select: (data) => data.pages.flatMap((p) => p.pages),
  });
}

export function useCreatePage(
  opts?: Parameters<TRPCApi["pages"]["create"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const invalidate = useInvalidatePages();
  return useMutation(
    api.pages.create.mutationOptions({
      ...opts,
      onSuccess: (...args) => {
        invalidate();
        return opts?.onSuccess?.(...args);
      },
    }),
  );
}

export function useUpdatePage(
  opts?: Parameters<TRPCApi["pages"]["update"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const invalidate = useInvalidatePages();
  return useMutation(
    api.pages.update.mutationOptions({
      ...opts,
      onSuccess: (...args) => {
        invalidate();
        return opts?.onSuccess?.(...args);
      },
    }),
  );
}

export function useDeletePage(
  opts?: Parameters<TRPCApi["pages"]["delete"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const invalidate = useInvalidatePages();
  return useMutation(
    api.pages.delete.mutationOptions({
      ...opts,
      onSuccess: (...args) => {
        invalidate();
        return opts?.onSuccess?.(...args);
      },
    }),
  );
}

export function useUpdatePageTags(
  opts?: Parameters<TRPCApi["pages"]["updateTags"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  const invalidate = useInvalidatePages();
  return useMutation(
    api.pages.updateTags.mutationOptions({
      ...opts,
      onSuccess: (...args) => {
        invalidate();
        // New tags may have been created.
        queryClient.invalidateQueries(api.tags.list.pathFilter());
        return opts?.onSuccess?.(...args);
      },
    }),
  );
}

export function useAddPageToList(
  opts?: Parameters<TRPCApi["pages"]["addToList"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const invalidate = useInvalidatePages();
  return useMutation(
    api.pages.addToList.mutationOptions({
      ...opts,
      onSuccess: (...args) => {
        invalidate();
        return opts?.onSuccess?.(...args);
      },
    }),
  );
}

export function useRemovePageFromList(
  opts?: Parameters<TRPCApi["pages"]["removeFromList"]["mutationOptions"]>[0],
) {
  const api = useTRPC();
  const invalidate = useInvalidatePages();
  return useMutation(
    api.pages.removeFromList.mutationOptions({
      ...opts,
      onSuccess: (...args) => {
        invalidate();
        return opts?.onSuccess?.(...args);
      },
    }),
  );
}
