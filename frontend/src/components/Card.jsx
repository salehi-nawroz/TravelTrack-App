import styles from "./Card.module.css";

// Shared surface for panels in the sidebar (forms, details, admin
// sections): card background, radius and padding. Layout inside (flex,
// gaps) stays with the caller's className.
//   as:      element to render ("div" by default; "form", "section", ...)
//   padding: "lg" (2rem 3rem, default) | "md" (1.6rem)
// Other props (onSubmit, aria-*, ...) go to the element.
function Card({
  as: Element = "div",
  padding = "lg",
  className = "",
  children,
  ...rest
}) {
  return (
    <Element
      className={`${styles.card} ${styles[padding]} ${className}`}
      {...rest}
    >
      {children}
    </Element>
  );
}

export default Card;
