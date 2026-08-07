import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface AdminUser {
  id: string;
  email: string;
  status: 'pending' | 'approved' | 'revoked';
  role: 'admin' | 'user';
  created_at: string;
}

const TABS: Array<AdminUser['status']> = ['pending', 'approved', 'revoked'];

export default function Admin() {
  const [tab, setTab] = useState<AdminUser['status']>('pending');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const data = await api.get(`/admin/users?status=${tab}`);
    setUsers(data.users);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function act(id: string, action: 'approve' | 'revoke') {
    setBusyId(id);
    try {
      await api.post(`/admin/users/${id}/${action}`);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="admin-page">
      <h1>Admin — Users</h1>
      <div className="mode-toggle">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {loading ? (
        <p>Loading…</p>
      ) : users.length === 0 ? (
        <p className="empty-state">No {tab} users.</p>
      ) : (
        <table className="user-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="user-actions">
                  {u.status !== 'approved' && (
                    <button disabled={busyId === u.id} onClick={() => act(u.id, 'approve')}>
                      Approve
                    </button>
                  )}
                  {u.status !== 'revoked' && u.role !== 'admin' && (
                    <button
                      className="danger"
                      disabled={busyId === u.id}
                      onClick={() => act(u.id, 'revoke')}
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
