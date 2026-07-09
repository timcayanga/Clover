import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LandingNav } from "@/components/landing-nav";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingPlaceholderVisual } from "@/components/marketing-placeholder-visual";
import { ScrollReveal } from "@/components/scroll-reveal";
import { resolvePublicAccountState } from "@/lib/public-account-state";
import { FEATURE_PAGE_MAP, isFeatureSlug } from "@/lib/public-site";

type FeatureDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: FeatureDetailPageProps): Promise<Metadata> {
  const { slug } = await params;

  if (!isFeatureSlug(slug)) {
    return {
      title: "Features | Clover",
    };
  }

  const page = FEATURE_PAGE_MAP.get(slug);

  if (!page) {
    return {
      title: "Features | Clover",
    };
  }

  return {
    title: `${page.navLabel} | Clover`,
    description: page.overview,
  };
}

export default async function FeatureDetailPage({ params }: FeatureDetailPageProps) {
  const { slug } = await params;

  if (!isFeatureSlug(slug)) {
    notFound();
  }

  const page = FEATURE_PAGE_MAP.get(slug);

  if (!page) {
    notFound();
  }

  const accountState = await resolvePublicAccountState();
  const sections = [
    {
      id: "overview",
      eyebrow: page.heroEyebrow,
      title: page.heroTitle,
      body: [page.heroCopy],
      placeholder: page.heroPlaceholder,
      featured: page.featured ?? false,
      isLead: true,
    },
    ...page.sections.map((section) => ({
      ...section,
      featured: false,
      isLead: false,
    })),
  ];

  return (
    <main className="landing-page feature-detail-page">
      <LandingNav accountState={accountState} />

      <div className="feature-detail-page__inner">
        {sections.map((section, index) => {
          const reverse = index % 2 === 1;
          const sectionClassName = `landing-feature feature-detail-page__section ${reverse ? "landing-feature--reverse" : ""} ${section.isLead ? "feature-detail-page__section--lead" : ""}`.trim();

          return (
            <ScrollReveal
              key={section.id}
              as="section"
              id={section.id}
              threshold={0.18}
              rootMargin="-6% 0px -6% 0px"
              className={sectionClassName}
            >
              <div className="landing-feature__copy feature-detail-page__section-copy">
                {!section.isLead ? <p className="eyebrow">{section.eyebrow}</p> : null}
                {section.isLead ? <h1 className="landing-feature__title">{section.title}</h1> : <h2 className="landing-feature__title">{section.title}</h2>}
                <div className="landing-feature__body">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </div>

              <div className="landing-feature__visual feature-detail-page__visual">
                <MarketingPlaceholderVisual
                  eyebrow={section.eyebrow}
                  title="Image placeholder"
                  description={section.placeholder}
                  featured={section.featured}
                />
              </div>
            </ScrollReveal>
          );
        })}

      </div>

      <MarketingFooter />
    </main>
  );
}
