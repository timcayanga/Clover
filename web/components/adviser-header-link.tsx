import { getNavigationIconSrc } from "@/lib/navigation-icons";
import Image from "next/image";
import Link from "next/link";

export function AdviserHeaderLink() {
  return (
    <Link
      className="adviser-header-link"
      href="/adviser"
      aria-label="Open Adviser"
      title="Adviser"
    >
      <Image
        src={getNavigationIconSrc("adviser")}
        width={96}
        height={96}
        alt=""
        aria-hidden="true"
        priority
      />
    </Link>
  );
}
