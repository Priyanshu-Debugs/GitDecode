interface SectionHeadingProps {
  tag?: string;
  title: string;
  subtitle?: string;
  centered?: boolean;
}

export default function SectionHeading({
  tag,
  title,
  subtitle,
  centered = false,
}: SectionHeadingProps) {
  return (
    <div className={`flex flex-col gap-3 ${centered ? "items-center text-center" : ""}`}>
      {tag && (
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#b01e0a]">
          {tag}
        </span>
      )}
      <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white leading-tight">
        {title}
      </h2>
      {subtitle && (
        <p className="text-lg text-[var(--color-text-secondary)] max-w-2xl leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
}
