export type PodPreviewAttachment = {
  is_photo: boolean;
};

export function splitPodAttachments<T extends PodPreviewAttachment>(files: readonly T[]) {
  return {
    photos: files.filter(file => file.is_photo),
    documents: files.filter(file => !file.is_photo),
  };
}

export function nextLightboxIndex(index: number, delta: number, length: number) {
  if (length <= 0) return 0;
  return ((index + delta) % length + length) % length;
}
