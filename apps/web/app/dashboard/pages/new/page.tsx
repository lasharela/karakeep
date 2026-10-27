import type { Metadata } from "next";
import PageEditor from "@/components/dashboard/pages/PageEditor";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("pages.new_page")} | Karakeep`,
  };
}

export default function NewPagePage() {
  return <PageEditor />;
}
