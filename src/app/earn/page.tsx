import { EarnForm } from "./earn-form";

interface Props {
  searchParams: Promise<{ order?: string }>;
}

export const revalidate = 0;

export default async function EarnPage({ searchParams }: Props) {
  const { order } = await searchParams;
  if (!order) {
    return (
      <main className="mx-auto max-w-sm p-6 text-center text-sm text-muted-foreground">
        Missing order reference.
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <EarnForm orderId={order} />
    </main>
  );
}
