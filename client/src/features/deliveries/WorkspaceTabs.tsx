import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface WorkspaceTab {
  id: string;
  label: string;
  icon: ReactNode;
}

export function tabFocusTarget(key: string, index: number, count: number): number | null {
  if (!count) return null;
  switch (key) {
    case 'ArrowRight': return (index + 1) % count;
    case 'ArrowLeft': return (index + count - 1) % count;
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return null;
  }
}

// Keep visited panels mounted so tab navigation never discards an unfinished form.
// The record workspace keys this component by record to isolate drafts between records.
export default function WorkspaceTabs({ id, tabs, renderPanel }: {
  id: string;
  tabs: WorkspaceTab[];
  renderPanel: (id: string) => ReactNode;
}) {
  const first = tabs[0]?.id;
  const [active, setActive] = useState(first);
  const [focused, setFocused] = useState(first);
  const [visited, setVisited] = useState(() => new Set(first ? [first] : []));
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  const activate = (tabId: string) => {
    setActive(tabId);
    setFocused(tabId);
    setVisited(previous => new Set([...previous, tabId]));
  };

  const handleKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const target = tabFocusTarget(event.key, index, tabs.length);
    if (target === null) return; // Native button Enter/Space activates through onClick.
    event.preventDefault();
    const tabId = tabs[target].id;
    setFocused(tabId);
    buttons.current[tabId]?.focus();
    buttons.current[tabId]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="border-b border-slate-200 overflow-x-auto">
        <div
          role="tablist"
          aria-label="Delivery record sections"
          aria-orientation="horizontal"
          onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) setFocused(active);
          }}
          className="flex items-stretch min-w-max"
        >
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              ref={element => { buttons.current[tab.id] = element; }}
              id={`${id}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={active === tab.id}
              aria-controls={`${id}-panel-${tab.id}`}
              tabIndex={focused === tab.id ? 0 : -1}
              onFocus={() => setFocused(tab.id)}
              onKeyDown={event => handleKey(event, index)}
              onClick={() => activate(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm whitespace-nowrap border-b-[3px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#0078C1] ${
                active === tab.id
                  ? 'border-[#1F3864] text-[#1F3864] bg-blue-50/70 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100 font-medium'
              }`}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>
      </div>
      {tabs.map(tab => (
        <div
          key={tab.id}
          id={`${id}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${tab.id}`}
          hidden={active !== tab.id}
          tabIndex={0}
          className="p-4 sm:p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#0078C1]"
        >
          {visited.has(tab.id) ? renderPanel(tab.id) : null}
        </div>
      ))}
    </div>
  );
}
