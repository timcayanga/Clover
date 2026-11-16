import Image from "next/image";
import Link from "next/link";
import { requireInternalAccess } from "@/lib/internal-access";
import { InternalSignOut } from "@/components/internal-sign-out";

export default async function OfficePage() {
  const access = await requireInternalAccess();
  return (
    <main id="main-content" className="studio office">
      <header className="office-header">
        <Image
          src="/clover-logo-full.svg"
          alt="Clover"
          width={115}
          height={36}
        />
        <span className="studio-pill">Private workspace</span>
      </header>
      <section className="office-intro">
        <span className="studio-eyebrow">
          A little focus. A lot of possibility.
        </span>
        <h1>
          Good things
          <br />
          grow here.
        </h1>
        <p>
          Your team and your operations.
          <br />
          One home for everything behind Clover.
        </p>
      </section>
      <div className="office-doors">
        <Link href="/team" className="office-door">
          <span className="office-door-icon">✳</span>
          <span className="studio-eyebrow">CREATE · COLLABORATE · GROW</span>
          <h2>Team</h2>
          <p>
            Meet your distribution team. Shape ideas, review creative, and plan
            what goes out next.
          </p>
          <span className="office-door-link">
            Enter the studio <span>↗</span>
          </span>
        </Link>
        <Link href="/admin" className="office-door office-door-admin">
          <span className="office-door-icon">▦</span>
          <span className="studio-eyebrow">MANAGE · SUPPORT · UNDERSTAND</span>
          <h2>Admin</h2>
          <p>
            The operational side of Clover. Users, support, analytics, import
            quality, and system health.
          </p>
          <span className="office-door-link">
            Open Admin <span>↗</span>
          </span>
        </Link>
      </div>
      <footer className="office-footer">
        <span>{access.email}</span>
        {!access.localPreview ? <InternalSignOut /> : null}
        <span>
          {access.localPreview
            ? "Local preview · production requires sign-in"
            : "Owner access · you have the final say"}
        </span>
      </footer>
    </main>
  );
}
