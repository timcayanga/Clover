"use client";

import { FinancialAccountCard } from "@/components/financial-account-card";
import { getAccountBrand, type AccountBrand } from "@/lib/account-brand";

type LuxuryCardSample = {
  id: string;
  title: string;
  finish: string;
  institution: string;
  accountName: string;
  accountNumber: string;
  amount: string;
  accent: string;
  foreground: string;
  background: string;
};

const samples: LuxuryCardSample[] = [
  {
    id: "obsidian",
    title: "Obsidian Reserve",
    finish: "Black titanium with a restrained gold edge",
    institution: "Maya",
    accountName: "Maya",
    accountNumber: "•••• 2608",
    amount: "₱60,184.87",
    accent: "#d7b45f",
    foreground: "#fffaf0",
    background:
      "radial-gradient(circle at 76% 18%, rgba(234, 199, 114, 0.2), transparent 28%), linear-gradient(112deg, #050607 0%, #191a1c 38%, #090a0c 65%, #26201a 100%)",
  },
  {
    id: "champagne",
    title: "Champagne Alloy",
    finish: "Warm platinum with satin illumination",
    institution: "UnionBank",
    accountName: "UnionBank",
    accountNumber: "•••• 8037",
    amount: "₱84,520.00",
    accent: "#8b6731",
    foreground: "#21180d",
    background:
      "radial-gradient(circle at 24% 16%, rgba(255, 255, 255, 0.9), transparent 24%), linear-gradient(125deg, #a9864f 0%, #e8d5a9 30%, #fff2ce 50%, #c7a66e 72%, #80613b 100%)",
  },
  {
    id: "rose-titanium",
    title: "Rose Titanium",
    finish: "Polished blush metal with a cool shadow",
    institution: "BPI",
    accountName: "BPI",
    accountNumber: "•••• 3012",
    amount: "₱301,149.30",
    accent: "#f0a4a8",
    foreground: "#fff9f7",
    background:
      "radial-gradient(circle at 72% 72%, rgba(255, 210, 210, 0.36), transparent 34%), linear-gradient(132deg, #5b1f2b 0%, #ad5261 30%, #e7a1a0 51%, #913d53 72%, #3b1724 100%)",
  },
  {
    id: "emerald",
    title: "Emerald Lacquer",
    finish: "Deep mineral green with a jewel-like glow",
    institution: "GCash",
    accountName: "GCash",
    accountNumber: "•••• 9926",
    amount: "₱28,450.75",
    accent: "#78e6bd",
    foreground: "#f1fff9",
    background:
      "radial-gradient(ellipse at 28% 10%, rgba(148, 255, 211, 0.32), transparent 30%), linear-gradient(138deg, #05271e 0%, #0b5b46 32%, #1b9a72 51%, #0a553f 73%, #031c16 100%)",
  },
  {
    id: "sapphire",
    title: "Sapphire Night",
    finish: "Midnight blue with a crystalline highlight",
    institution: "Metrobank",
    accountName: "Metrobank",
    accountNumber: "•••• 6453",
    amount: "₱51,539.61",
    accent: "#88bfff",
    foreground: "#f4f8ff",
    background:
      "radial-gradient(circle at 80% 12%, rgba(124, 193, 255, 0.34), transparent 28%), linear-gradient(127deg, #07172f 0%, #123f78 34%, #2d75b8 51%, #123865 73%, #050f22 100%)",
  },
  {
    id: "aurora",
    title: "Aurora Mint",
    finish: "Iridescent teal with a pearl-mint shift",
    institution: "Wise",
    accountName: "Wise",
    accountNumber: "•••• 8345",
    amount: "£1,426.20",
    accent: "#79ffe1",
    foreground: "#072a27",
    background:
      "radial-gradient(circle at 78% 18%, rgba(255, 255, 255, 0.72), transparent 24%), linear-gradient(124deg, #38a996 0%, #74dfc9 29%, #d0f5dc 50%, #66cfc6 71%, #277c80 100%)",
  },
  {
    id: "garnet",
    title: "Garnet Signature",
    finish: "Ox-blood enamel with ruby reflections",
    institution: "HSBC",
    accountName: "HSBC",
    accountNumber: "•••• 4818",
    amount: "£2,840.13",
    accent: "#ff9f9f",
    foreground: "#fff7f7",
    background:
      "radial-gradient(circle at 22% 14%, rgba(255, 155, 147, 0.32), transparent 25%), linear-gradient(135deg, #34070e 0%, #711426 31%, #b92b3f 50%, #761326 72%, #29050d 100%)",
  },
  {
    id: "amethyst",
    title: "Amethyst Velvet",
    finish: "Smoked violet with a soft prismatic band",
    institution: "PayPal",
    accountName: "PayPal",
    accountNumber: "•••• 5067",
    amount: "$3,208.44",
    accent: "#d4b6ff",
    foreground: "#fcf8ff",
    background:
      "radial-gradient(circle at 76% 68%, rgba(224, 183, 255, 0.28), transparent 32%), linear-gradient(126deg, #1e102f 0%, #4d286d 32%, #8c58aa 50%, #4d2a68 72%, #160b24 100%)",
  },
  {
    id: "arctic-silver",
    title: "Arctic Silver",
    finish: "Cool brushed steel with a frost-white face",
    institution: "RCBC",
    accountName: "RCBC",
    accountNumber: "•••• 1014",
    amount: "₱96,417.35",
    accent: "#607487",
    foreground: "#15202b",
    background:
      "radial-gradient(circle at 18% 12%, rgba(255, 255, 255, 0.95), transparent 26%), linear-gradient(128deg, #778896 0%, #c9d2da 31%, #f4f7f8 50%, #acbac5 72%, #637482 100%)",
  },
  {
    id: "copper-carbon",
    title: "Copper Carbon",
    finish: "Forged carbon with a burnished copper flare",
    institution: "GoTyme",
    accountName: "GoTyme",
    accountNumber: "•••• 8872",
    amount: "₱42,706.18",
    accent: "#dc9154",
    foreground: "#fff8f1",
    background:
      "radial-gradient(circle at 72% 20%, rgba(245, 153, 80, 0.34), transparent 27%), linear-gradient(132deg, #111315 0%, #2b2d2e 30%, #8e4c27 50%, #2d2927 70%, #0a0c0d 100%)",
  },
];

const buildSampleBrand = (sample: LuxuryCardSample): AccountBrand => ({
  ...getAccountBrand({ institution: sample.institution, name: sample.accountName, type: "bank" }),
  accent: sample.accent,
  background: sample.background,
  foreground: sample.foreground,
});

export function AccountCardLuxuryGallery() {
  return (
    <main className="card-atelier">
      <header className="card-atelier__hero">
        <div>
          <p className="card-atelier__eyebrow">Clover Card Atelier</p>
          <h1>Luxury, without losing clarity.</h1>
          <p className="card-atelier__intro">
            Ten background directions using Clover&apos;s current account-card layout, fields, and institution marks.
            Each finish is designed to be assigned independently, so an account collection feels personal rather than
            repetitive.
          </p>
        </div>
        <a className="card-atelier__back" href="/accounts">
          Back to Accounts
        </a>
      </header>

      <section className="card-atelier__grid" aria-label="Luxury account card background concepts">
        {samples.map((sample, index) => (
          <article className="card-atelier__sample" key={sample.id}>
            <div className="card-atelier__sample-heading">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2>{sample.title}</h2>
                <p>{sample.finish}</p>
              </div>
            </div>
            <FinancialAccountCard
              accountBrand={buildSampleBrand(sample)}
              name={sample.accountName}
              accountNumber={sample.accountNumber}
              amount={sample.amount}
              className={`luxury-account-card luxury-account-card--${sample.id}`}
              onOpen={() => undefined}
              openLabel={`Preview ${sample.title}`}
            />
          </article>
        ))}
      </section>

      <footer className="card-atelier__note">
        <span>Design note</span>
        <p>
          These are visual candidates only. No production account is randomized yet, so we can refine the palette and
          contrast before choosing assignment rules.
        </p>
      </footer>
    </main>
  );
}
