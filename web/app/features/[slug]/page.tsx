import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LandingNav } from "@/components/landing-nav";
import { LandingStoryReveal } from "@/components/landing-story-reveal";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingPlaceholderVisual } from "@/components/marketing-placeholder-visual";
import { resolvePublicAccountState } from "@/lib/public-account-state";
import { FEATURE_PAGE_MAP, isFeatureSlug, resolveFeatureSlug } from "@/lib/public-site";

type FeatureDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: FeatureDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolvedSlug = resolveFeatureSlug(slug);

  if (!isFeatureSlug(resolvedSlug)) {
    return {
      title: "Features | Clover",
    };
  }

  const page = FEATURE_PAGE_MAP.get(resolvedSlug);

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
  const resolvedSlug = resolveFeatureSlug(slug);

  if (!isFeatureSlug(resolvedSlug)) {
    notFound();
  }

  if (resolvedSlug !== slug) {
    redirect(`/features/${resolvedSlug}`);
  }

  const page = FEATURE_PAGE_MAP.get(resolvedSlug);

  if (!page) {
    notFound();
  }

  const accountState = await resolvePublicAccountState();
  const heroSection =
    page.heroTitle && page.heroCopy && page.heroPlaceholder
      ? [
          {
            id: "overview",
            eyebrow: page.heroEyebrow ?? "",
            title: page.heroTitle,
            body: [page.heroCopy],
            placeholder: page.heroPlaceholder,
            featured: page.featured ?? false,
          },
        ]
      : [];
  const sections = [
    ...heroSection,
    ...page.sections.map((section) => ({
      ...section,
      featured: false,
    })),
  ].map((section, index) => ({
    ...section,
    isLead: index === 0,
  }));

  const pageClassName = `landing-page feature-detail-page ${sections.length === 1 ? "feature-detail-page--single" : "feature-detail-page--multi"}`.trim();

  return (
    <main className={pageClassName}>
      <LandingNav accountState={accountState} />

      <div className="feature-detail-page__inner">
        {sections.map((section, index) => {
          const reverse = index % 2 === 1;
          const sectionClassName = `landing-feature feature-detail-page__section ${reverse ? "landing-feature--reverse" : ""} ${section.isLead ? "feature-detail-page__section--lead" : ""}`.trim();

          return (
            <LandingStoryReveal
              key={section.id}
              as="section"
              id={section.id}
              initialVisible={index === 0}
              className={sectionClassName}
            >
              <div className="landing-feature__copy feature-detail-page__section-copy">
                {section.isLead ? <h1 className="landing-feature__title">{section.title}</h1> : <h2 className="landing-feature__title">{section.title}</h2>}
                <div className="landing-feature__body">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </div>

              <div className="landing-feature__visual feature-detail-page__visual">
                <MarketingPlaceholderVisual
                  eyebrow=""
                  title="Image placeholder"
                  description={section.placeholder}
                  featured={section.featured}
                />
              </div>
            </LandingStoryReveal>
          );
        })}

      </div>

      <MarketingFooter />
    </main>
  );
}
