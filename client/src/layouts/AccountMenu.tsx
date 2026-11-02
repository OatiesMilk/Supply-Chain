import { useRef, useState } from 'react';
import {
  autoUpdate, flip, offset, shift, FloatingFocusManager, FloatingPortal,
  useClick, useDismiss, useFloating, useInteractions, useListNavigation, useRole,
} from '@floating-ui/react';
import { CircleHelp, LogOut, UserRound } from 'lucide-react';
import { ActionDialog } from '@/components/ActionDialog';

interface Props {
  name: string;
  role: string;
  onLogout: () => void;
}

export default function AccountMenu({ name, role, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const items = useRef<Array<HTMLButtonElement | null>>([]);
  const { refs, floatingStyles, context } = useFloating({
    open, onOpenChange: setOpen, placement: 'bottom-end', strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [offset(10), flip({ padding: 12 }), shift({ padding: 12 })],
  });
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    useClick(context), useDismiss(context), useRole(context, { role: 'menu' }),
    useListNavigation(context, { listRef: items, activeIndex, onNavigate: setActiveIndex, loop: true }),
  ]);
  const itemClass = 'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-700';

  return <>
    <button
      ref={refs.setReference} {...getReferenceProps()} type="button"
      aria-label="Account menu" title="Account menu" id="account-menu-button"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1F3864] text-white transition-colors hover:bg-[#0078C1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
    >
      <UserRound className="h-4 w-4" aria-hidden="true" />
    </button>
    {open && <FloatingPortal>
      <FloatingFocusManager context={context} modal={false} returnFocus>
        <div ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()} aria-label="Account"
          className="z-50 w-64 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-slate-700 shadow-xl">
          <div role="presentation" className="mb-1 border-b border-slate-100 px-3 py-3">
            <p className="break-words text-sm font-semibold text-slate-900">{name}</p>
            <p className="mt-1 text-xs text-slate-500">{role}</p>
          </div>
          <button ref={element => { items.current[0] = element; }} {...getItemProps()}
            type="button" role="menuitem" tabIndex={activeIndex === 0 ? 0 : -1}
            onClick={() => { setOpen(false); setHelpOpen(true); }}
            className={`${itemClass} hover:bg-slate-50 focus:bg-slate-50`}>
            <CircleHelp className="h-4 w-4" aria-hidden="true" /> Help
          </button>
          <button ref={element => { items.current[1] = element; }} {...getItemProps()}
            type="button" role="menuitem" tabIndex={activeIndex === 1 ? 0 : -1}
            id="logout-button" onClick={() => { setOpen(false); onLogout(); }}
            className={`${itemClass} text-red-700 hover:bg-red-50 focus:bg-red-50`}>
            <LogOut className="h-4 w-4" aria-hidden="true" /> Log out
          </button>
        </div>
      </FloatingFocusManager>
    </FloatingPortal>}
    <ActionDialog open={helpOpen} title="Help" description="A quick guide to the Supply Chain Portal."
      onDismiss={() => {
        setHelpOpen(false);
        requestAnimationFrame(() => {
          const trigger = refs.domReference.current;
          if (trigger instanceof HTMLElement) trigger.focus();
        });
      }}>
      <div className="space-y-3 text-sm leading-6 text-slate-600">
        <p><strong className="text-slate-800">Find your work.</strong> Use the navigation menu to open the modules available to your account.</p>
        <p><strong className="text-slate-800">Search.</strong> Click the search icon or press Ctrl+K (Cmd+K on Mac) to find records and modules.</p>
        <p><strong className="text-slate-800">Get assistance.</strong> Contact your system administrator for account access or workflow questions.</p>
      </div>
    </ActionDialog>
  </>;
}
