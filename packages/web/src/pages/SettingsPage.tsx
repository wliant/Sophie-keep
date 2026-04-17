import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BackupRecord,
  ItemType,
  Room,
  Settings,
  StorageLocation,
} from '@sophie/shared';
import { api, ApiError } from '../api/client';
import { toast } from '../state/toast';

export function SettingsPage() {
  return (
    <div className="stack">
      <h2 style={{ marginTop: 0 }}>Settings</h2>
      <nav className="row">
        <NavLink to="/settings">General</NavLink>
        <NavLink to="/settings/types">Item types</NavLink>
        <NavLink to="/settings/locations">Rooms & locations</NavLink>
        <NavLink to="/settings/backups">Backups</NavLink>
        <NavLink to="/settings/system">System</NavLink>
      </nav>
      <Routes>
        <Route index element={<General />} />
        <Route path="types" element={<ItemTypes />} />
        <Route path="locations" element={<Locations />} />
        <Route path="backups" element={<Backups />} />
        <Route path="system" element={<System />} />
      </Routes>
    </div>
  );
}

function General() {
  const qc = useQueryClient();
  const settings = useQuery<Settings>({ queryKey: ['settings'], queryFn: () => api.get('/api/v1/settings') });
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch('/api/v1/settings', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Saved');
    },
  });
  if (!settings.data) return <div>Loading…</div>;
  return (
    <section className="card stack">
      <div className="form-field">
        <label htmlFor="window">Expiring-soon window (days)</label>
        <input
          id="window"
          type="number"
          min={1}
          max={90}
          value={settings.data.expiring_soon_window_days}
          onChange={(e) => {
            const n = Math.max(1, Math.min(90, Number(e.target.value) || 7));
            patch.mutate({ expiring_soon_window_days: n });
          }}
        />
      </div>
    </section>
  );
}

function ItemTypes() {
  const qc = useQueryClient();
  const types = useQuery<{ items: ItemType[] }>({
    queryKey: ['item-types'],
    queryFn: () => api.get('/api/v1/item-types'),
  });
  const [draft, setDraft] = useState<{ name: string; default_unit: string }>({ name: '', default_unit: 'pcs' });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/api/v1/item-types', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['item-types'] });
      setDraft({ name: '', default_unit: 'pcs' });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Create failed'),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/item-types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['item-types'] }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Delete failed'),
  });

  return (
    <section className="card stack">
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.name.trim()) create.mutate({ name: draft.name.trim(), default_unit: draft.default_unit });
        }}
      >
        <input
          placeholder="Type name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          maxLength={60}
        />
        <input
          placeholder="unit"
          value={draft.default_unit}
          onChange={(e) => setDraft({ ...draft, default_unit: e.target.value })}
          maxLength={16}
          style={{ width: 100 }}
        />
        <button className="primary" type="submit">
          Add
        </button>
      </form>
      <table className="data">
        <thead>
          <tr>
            <th>Name</th>
            <th>Default unit</th>
            <th>Items</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {types.data?.items.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>{t.default_unit}</td>
              <td>{t.item_count ?? 0}</td>
              <td>
                <button
                  className="danger"
                  disabled={(t.item_count ?? 0) > 0}
                  title={(t.item_count ?? 0) > 0 ? 'Cannot delete: items reference this type' : undefined}
                  onClick={() => del.mutate(t.id)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Locations() {
  const qc = useQueryClient();
  const rooms = useQuery<{ items: Room[] }>({ queryKey: ['rooms'], queryFn: () => api.get('/api/v1/rooms') });
  const locs = useQuery<{ items: StorageLocation[] }>({
    queryKey: ['storage-locations'],
    queryFn: () => api.get('/api/v1/storage-locations'),
  });

  const delRoom = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/rooms/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rooms'] }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Delete failed'),
  });
  const delLoc = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/storage-locations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['storage-locations'] }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Delete failed'),
  });

  return (
    <section className="card stack">
      <div className="muted">
        Use the <Link to="/floor-plan">Floor plan editor</Link> to add rooms and locations visually.
      </div>
      {rooms.data?.items.map((r) => {
        const children = (locs.data?.items ?? []).filter((l) => l.room_id === r.id);
        return (
          <section key={r.id} className="card stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{r.name}</strong>
              <button
                className="danger"
                onClick={() => delRoom.mutate(r.id)}
                disabled={children.length > 0}
                title={children.length > 0 ? 'Room must be empty' : undefined}
              >
                Delete
              </button>
            </div>
            <ul className="list">
              {children.map((l) => (
                <li key={l.id} className="row-card">
                  <span>
                    {l.name} <span className="muted">({l.item_count ?? 0} items)</span>
                  </span>
                  <button
                    className="danger"
                    onClick={() => delLoc.mutate(l.id)}
                    disabled={(l.item_count ?? 0) > 0}
                  >
                    Delete
                  </button>
                </li>
              ))}
              {children.length === 0 ? <li className="muted">No locations</li> : null}
            </ul>
          </section>
        );
      })}
    </section>
  );
}

function Backups() {
  const qc = useQueryClient();
  const list = useQuery<{ items: BackupRecord[] }>({
    queryKey: ['backups'],
    queryFn: () => api.get('/api/v1/backups'),
    refetchInterval: 30000,
  });
  const status = useQuery<{ last_backup_status: string | null; last_backup_at: string | null }>({
    queryKey: ['backup-status'],
    queryFn: () => api.get('/api/v1/backups/status'),
  });
  const create = useMutation({
    mutationFn: () => api.post('/api/v1/backups', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backups'] });
      qc.invalidateQueries({ queryKey: ['backup-status'] });
      toast.success('Backup created');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Backup failed'),
  });
  const restore = useMutation({
    mutationFn: (id: string) =>
      api.post(`/api/v1/backups/${id}/restore`, { confirm: 'REPLACE ALL DATA' }),
    onSuccess: () => {
      qc.clear();
      toast.success('Restore complete');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Restore failed'),
  });

  return (
    <section className="card stack">
      <div className="muted">
        Last auto-backup: {status.data?.last_backup_status ?? 'never'}{' '}
        {status.data?.last_backup_at ? `at ${new Date(status.data.last_backup_at).toLocaleString()}` : ''}
      </div>
      <div className="row">
        <button className="primary" onClick={() => create.mutate()} disabled={create.isPending}>
          Create backup now
        </button>
      </div>
      <table className="data">
        <thead>
          <tr>
            <th>Filename</th>
            <th>Size</th>
            <th>Timestamp</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.data?.items.map((b) => (
            <tr key={b.id}>
              <td>{b.filename}</td>
              <td>{Math.round(b.size_bytes / 1024)} KB</td>
              <td>{new Date(b.timestamp).toLocaleString()}</td>
              <td className="row">
                <a href={`/api/v1/backups/${b.id}/download`} target="_blank" rel="noreferrer">
                  <button>Download</button>
                </a>
                <button
                  className="danger"
                  onClick={() => {
                    if (
                      confirm(
                        `Restore will REPLACE ALL DATA with backup ${b.filename}. Type REPLACE ALL DATA to continue.`,
                      ) &&
                      prompt('Type REPLACE ALL DATA to confirm') === 'REPLACE ALL DATA'
                    ) {
                      restore.mutate(b.id);
                    }
                  }}
                >
                  Restore
                </button>
              </td>
            </tr>
          ))}
          {list.data?.items.length === 0 ? (
            <tr>
              <td colSpan={4} className="muted">
                No backups yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}

function System() {
  const health = useQuery<{ status: string; schema_version: number; app_version: string }>({
    queryKey: ['health'],
    queryFn: () => api.get('/api/v1/health'),
  });
  const navigate = useNavigate();
  void navigate;
  if (!health.data) return <div>Loading…</div>;
  return (
    <section className="card stack">
      <div>Schema version: {health.data.schema_version}</div>
      <div>App version: {health.data.app_version}</div>
      <div>Status: {health.data.status}</div>
    </section>
  );
}
