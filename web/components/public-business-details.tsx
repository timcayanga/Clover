import Link from "next/link";
import { PUBLIC_BUSINESS } from "@/lib/public-business";

export function PublicBusinessDetails() {
  return <div>
    <p><strong>{PUBLIC_BUSINESS.name}</strong></p>
    <p>SEC Company Registration No. {PUBLIC_BUSINESS.registrationNumber}</p>
    <address style={{ fontStyle: "normal" }}>{PUBLIC_BUSINESS.address}</address>
    <p>Customer service: <a href={`mailto:${PUBLIC_BUSINESS.email}`}>{PUBLIC_BUSINESS.email}</a></p>
    <p>We aim to reply within 1 to 3 days. <Link href="/contact-us">Send a support request →</Link></p>
  </div>;
}
