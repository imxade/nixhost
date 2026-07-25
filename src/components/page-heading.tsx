export function PageHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex min-w-0 flex-col gap-4 sm:mb-7 md:flex-row md:flex-wrap md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-base-content/65 sm:text-base">
          {description}
        </p>
      </div>
      {actions && (
        <div className="flex w-full flex-wrap gap-2 sm:w-auto [&>.btn]:min-w-0 [&>.btn]:flex-1 sm:[&>.btn]:flex-none">
          {actions}
        </div>
      )}
    </div>
  );
}
