import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ApiPodAttachment } from '@/api';
import { hasSavedPodPhoto, type PodReadiness } from '@/utils/podRequirement';

export const podAttachmentsKey = (recordId: string) => ['pod-attachments', recordId] as const;

export function usePodAttachments(recordId: string) {
  const client = useQueryClient();
  const queryKey = podAttachmentsKey(recordId);
  const mutationKey = ['pod-attachment-write', recordId];
  const query = useQuery({
    queryKey,
    queryFn: () => api.getRecordAttachments(recordId),
    enabled: Boolean(recordId),
  });
  const upload = useMutation({
    mutationKey,
    mutationFn: async (files: readonly File[]) => {
      // Cancel old reads so they cannot overwrite a successfully saved upload.
      await client.cancelQueries({ queryKey });
      for (const file of files) {
        const saved = await api.uploadRecordAttachment(recordId, file);
        client.setQueryData<ApiPodAttachment[]>(queryKey, previous => [saved, ...(previous ?? [])]);
      }
    },
    onSettled: () => client.invalidateQueries({ queryKey }),
  });
  const remove = useMutation({
    mutationKey,
    mutationFn: ({ id: attachmentId, remarks }: { id: string; remarks: string }) => api.deleteRecordAttachment(recordId, attachmentId, remarks),
    onSettled: () => client.invalidateQueries({ queryKey }),
  });
  const uploading = useIsMutating({ mutationKey }) > 0;
  const files = query.data ?? [];
  const readiness: PodReadiness = {
    loading: query.isPending || query.isFetching,
    uploading,
    hasPhoto: hasSavedPodPhoto(files),
    loadFailed: query.isError,
  };
  return { files, readiness, uploadFiles: upload.mutateAsync, removeFile: remove.mutateAsync, reload: query.refetch };
}
