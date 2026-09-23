import type { InputHTMLAttributes } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
}

export function TextField({
  id,
  label,
  hint,
  className = "",
  ...props
}: TextFieldProps) {
  return (
    <label className={["field", className].filter(Boolean).join(" ")} htmlFor={id}>
      <span className="field__label">{label}</span>
      <input className="field__input" id={id} {...props} />
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}
