// The editorial lead sentence at the top of the Overview. Pure text: the
// leading count token (when the sentence starts with a number) is pulled out
// and set in the display face so it reads as a headline figure.

export function Briefing({ text }: { text: string }) {
  const spaceAt = text.indexOf(" ");
  const lead = spaceAt === -1 ? text : text.slice(0, spaceAt);
  const rest = spaceAt === -1 ? "" : text.slice(spaceAt + 1);
  const hasLeadNumber = /^\d+$/.test(lead);

  return (
    <p className="max-w-[42ch] text-lg leading-relaxed text-foreground">
      {hasLeadNumber ? (
        <>
          <span className="mr-1 font-mono text-3xl font-semibold text-primary">
            {lead}
          </span>{" "}
          {rest}
        </>
      ) : (
        text
      )}
    </p>
  );
}
