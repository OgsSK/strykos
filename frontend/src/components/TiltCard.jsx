import React, { useRef, useState, useEffect } from "react";

/**
 * Effet 3D "tilt" au survol : la carte s'incline en suivant la souris.
 * Désactivé automatiquement sur mobile/tactile et si l'utilisateur préfère
 * les animations réduites (accessibilité).
 */
export default function TiltCard({
  children,
  className = "",
  intensity = 8,
  scale = 1.02,
  glare = true,
  disabled = false,
  onMouseEnter,
  onMouseLeave,
  ...props
}) {
  const ref = useRef();
  const [transform, setTransform] = useState("");
  const [glareStyle, setGlareStyle] = useState({ opacity: 0 });
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    // Desactive sur tactile et si prefers-reduced-motion
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setEnabled(!isTouch && !reduce);
  }, []);

  const handleMove = (e) => {
    if (!enabled || disabled) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const rx = ((y - cy) / cy) * -intensity;
    const ry = ((x - cx) / cx) * intensity;

    setTransform(
      `perspective(1000px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale3d(${scale},${scale},${scale})`
    );

    if (glare) {
      const gx = (x / rect.width) * 100;
      const gy = (y / rect.height) * 100;
      setGlareStyle({
        opacity: 1,
        background: `radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,0.45), rgba(255,255,255,0.05) 45%, transparent 70%)`,
      });
    }
  };

  const handleLeave = (e) => {
    setTransform("");
    if (glare) setGlareStyle({ opacity: 0 });
    if (onMouseLeave) onMouseLeave(e);
  };

  return (
    <div
      ref={ref}
      className={`relative ${className}`}
      style={{
        transform,
        transition: transform ? "transform 0.08s ease-out" : "transform 0.4s ease-out",
        transformStyle: "preserve-3d",
        willChange: "transform",
      }}
      onMouseMove={handleMove}
      onMouseEnter={onMouseEnter}
      onMouseLeave={handleLeave}
      {...props}
    >
      {children}
      {glare && enabled && !disabled && (
        <div
          className="pointer-events-none absolute inset-0 z-10 mix-blend-overlay"
          style={{
            ...glareStyle,
            transition: "opacity 0.3s ease-out, background 0.08s ease-out",
          }}
        />
      )}
    </div>
  );
}