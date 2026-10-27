import type { Metadata } from "next";
import AllPagesView from "@/components/dashboard/pages/AllPagesView";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("pages.all_pages")} | Karakeep`,
  };
}

export default function PagesPage() {
  return <AllPagesView />;
}
