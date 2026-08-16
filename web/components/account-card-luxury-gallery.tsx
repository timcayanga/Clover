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
};

const samples: LuxuryCardSample[] = [
  {
    id: "guilloche",
    title: "Guilloche Reserve",
    finish: "Maya black with fine watch-dial geometry",
    institution: "Maya",
    accountName: "Maya",
    accountNumber: "•••• 2608",
    amount: "₱60,184.87",
  },
  {
    id: "architectural",
    title: "Architectural Alloy",
    finish: "UnionBank orange with precise stepped lines",
    institution: "UnionBank",
    accountName: "UnionBank",
    accountNumber: "•••• 8037",
    amount: "₱84,520.00",
  },
  {
    id: "faceted",
    title: "Faceted Ruby",
    finish: "BPI red shaped into subtle gemstone planes",
    institution: "BPI",
    accountName: "BPI",
    accountNumber: "•••• 3012",
    amount: "₱301,149.30",
  },
  {
    id: "orbit",
    title: "Orbital Blue",
    finish: "GCash blue with sweeping celestial rings",
    institution: "GCash",
    accountName: "GCash",
    accountNumber: "•••• 9926",
    amount: "₱28,450.75",
  },
  {
    id: "pinstripe",
    title: "Sapphire Pinstripe",
    finish: "Metrobank blue with tailored metallic lines",
    institution: "Metrobank",
    accountName: "Metrobank",
    accountNumber: "•••• 6453",
    amount: "₱51,539.61",
  },
  {
    id: "topographic",
    title: "Topographic Lime",
    finish: "Wise green with flowing contour lines",
    institution: "Wise",
    accountName: "Wise",
    accountNumber: "•••• 8345",
    amount: "£1,426.20",
  },
  {
    id: "ribbon",
    title: "Crimson Ribbon",
    finish: "HSBC red with sculpted interlocking bands",
    institution: "HSBC",
    accountName: "HSBC",
    accountNumber: "•••• 4818",
    amount: "£2,840.13",
  },
  {
    id: "monogram",
    title: "Monogram Navy",
    finish: "PayPal blue with a restrained woven motif",
    institution: "PayPal",
    accountName: "PayPal",
    accountNumber: "•••• 5067",
    amount: "$3,208.44",
  },
  {
    id: "brushed",
    title: "Brushed Azure",
    finish: "RCBC blue with a satin-metal grain",
    institution: "RCBC",
    accountName: "RCBC",
    accountNumber: "•••• 1014",
    amount: "₱96,417.35",
  },
  {
    id: "prism",
    title: "Aqua Prism",
    finish: "GoTyme aqua with translucent geometric light",
    institution: "GoTyme",
    accountName: "GoTyme",
    accountNumber: "•••• 8872",
    amount: "₱42,706.18",
  },
];

const parseHex = (hex: string) => {
  const value = hex.replace("#", "");
  return value.length === 6
    ? [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16))
    : [0, 0, 0];
};

const mix = (hex: string, target: "#000000" | "#ffffff", amount: number) => {
  const source = parseHex(hex);
  const destination = parseHex(target);
  return `rgb(${source
    .map((channel, index) => Math.round(channel + ((destination[index] ?? 0) - channel) * amount))
    .join(", ")})`;
};

const contrastForeground = (accent: string) => {
  const [red, green, blue] = parseHex(accent).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const luminance = (red ?? 0) * 0.2126 + (green ?? 0) * 0.7152 + (blue ?? 0) * 0.0722;
  return luminance > 0.42 ? "#0b1118" : "#ffffff";
};

const buildSampleBrand = (sample: LuxuryCardSample): AccountBrand => {
  const base = getAccountBrand({ institution: sample.institution, name: sample.accountName, type: "bank" });
  return {
    ...base,
    background: `linear-gradient(135deg, ${mix(base.accent, "#000000", 0.24)} 0%, ${base.accent} 48%, ${mix(base.accent, "#ffffff", 0.2)} 100%)`,
    foreground: contrastForeground(base.accent),
  };
};

export function AccountCardLuxuryGallery() {
  return (
    <main className="card-atelier">
      <header className="card-atelier__hero">
        <div>
          <p className="card-atelier__eyebrow">Clover Card Atelier</p>
          <h1>Brand color. Individual character.</h1>
          <p className="card-atelier__intro">
            Ten abstract background directions using Clover&apos;s current account-card layout, fields, and institution
            marks. Every finish preserves the bank&apos;s own color, with contrast selected automatically for legibility.
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
          These are visual candidates only. No production account is randomized yet, so we can refine the patterns and
          contrast before choosing assignment rules.
        </p>
      </footer>
    </main>
  );
}
