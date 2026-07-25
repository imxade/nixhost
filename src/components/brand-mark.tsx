export function BrandMark({ className = "size-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" data-brand-mark fill="none">
      <rect width="32" height="32" rx="9" fill="var(--color-primary)" />
      <path
        d="M9.25 22.75V9.25L22.75 22.75V9.25"
        stroke="var(--color-primary-content)"
        strokeWidth="3.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="22.75" cy="9.25" r="2.25" fill="var(--color-secondary)" />
    </svg>
  );
}
