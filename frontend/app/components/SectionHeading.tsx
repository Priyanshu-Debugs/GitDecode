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
    <div className={`flex flex-col gap-4 ${centered ? "items-center text-center" : ""}`}>
      {tag && (
        <div className="flex items-center gap-2 mb-1 select-none">
          <span className="w-1.5 h-1.5 rounded-full bg-[#c8ccd4] shadow-[0_0_6px_#c8ccd4] animate-pulse" />
          <span className="text-[10px] font-semibold font-mono uppercase tracking-[0.25em] text-[#c8ccd4]">
            {tag}
          </span>
        </div>
      )}
      <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-white leading-tight font-display">
        {title}
      </h2>
      {subtitle && (
        <p className="text-[15px] md:text-base text-[var(--color-text-secondary)] max-w-2xl leading-relaxed font-sans font-light">
          {subtitle}
        </p>
      )}
    </div>
  );
}
