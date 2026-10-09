export function AdminPageHeader({ title }: { title: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Internal
      </p>
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
    </div>
  );
}
