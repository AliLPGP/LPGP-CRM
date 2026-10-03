import { redirect } from "next/navigation";

// The product opens on the intelligence overview. The sales command centre
// lives at /crm, reachable from the CRM menu, until it moves to its own
// product.
export default function Root() {
  redirect("/database");
}
