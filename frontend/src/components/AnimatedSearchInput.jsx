import React from "react";

/**
 * Input de recherche avec placeholder custom qui se termine par "..." quand trop long.
 * Le placeholder reste affiché tant que l'utilisateur n'a rien tapé.
 */
export default function AnimatedSearchInput({
  value,
  onChange,
  placeholder,
  onFocus,
  onBlur,
  className = "",
  rightIcon = null,
  ...props
}) {
  // ⭐ Le placeholder s'affiche UNIQUEMENT quand value est vide (peu importe le focus)
  const showPlaceholder = !value;

  return (
    <div className={`relative ${className}`}>
      <input
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder=""
        className="w-full h-full pl-4 pr-10 rounded-full bg-white border border-transparent text-sm outline-none focus:border-brand"
        {...props}
      />

      {/* Placeholder fake avec ellipsis garanti */}
      {showPlaceholder && (
        <div
          className="absolute inset-0 flex items-center pl-4 pr-10 pointer-events-none"
          aria-hidden="true"
        >
          <span className="text-ink-muted text-sm truncate w-full">
            {placeholder}
          </span>
        </div>
      )}

      {rightIcon && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10">
          {rightIcon}
        </div>
      )}
    </div>
  );
}