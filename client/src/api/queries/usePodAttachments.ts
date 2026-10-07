import { useIsMutating, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, type ApiPodAttachment } from '@/api';
import { hasSavedPodPhoto, type PodReadiness } from '@/utils/podRequirement';
import { getStagedFiles, saveStagedFile, removeStagedFile, clearStagedFiles, type StagedFile } from '@/utils/idbFiles';

export const podAttachmentsKey = (recordId: string) => ['pod-attachments', recordId] as const;
export const podStagedKey = (recordId: string) => ['pod-staged', recordId] as const;

export async function uploadStagedFiles(recordId: string, client?: QueryClient): Promise<void> {
  if (!recordId) return;
  const staged = await getStagedFiles(recordId);
  if (staged.length === 0) return;
  const queryKey = podAttachmentsKey(recordId);
  const stagedKey = podStagedKey(recordId);
  if (client) await client.cancelQueries({ queryKey });
  for (const st of staged) {
    const saved = await api.uploadRecordAttachment(recordId, st.file);
    await removeStagedFile(st.id);
    if (client) {
      client.setQueryData<ApiPodAttachment[]>(queryKey, previous => [saved, ...(previous ?? [])]);
    }
  }
  if (client) {
    await client.invalidateQueries({ queryKey: stagedKey });
    await client.invalidateQueries({ queryKey });
  }
}

export function usePodAttachments(recordId: string) {
  const client = useQueryClient();
  const queryKey = podAttachmentsKey(recordId);
  const stagedKey = podStagedKey(recordId);
  const mutationKey = ['pod-attachment-write', recordId];
  
  const query = useQuery({
    queryKey,
    queryFn: () => api.getRecordAttachments(recordId),
    enabled: Boolean(recordId),
  });

  const stagedQuery = useQuery({
    queryKey: stagedKey,
    queryFn: () => getStagedFiles(recordId),
    enabled: Boolean(recordId),
  });

  const upload = useMutation({
    mutationKey,
    mutationFn: async (targetId?: string) => {
      await uploadStagedFiles(targetId || recordId, client);
    },
    onSuccess: (_, targetId) => {
      client.invalidateQueries({ queryKey: podStagedKey(targetId || recordId) });
    },
    onSettled: (_, __, targetId) => {
      client.invalidateQueries({ queryKey: podAttachmentsKey(targetId || recordId) });
    },
  });

  const stage = useMutation({
    mutationFn: async (files: readonly File[]) => {
      for (const file of files) {
        await saveStagedFile({
          id: Math.random().toString(36).substring(2, 15),
          recordId,
          file,
          stagedAt: Date.now(),
        });
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: stagedKey }),
  });

  const unstage = useMutation({
    mutationFn: async (id: string) => {
      await removeStagedFile(id);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: stagedKey }),
  });

  const uploadDirect = useMutation({
    mutationKey,
    mutationFn: async (files: readonly File[]) => {
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
  const stagedFiles = stagedQuery.data ?? [];

  const combinedHasPhoto = hasSavedPodPhoto(files) || stagedFiles.some(s => s.file.type.startsWith('image/'));

  const readiness: PodReadiness = {
    loading: query.isPending || query.isFetching || stagedQuery.isPending,
    uploading,
    hasPhoto: combinedHasPhoto,
    loadFailed: query.isError,
    hasStagedFiles: stagedFiles.length > 0,
  };
  
  return { 
    files, 
    stagedFiles,
    readiness, 
    stageFiles: stage.mutateAsync,
    unstageFile: unstage.mutateAsync,
    uploadStaged: upload.mutateAsync, 
    uploadDirect: uploadDirect.mutateAsync,
    removeFile: remove.mutateAsync, 
    reload: () => {
      query.refetch();
      stagedQuery.refetch();
    }
  };
}
