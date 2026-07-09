import Link from "next/link";
import { PUBLIC_NAV_CATEGORIES } from "@/lib/public-site";

export function MarketingFooter() {
  return (
    <footer className="landing-footer landing-footer--expanded" aria-label="Site footer">
      <div className="landing-footer__columns">
        {PUBLIC_NAV_CATEGORIES.map((category) => (
          <div key={category.label} className="landing-footer__column">
            <p className="landing-footer__heading">{category.label}</p>
            {category.items.map((item) => (
              <Link
                key={item.href}
                className={item.featured ? "landing-footer__link landing-footer__link--featured" : "landing-footer__link"}
                href={item.href}
                prefetch={false}
              >
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </footer>
  );
}
