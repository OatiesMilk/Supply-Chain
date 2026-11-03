import { ActionDialog } from '@/components/ActionDialog';

interface Props {
  open: boolean;
  name: string;
  email: string;
  role: string;
  canManageAdmin: boolean;
  onOpenAdmin: () => void;
  onDismiss: () => void;
}

export default function AccountSettingsDialog({
  open, name, email, role, canManageAdmin, onOpenAdmin, onDismiss,
}: Props) {
  return (
    <ActionDialog open={open} title="Settings" description="View your account details and available account tools." onDismiss={onDismiss}>
      <section aria-labelledby="account-settings-profile" className="space-y-3">
        <h3 id="account-settings-profile" className="text-sm font-semibold text-slate-900">My account</h3>
        <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <dt className="text-slate-500">Name</dt>
          <dd className="break-words font-medium text-slate-800">{name}</dd>
          <dt className="text-slate-500">Email</dt>
          <dd className="break-all font-medium text-slate-800">{email}</dd>
          <dt className="text-slate-500">Role</dt>
          <dd className="break-words font-medium text-slate-800">{role}</dd>
        </dl>
        <p className="text-xs leading-5 text-slate-500">These details are read-only. Contact your administrator to request an account change.</p>
      </section>

      {canManageAdmin && (
        <section aria-labelledby="account-settings-admin" className="space-y-3 border-t border-slate-100 pt-4">
          <div>
            <h3 id="account-settings-admin" className="text-sm font-semibold text-slate-900">Administration</h3>
            <p className="mt-1 text-sm leading-5 text-slate-600">Manage accounts, role defaults, and individual permissions in the existing Admin Panel.</p>
          </div>
          <button type="button" onClick={onOpenAdmin}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
            Open Admin Panel
          </button>
        </section>
      )}
    </ActionDialog>
  );
}
