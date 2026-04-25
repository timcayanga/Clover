import { redirect } from "next/navigation";

export default function ImportsPage() {
  redirect("/transactions?import=1");
}
