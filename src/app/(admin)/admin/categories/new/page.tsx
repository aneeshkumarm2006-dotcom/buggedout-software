import type { Metadata } from "next";

import { createCategoryAction } from "@/app/(admin)/catalog-actions";
import { CategoryForm } from "@/components/admin/category-form";
import { PageHeader } from "@/components/common/page-header";
import { requireAdminPage } from "@/lib/admin/guard";

export const metadata: Metadata = { title: "New game" };

export default async function NewCategoryPage() {
  await requireAdminPage("categories.manage", { fallback: "/admin/categories" });

  return (
    <div className="space-y-5">
      <PageHeader
        title="New game"
        description="One of the ten games. Its templates become the markets on every match you build for it."
        backHref="/admin/categories"
        backLabel="Games"
      />

      <CategoryForm action={createCategoryAction} submitLabel="Create game" />
    </div>
  );
}
