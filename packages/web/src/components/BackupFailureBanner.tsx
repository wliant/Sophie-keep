import { useQuery } from '@tanstack/react-query';
import { endpoints, qk, type BackupStatus } from '../api/endpoints';

export function BackupFailureBanner() {
  const { data } = useQuery<BackupStatus>({
    queryKey: qk.backupStatus,
    queryFn: endpoints.backupStatus,
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
