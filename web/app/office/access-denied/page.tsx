import Link from "next/link";
import { InternalSignOut } from "@/components/internal-sign-out";
export default function AccessDenied() {
  return (
    <main id="main-content" className="studio office-login">
      <div>
        <span className="studio-eyebrow">PRIVATE WORKSPACE</span>
        <h1>Owner access only.</h1>
        <p>
          This account does not have access. Use the verified account authorized
          for Clover’s workspace.
        </p>
        <InternalSignOut label="Sign out and switch account →" />
        <Link href="https://clover.ph">Back to Clover</Link>
      </div>
    </main>
  );
}
