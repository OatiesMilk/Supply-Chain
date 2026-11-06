import type { DeliveryCategory, DeliveryStatus, DeliveryRecord } from '../types';

export interface PodReadiness {
  loading: boolean;
  uploading: boolean;
  hasPhoto: boolean;
  loadFailed: boolean;
  hasStagedFiles: boolean;
}

export function deliveryPhotoError(category: DeliveryCategory, status: DeliveryStatus, pod?: PodReadiness): string | null {
  if (status !== 'Delivered' || category === 'RMA') return null;
  if (pod?.uploading) return 'Wait for the proof of delivery upload to finish.';
  if (!pod || pod.loading) return 'Checking proof of delivery photos…';
  if (pod.loadFailed) return 'Could not verify proof of delivery photos. Retry loading the attachments.';
  if (!pod.hasPhoto) return 'Upload at least one JPG or PNG delivery photo before completing this delivery. Documents alone do not count.';
  return null;
}

export function completionError(record: Pick<DeliveryRecord, 'category' | 'time_in'>, status: DeliveryStatus, receivedBy: string | null | undefined, pod?: PodReadiness): string | null {
  if (status !== 'Delivered') return null;
  if (record.category !== 'RMA' && !record.time_in) return 'Record Time In before completing this run.';
  if (!receivedBy?.trim()) return record.category === 'RMA' ? 'Recipient / Collector is required before completing this RMA.' : 'Received By is required before completing this run.';
  return deliveryPhotoError(record.category, status, pod);
}

export function hasSavedPodPhoto(files: readonly { id: string; is_photo?: boolean }[]): boolean {
  return files.some(file => Boolean(file.id) && file.is_photo === true);
}
