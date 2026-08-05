import { Section as SharedSection } from "@merqo/ui";
import { ElevatedCard } from "@/components/elevated-card";

// Delegates header rendering (icon badge, eyebrow, title, description) to
// @merqo/ui's Section, keeping ElevatedCard — loopkit's own polished-card
// visual, deliberately not qkit's Ticket theme — as the local shell via the
// wrapper render-prop. Public shape is unchanged: every existing caller
// (profile-form.tsx, setup-form.tsx) needs zero changes.
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
