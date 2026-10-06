import type { DeliveryCategory, DeliveryStatus } from '../types';

export interface PodReadiness {
  loading: boolean;
  uploading: boolean;
  hasPhoto: boolean;
  loadFailed: boolean;
}

export function deliveryPhotoError(category: DeliveryCategory, status: DeliveryStatus, pod?: PodReadiness): string | null {
  if (category !== 'Deliveries' || status !== 'Delivered') return null;
  if (pod?.uploading) return 'Wait for the proof of delivery upload to finish.';
  if (!pod || pod.loading) return 'Checking proof of delivery photos…';
  if (pod.loadFailed) return 'Could not verify proof of delivery photos. Retry loading the attachments.';
  if (!pod.hasPhoto) return 'Upload at least one JPG or PNG delivery photo before completing this delivery. Documents alone do not count.';
  return null;
}

export function hasSavedPodPhoto(files: readonly { id: string; is_photo?: boolean }[]): boolean {
  return files.some(file => Boolean(file.id) && file.is_photo === true);
}
