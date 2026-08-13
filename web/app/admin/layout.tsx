import type { ReactNode } from "react";

import "./admin.css";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <main className="admin-root">{children}</main>;
}
