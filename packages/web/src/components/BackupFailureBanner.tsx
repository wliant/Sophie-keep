import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

interface BackupStatus {
  last_backup_status: 'ok' | 'failed' | null;
  last_backup_at: string | null;
}

export function BackupFailureBanner() {
  const { data } = useQuery<BackupStatus>({
    queryKey: ['backup-status'],
    queryFn: () => api.get<BackupStatus>('/api/v1/backups/status'),
    refetchInterval: 5 * 60 * 1000,
  });
  if (!data || data.last_backup_status !== 'failed') return null;
  return (
    <div className="banner" role="alert">
      <strong>Last automatic backup failed.</strong>
      {data.last_backup_at ? (
        <> Last attempt: {new Date(data.last_backup_at).toLocaleString()}. </>
      ) : null}
      Check server logs or trigger a manual backup in Settings → Backups.
    </div>
  );
}
