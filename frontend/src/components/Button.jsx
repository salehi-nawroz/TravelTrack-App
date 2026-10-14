import { buttonClassName } from "./buttonClassName";

// Shared button.
//   variant:  primary | secondary | outline | danger | ghost | position
//             (the older `type` prop still works: "primary", "back",
//             "danger", "position")
//   size:     "md" (default) | "sm" for compact toolbar actions
//   iconOnly: square button for a single icon/glyph - give it an
//             aria-label, since it has no visible text
//   htmlType: the <button> type. Left unset by default, as before, so
//             buttons inside a <form> still submit it unless told otherwise.
// Any other props (aria-*, title, id, ...) go straight to the <button>.
function Button({
  children,
  variant,
  type,
  size,
  iconOnly,
  htmlType,
  className,
  ...rest
}) {
  return (
    <button
      type={htmlType}
      className={buttonClassName({
        variant: variant ?? type,
        size,
        iconOnly,
        className,
      })}
      {...rest}
    >
      {children}
    </button>
  );
}

export default Button;
