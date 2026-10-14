import styles from "./Button.module.css";

// Older call sites name variants by role ("back" for the outlined
// secondary button); they keep working.
const LEGACY_VARIANTS = { back: "secondary" };

// Class names for the shared button look, so the same styles can be put on
// elements that must stay something else - e.g. a router <Link>, or the
// CSV import trigger - without duplicating CSS. Button uses it too.
//   variant: primary | secondary | outline | danger | ghost | position
//   size:    "md" (default) | "sm" (compact)
export function buttonClassName({
  variant = "primary",
  size = "md",
  iconOnly = false,
  className = "",
} = {}) {
  const resolved = LEGACY_VARIANTS[variant] ?? variant;

  return [
    styles.btn,
    styles[resolved],
    size === "sm" ? styles.sm : "",
    iconOnly ? styles.iconOnly : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}
