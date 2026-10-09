import { Section as SharedSection, ElevatedCard } from "@merqo/ui";

export function Section({
  icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  eyebrow?: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <SharedSection
      icon={icon}
      eyebrow={eyebrow}
      title={title}
      description={description}
      wrapper={(content) => (
        <ElevatedCard as="section" className="px-7 py-6">
          {content}
        </ElevatedCard>
      )}
    >
      {children}
    </SharedSection>
  );
}
