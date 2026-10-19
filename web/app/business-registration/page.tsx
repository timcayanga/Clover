import type { Metadata } from "next";
import Image from "next/image";
import { PublicInfoShell } from "@/components/public-info-shell";
import styles from "./registration.module.css";

export const metadata: Metadata = {
  title: "Business Registration",
  description: "View Clover Innovations OPC’s official BIR Registration Seal Badge and scan the QR code to verify its registration.",
  alternates: { canonical: "https://clover.ph/business-registration" },
};

const badge = "/assets/registration/bir-registration-seal-2026.png";

export default function BusinessRegistrationPage() {
  return (
    <PublicInfoShell>
      <section className={styles.registration} aria-labelledby="registration-title">
        <header className={styles.intro}>
          <p className={styles.eyebrow}>Clover Innovations OPC</p>
          <h1 id="registration-title">Business Registration</h1>
          <p>Clover is operated by Clover Innovations OPC, a business registered with the Philippine Bureau of Internal Revenue.</p>
        </header>
        <figure className={styles.badge}>
          <Image
            src={badge}
            width={1512}
            height={504}
            alt="Official 2026 BIR Registration Seal Badge for Clover Innovations OPC, including its registration verification QR code."
            sizes="(max-width: 767px) calc(100vw - 64px), 760px"
            unoptimized
          />
          <figcaption>
            <h2>BIR Registration Seal Badge</h2>
            <p>Scan the QR code to verify our registration through the official BIR verification service.</p>
            <a href={badge} target="_blank" rel="noopener noreferrer">Open full-size badge<span className={styles.srOnly}> (opens in a new tab)</span> ↗</a>
          </figcaption>
        </figure>
      </section>
    </PublicInfoShell>
  );
}
