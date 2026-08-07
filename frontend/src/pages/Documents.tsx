import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface Doc {
  id: string;
  title: string;
  source_type: string;
  content: string;
  created_at: string;
  uploader_email: string | null;
}

const SOURCE_TYPES = ['WhatsApp export', 'Email', 'Flyer', 'Note', 'Other'];

export default function Documents() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'paste' | 'file'>('paste');
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState(SOURCE_TYPES[0]);
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function loadDocs() {
    setLoading(true);
    const data = await api.get('/documents');
    setDocs(data.documents);
    setLoading(false);
  }

  useEffect(() => {
    loadDocs();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      let body: FormData | Record<string, unknown>;
      if (mode === 'file') {
        if (!file) throw new Error('Choose a file to upload');
        const formData = new FormData();
        formData.append('title', title);
        formData.append('sourceType', sourceType);
        formData.append('file', file);
        body = formData;
      } else {
        body = { title, sourceType, content };
      }
      await api.post('/documents', body);
      setTitle('');
      setContent('');
      setFile(null);
      await loadDocs();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    await api.del(`/documents/${id}`);
    await loadDocs();
  }

  return (
    <div className="documents-page">
      <section className="upload-card">
        <h2>Add context</h2>
        <div className="mode-toggle">
          <button type="button" className={mode === 'paste' ? 'active' : ''} onClick={() => setMode('paste')}>
            Paste text
          </button>
          <button type="button" className={mode === 'file' ? 'active' : ''} onClick={() => setMode('file')}>
            Upload file
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <label>
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="e.g. Grade 3 WhatsApp — June"
            />
          </label>
          <label>
            Source type
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
              {SOURCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          {mode === 'paste' ? (
            <label>
              Content
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                required
                placeholder="Paste a WhatsApp export, forwarded email text, or notes about a flyer/photo…"
              />
            </label>
          ) : (
            <label>
              File (.txt or .pdf)
              <input
                type="file"
                accept=".txt,.pdf,text/plain,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
              <span className="field-hint">
                For images (flyers, photos), switch to "Paste text" and describe what's in it — image
                text extraction isn't supported yet.
              </span>
            </label>
          )}
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add document'}
          </button>
        </form>
      </section>

      <section>
        <h2>All documents ({docs.length})</h2>
        {loading ? (
          <p>Loading…</p>
        ) : docs.length === 0 ? (
          <p className="empty-state">No documents yet — add the first one above.</p>
        ) : (
          <ul className="doc-list">
            {docs.map((d) => (
              <li key={d.id} className="doc-item">
                <div className="doc-header" onClick={() => setExpanded(expanded === d.id ? null : d.id)}>
                  <div>
                    <strong>{d.title}</strong>
                    <span className="tag">{d.source_type}</span>
                  </div>
                  <span className="doc-meta">
                    {d.uploader_email ?? 'unknown'} · {new Date(d.created_at).toLocaleDateString()}
                  </span>
                </div>
                {expanded === d.id && <pre className="doc-content">{d.content}</pre>}
                {(user?.role === 'admin' || user?.email === d.uploader_email) && (
                  <button className="delete-btn" onClick={() => handleDelete(d.id)}>
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
