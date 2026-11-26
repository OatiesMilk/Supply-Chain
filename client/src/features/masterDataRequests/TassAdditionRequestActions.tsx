import { useEffect, useState } from 'react';
import { ClipboardList, FilePlus2 } from 'lucide-react';
import type { MasterDataEntityType } from '@/api';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/authStore';
import { MASTER_DATA_REQUEST_SUMMARY, useMasterDataRequestsQuery } from '@/api/queries/useMasterDataRequestsQuery';
import { btnSecondaryClass } from '@/utils/uiClasses';
import MasterDataAdditionRequestDialog from './MasterDataAdditionRequestDialog';
import MyAdditionRequestsModal from './MyAdditionRequestsModal';

/** Screens that make a LEGACY session an RMA editor (server recordAccess.canWriteCategory). */
export const LEGACY_RMA_EDITOR_SCREENS = ['rma', 'driver_dashboard', 'driver', 'calendar', 'driver_board'] as const;

/** Mirrors the server: only TASS submits, with RMA write plus read access to the target directory.
 * V1 evaluates RMA write on the client (screen-independent, so Suppliers works). A LEGACY client cannot
 * see RMA policy overrides, so it also requires an RMA editor screen and the server's own capabilities. */
export function useMasterDataRequestAccess() {
  const role = useAuthStore(state => state.authUser?.role);
  const access = usePermissions();
  const tass = role === 'TASS';
  const companies = access.canResource('companies', 'READ');
  const suppliers = access.canResource('suppliers', 'READ');
  const canReadOwnRequests = tass && (companies || suppliers);
  // One shared, smallest list read: exact pending count plus server capabilities.
  const summary = useMasterDataRequestsQuery(MASTER_DATA_REQUEST_SUMMARY, canReadOwnRequests);
  const serverCaps = summary.data?.capabilities;
  const legacyRmaScreen = access.canResource('records') && LEGACY_RMA_EDITOR_SCREENS.some(screen => access.canAccess(screen));
  const rmaWrite = access.v1 ? access.can('CATEGORY', 'RMA', 'WRITE') : legacyRmaScreen;
  // V1 evaluates RMA write on the client; LEGACY requires a successful summary with an explicit
  // affirmative server capability. A failed refetch keeps stale data, so a pending, failed or
  // failed-refetch summary never exposes a submit the server would refuse.
  const serverAllowsCompany = access.v1 ? (serverCaps?.can_submit_company ?? true) : summary.isSuccess && serverCaps?.can_submit_company === true;
  const serverAllowsSupplier = access.v1 ? (serverCaps?.can_submit_supplier ?? true) : summary.isSuccess && serverCaps?.can_submit_supplier === true;
  return {
    canRequestCompany: tass && rmaWrite && companies && serverAllowsCompany,
    canRequestSupplier: tass && rmaWrite && suppliers && serverAllowsSupplier,
    canReadOwnRequests,
    pendingCount: summary.data?.counts.pending ?? 0,
  };
}

/** TASS toolbar actions on RMA and Suppliers: send a request, and follow "My Requests". */
export default function TassAdditionRequestActions({ variant, selectedAdditionRequestId = null, clearSelectedAdditionRequestId }: {
  variant: 'rma' | 'suppliers';
  selectedAdditionRequestId?: string | null;
  clearSelectedAdditionRequestId?: () => void;
}) {
  const { canRequestCompany, canRequestSupplier, canReadOwnRequests, pendingCount: pending } = useMasterDataRequestAccess();
  const allowedTypes: MasterDataEntityType[] = variant === 'suppliers'
    ? (canRequestSupplier ? ['SUPPLIER'] : [])
    : [...(canRequestCompany ? ['COMPANY' as const] : []), ...(canRequestSupplier ? ['SUPPLIER' as const] : [])];
  const [requesting, setRequesting] = useState(false);
  const [showMine, setShowMine] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // A notification click or ?request= link opens My Requests on that request, once.
  useEffect(() => {
    if (!selectedAdditionRequestId || !canReadOwnRequests) return;
    setHighlightId(selectedAdditionRequestId);
    setShowMine(true);
    clearSelectedAdditionRequestId?.();
  }, [selectedAdditionRequestId, canReadOwnRequests, clearSelectedAdditionRequestId]);

  if (!canReadOwnRequests) return null;
  return (
    <>
      {allowedTypes.length > 0 && (
        <button type="button" className={btnSecondaryClass} onClick={() => { setNotice(null); setRequesting(true); }}>
          <FilePlus2 aria-hidden="true" className="h-4 w-4" />{variant === 'suppliers' ? 'Request Supplier' : 'Request Company / Supplier'}
        </button>
      )}
      <button type="button" className={btnSecondaryClass} onClick={() => { setHighlightId(null); setShowMine(true); }}
        aria-label={pending ? `My Requests, ${pending} pending` : 'My Requests'}>
        <ClipboardList aria-hidden="true" className="h-4 w-4" />My Requests
        {pending > 0 && <span aria-hidden="true" className="ml-1 rounded-full bg-amber-100 px-1.5 text-xs font-bold text-amber-900 tabular-nums">{pending}</span>}
      </button>
      {notice && <span role="status" className="text-xs font-semibold text-emerald-800">{notice}</span>}
      {requesting && (
        <MasterDataAdditionRequestDialog allowedTypes={allowedTypes} initialEntityType={allowedTypes[0]}
          onClose={submitted => { setRequesting(false); if (submitted) setNotice(`Request sent for "${submitted.name}".`); }} />
      )}
      {showMine && (
        <MyAdditionRequestsModal highlightedRequestId={highlightId} onClose={() => { setShowMine(false); setHighlightId(null); }}
          onNewRequest={allowedTypes.length ? () => { setShowMine(false); setRequesting(true); } : undefined} />
      )}
    </>
  );
}
