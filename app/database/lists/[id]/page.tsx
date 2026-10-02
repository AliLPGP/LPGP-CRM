import { IntelShell } from "@/components/intel/shell";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getDirectoryIndex } from "@/lib/directory/index-server";
import { getDirectoryList } from "@/lib/directory/queries";
import { packIndex } from "@/lib/directory/records";
import { ListDetail } from "@/components/directory/list-views";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getDirectoryList(id);
  return { title: data ? `${data.list.name} — LPGP Connect` : "List — LPGP Connect" };
}

export default async function ListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, index, user] = await Promise.all([getDirectoryList(id), getDirectoryIndex(), getSessionUser()]);
  if (!data) notFound();
  const ids = new Set(data.items.map((i) => i.company_id));
  // Only this list's firms travel to the browser.
  const packed = packIndex({ ...index, records: index.records.filter((r) => ids.has(r.id)), brands: [] });
  const canDelete = Boolean(user && (user.role === "admin" || !data.list.owner_id || data.list.owner_id === user.id));
  return (
    <IntelShell wide={false} crumbs={[{ href: "/database/lists", label: "Lists" }, { label: data.list.name }]}>
      <ListDetail list={data.list} items={data.items} packed={packed} canDelete={canDelete} />
    </IntelShell>
  );
}
