import { redirect } from "next/navigation";
import { isCategory } from "@/lib/categories";

// The company list lives in Discover now; old links (and ?category=) still land.
export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  redirect(isCategory(category) ? `/database?book=${category}` : "/database");
}
