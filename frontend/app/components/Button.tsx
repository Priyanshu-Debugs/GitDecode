import React from "react";
import Link from "next/link";

type ButtonVariant = "primary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  href?: string;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "btn-sm",
  md: "btn-md",
  lg: "btn-lg",
};

export default function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  href,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = [
    "btn",
    "group",
    variantStyles[variant],
    sizeStyles[size],
    fullWidth ? "btn-full" : "",
    className,
  ].join(" ");

  const childrenArray = React.Children.toArray(children);
  const processedChildren = childrenArray.map((child, idx) => {
    // If the child is an object (element) and is not a string, let's treat it as a potential icon if it's rendered at the end
    if (React.isValidElement(child) && idx === childrenArray.length - 1 && typeof child.type !== "string") {
      return (
        <span
          key={`icon-wrap-${idx}`}
          className="ml-2 w-5 h-5 rounded-full bg-white/10 dark:bg-white/10 flex items-center justify-center transition-all duration-300 group-hover:translate-x-1 group-hover:-translate-y-[1px] group-hover:bg-white/15"
        >
          {child}
        </span>
      );
    }
    return child;
  });

  if (href) {
    return (
      <Link href={href} className={baseStyles}>
        {loading && <Spinner />}
        {processedChildren}
      </Link>
    );
  }

  return (
    <button className={baseStyles} disabled={disabled || loading} {...props}>
      {loading && <Spinner />}
      {processedChildren}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="opacity-25"
      />
      <path
        d="M4 12a8 8 0 018-8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="opacity-75"
      />
    </svg>
  );
}
