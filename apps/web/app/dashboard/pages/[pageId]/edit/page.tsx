import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageEditor from "@/components/dashboard/pages/PageEditor";
import { api } from "@/server/api/client";
import { useTranslation } from "@/lib/i18n/server";
import { TRPCError } from "@trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("pages.edit_page")} | Karakeep`,
  };
}

export default async function EditPagePage(props: {
  params: Promise<{ pageId: string }>;
}) {
  const params = await props.params;
  let page;
  try {
    page = await api.pages.get({ pageId: params.pageId });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") {
      notFound();
    }
    throw e;
  }
  // Remount when the page changes so the form picks up fresh values.
  return <PageEditor key={page.modifiedAt?.toISOString()} page={page} />;
}
