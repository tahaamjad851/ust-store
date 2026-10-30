import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminHomePage() {
  const user = await requireStaff({ next: "/admin" });
  return (
    <section aria-labelledby="admin-heading" className="rounded-lg border border-border bg-card p-6">
      <h1 id="admin-heading" className="text-headline-md">
        Welcome, {user.fullName ?? user.email}
      </h1>
      <p className="mt-2 text-body-md text-muted-foreground">
        You are signed in as {user.role === "admin" ? "an administrator" : "a staff member"}. Products, orders, stock and
        customers will appear here as the admin panel is built.
      </p>
    </section>
  );
}
