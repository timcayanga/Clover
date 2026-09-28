import Link from "next/link";
import "./admin.css";
import { redirect } from "next/navigation";
import { requireAdminAuth } from "@/lib/admin";

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireAdminAuth();
  } catch (error) {
    redirect(
      error instanceof Error && error.message === "UNAUTHORIZED"
        ? "/office/sign-in?destination=admin"
        : "/office/access-denied",
    );
  }
  return (
    <>
      <div
        style={{
          padding: "12px 24px",
          background: "#103f38",
          color: "white",
          display: "flex",
          gap: 24,
          fontSize: 13,
        }}
      >
        <Link href="/office">← Workspace</Link>
        <Link href="/team">Team studio</Link>
        <span style={{ marginLeft: "auto" }}>Clover · Admin</span>
      </div>
      <main className="admin-root">{children}</main>
    </>
  );
}
