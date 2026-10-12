import React, { useState } from "react";

/**
 * Image intelligente avec placeholder skeleton + fade-in + optimisation Supabase.
 * Usage : <SmartImage src={url} alt="..." width={600} />
 */
export default function SmartImage({
  src,
  alt = "",
  className = "",
  width,
  quality = 75,
  priority = false,
  ...props
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // Optimisation Supabase Storage : resize + compression à la volée
  const optimizedSrc = React.useMemo(() => {
    if (!src) return "";
    // Supabase Storage supporte ?width=...&quality=... pour images
    if (src.includes("supabase.co/storage/") && src.match(/\.(jpg|jpeg|png|webp)/i)) {
      const sep = src.includes("?") ? "&" : "?";
      const params = [];
      if (width) params.push(`width=${width}`);
      params.push(`quality=${quality}`);
      return `${src}${sep}${params.join("&")}`;
    }
    return src;
  }, [src, width, quality]);

  if (!optimizedSrc) {
    return (
      <div className={`bg-secondary ${className}`} aria-hidden="true">
        <div className="w-full h-full bg-gradient-to-r from-secondary via-secondary/50 to-secondary animate-pulse" />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-secondary ${className}`}>
      {/* Skeleton pendant le chargement */}
      {!loaded && !error && (
        <div className="absolute inset-0 bg-gradient-to-r from-secondary via-gray-200 to-secondary animate-pulse" />
      )}

      <img
        src={optimizedSrc}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        fetchpriority={priority ? "high" : "auto"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={`w-full h-full object-cover transition-opacity duration-500 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
        {...props}
      />
    </div>
  );
}