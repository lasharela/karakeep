import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageReader from "@/components/dashboard/pages/PageReader";
import { api } from "@/server/api/client";
import { TRPCError } from "@trpc/server";

export async function generateMetadata(props: {
  params: Promise<{ pageId: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  try {
    const page = await api.pages.get({ pageId: params.pageId });
    return {
      title: `${page.title} | Karakeep`,
    };
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") {
      notFound();
    }
    throw e;
  }
}

export default async function PageReaderPage(props: {
  params: Promise<{ pageId: string }>;
}) {
  const params = await props.params;
  return <PageReader pageId={params.pageId} />;
}
