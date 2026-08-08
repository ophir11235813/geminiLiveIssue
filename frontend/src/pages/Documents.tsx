import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface Doc {
  id: string;
  title: string;
  source_type: string;
  created_at: string;
  restricted?: boolean;
  content?: string;
  uploader_email?: string | null;
  sender?: string | null;
  sent_at?: string | null;
  flagged?: boolean;
  flag_reason?: string | null;
}

interface IngestInfo {
  email: string;
  subjectKeyword: string;
}

const SOURCE_TYPES = ['Conversation thread', 'Email', 'Flyer', 'Note', 'Other'];

export default function Documents() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [ingestInfo, setIngestInfo] = useState<IngestInfo | null>(null);
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
    api
      .get('/documents/ingest-info')
      .then((data) => setIngestInfo(data.ingest))
      .catch(() => setIngestInfo(null));
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
      <section className="info-card">
        <h2>What is this page?</h2>
        <p>
          This is everything Springhill Sherpa knows — old group chat threads, flyers, notes,
          anything people have shared — so it can give you good answers when you ask it something.
        </p>
        <p>
          {isAdmin
            ? 'As an admin, you can open any item below to see exactly what it says.'
            : "You'll see what's been added below, but only an admin can open an item to read it."}
        </p>
        {ingestInfo && (
          <p>
            Got something worth adding — a flyer, an old thread, anything school or Hideout
            related? Forward it by email to <strong>{ingestInfo.email}</strong> with the word{' '}
            <strong>&quot;{ingestInfo.subjectKeyword}&quot;</strong> somewhere in the subject line,
            and it'll show up here on its own.
          </p>
        )}
      </section>

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
              placeholder="e.g. Grade 3 Group Chat — June"
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
                placeholder="Paste a conversation thread export, forwarded email text, or notes about a flyer/photo…"
              />
            </label>
          ) : (
            <label>
              File (.txt, .pdf, or a photo)
              <input
                type="file"
                accept=".txt,.pdf,.jpg,.jpeg,.png,.gif,.webp,text/plain,application/pdf,image/jpeg,image/png,image/gif,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
              <span className="field-hint">
                {file && file.type.startsWith('image/')
                  ? "Photos take a few extra seconds — Claude reads the text and details out of it, and only that text is kept (the photo itself isn't stored)."
                  : 'Photos of flyers/notes work too — text and details get read out of them automatically.'}
              </span>
            </label>
          )}
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? (mode === 'file' && file?.type.startsWith('image/') ? 'Reading photo…' : 'Adding…') : 'Add document'}
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
                <div
                  className="doc-header"
                  onClick={d.restricted ? undefined : () => setExpanded(expanded === d.id ? null : d.id)}
                  style={d.restricted ? { cursor: 'default' } : undefined}
                >
                  <div>
                    <strong>{d.title}</strong>
                    <span className="tag">{d.source_type}</span>
                    {d.flagged && (
                      <span className="flag-badge" title={d.flag_reason ?? 'Flagged content was excluded'}>
                        ⚠ Flagged
                      </span>
                    )}
                  </div>
                  <span className="doc-meta">
                    {d.restricted
                      ? 'Visible to admins only'
                      : `${d.sender ? `From: ${d.sender}` : d.uploader_email ?? 'Auto-imported'} · ${new Date(
                          d.sent_at ?? d.created_at
                        ).toLocaleString()}`}
                  </span>
                </div>
                {!d.restricted && expanded === d.id && (
                  <>
                    {d.flagged && (
                      <p className="flag-note">
                        ⚠ Something in the original message was excluded as inappropriate:{' '}
                        {d.flag_reason || 'no further detail recorded.'}
                      </p>
                    )}
                    <pre className="doc-content">{d.content}</pre>
                  </>
                )}
                {!d.restricted && (user?.role === 'admin' || user?.email === d.uploader_email) && (
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
