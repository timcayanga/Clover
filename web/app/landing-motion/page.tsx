import type { Metadata } from "next";
import { MotionLanding } from "./motion-landing";

export const metadata: Metadata = {
  title: { absolute: "Clover · A little clarity changes everything" },
  description:
    "An interactive journey from scattered financial records to a clearer picture of your money with Clover.",
  robots: { index: false, follow: false },
};

export default function LandingMotionPage() {
  return <MotionLanding />;
}
