import RecordStatus from '@/components/RecordStatus';

type Props = {
  record: Parameters<typeof RecordStatus>[0]['record'];
  /** Drop the "RMA:" prefix inside tables that only list one category. */
  hideCategoryPrefix?: boolean;
};

export default function StatusPill({ record, hideCategoryPrefix = false }: Props) {
  return <RecordStatus record={record} compact={hideCategoryPrefix} />;
}
