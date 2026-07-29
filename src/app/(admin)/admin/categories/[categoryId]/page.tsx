import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { updateCategoryAction } from "@/app/(admin)/catalog-actions";
import { CategoryForm } from "@/components/admin/category-form";
import { FlashToast } from "@/components/admin/flash-toast";
import { PageHeader } from "@/components/common/page-header";
import { getCategory } from "@/lib/admin/categories";
import { requireAdminPage } from "@/lib/admin/guard";
import { parseFlash, type SearchParamsRecord } from "@/lib/admin/list-params";

export const metadata: Metadata = { title: "Edit game" };

export default async function EditCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ categoryId: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  await requireAdminPage("categories.manage", { fallback: "/admin/categories" });

  const { categoryId } = await params;
  const category = await getCategory(categoryId);

  if (!category) notFound();

  const { flash } = await searchParams;

  return (
    <div className="space-y-5">
      <FlashToast message={parseFlash(flash)} />

      <PageHeader
        title={category.title}
        description={`/games/${category.slug}`}
        backHref="/admin/categories"
        backLabel="Games"
      />

      <CategoryForm
        action={updateCategoryAction.bind(null, category.id)}
        category={category}
        submitLabel="Save game"
      />
    </div>
  );
}
