type FeatureArtworkProps = {
  src: string;
  alt: string;
  priority?: boolean;
};

export function FeatureArtwork({ src, alt, priority = false }: FeatureArtworkProps) {
  return (
    <img
      className="landing-asset__image feature-detail-page__image"
      src={src}
      alt={alt}
      width={1024}
      height={1024}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
    />
  );
}
