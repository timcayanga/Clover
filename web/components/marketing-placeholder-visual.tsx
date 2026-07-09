type MarketingPlaceholderVisualProps = {
  eyebrow: string;
  title: string;
  description: string;
  featured?: boolean;
};

export function MarketingPlaceholderVisual({ eyebrow, title, description, featured = false }: MarketingPlaceholderVisualProps) {
  return (
    <div className={`marketing-placeholder ${featured ? "marketing-placeholder--featured" : ""}`.trim()} aria-hidden="true">
      <div className="marketing-placeholder__frame">
        <span className="marketing-placeholder__eyebrow">{eyebrow}</span>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}
