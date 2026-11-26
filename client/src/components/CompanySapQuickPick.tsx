/** Clickable SAP numbers of the selected company under a Reference (SAP Number) input.
 * The input stays free text; a click only fills it. Renders nothing for walk-in clients. */
export default function CompanySapQuickPick({ sapNumbers, value, onPick }: {
  sapNumbers: readonly string[]; value: string; onPick: (sapNumber: string) => void;
}) {
  if (!sapNumbers.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-label="Company SAP numbers">
      <span className="text-slate-500">Company SAP numbers:</span>
      {sapNumbers.map(sap => {
        const selected = value.trim().toLowerCase() === sap.toLowerCase();
        return (
          <button key={sap} type="button" aria-pressed={selected} onClick={() => onPick(sap)}
            className={`rounded-full border px-2 py-0.5 font-semibold tabular-nums transition-colors ${selected
              ? 'border-brand-blue bg-brand-blue/10 text-brand-blue' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
            {sap}
          </button>
        );
      })}
    </div>
  );
}
