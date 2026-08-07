import { FormEvent, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { api, ApiError } from '../api/client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Chat() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadSessions() {
    setSessionsLoading(true);
    try {
      const data = await api.get('/chat/sessions');
      setSessions(data.sessions);
    } catch {
      // Non-fatal — the chat still works, it just won't show history.
    } finally {
      setSessionsLoading(false);
    }
  }

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function openSession(id: string) {
    setActiveSessionId(id);
    setMobileView('chat');
    setError('');
    setMessagesLoading(true);
    try {
      const data = await api.get(`/chat/sessions/${id}/messages`);
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load that chat');
    } finally {
      setMessagesLoading(false);
    }
  }

  function startNewChat() {
    setActiveSessionId(null);
    setMessages([]);
    setError('');
    setMobileView('chat');
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || sending) return;

    setInput('');
    setError('');
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setSending(true);
    try {
      const data = await api.post('/chat/messages', {
        message: question,
        sessionId: activeSessionId ?? undefined,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
      if (data.sessionId !== activeSessionId) {
        setActiveSessionId(data.sessionId);
      }
      await loadSessions();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setSending(false);
    }
  }

  async function renameSession(session: ChatSession) {
    const next = window.prompt('Rename chat', session.title);
    if (!next || !next.trim() || next === session.title) return;
    try {
      await api.patch(`/chat/sessions/${session.id}`, { title: next.trim() });
      await loadSessions();
    } catch {
      // Silently ignore — not worth interrupting the user for a rename failure.
    }
  }

  async function deleteSession(session: ChatSession) {
    if (!window.confirm(`Delete "${session.title}"? This can't be undone.`)) return;
    try {
      await api.del(`/chat/sessions/${session.id}`);
      if (activeSessionId === session.id) {
        startNewChat();
      }
      await loadSessions();
    } catch {
      // Silently ignore — the list will just still show it; they can retry.
    }
  }

  return (
    <div className="chat-shell" data-mobile-view={mobileView}>
      <aside className="session-sidebar">
        <div className="session-sidebar-header">
          <button className="new-chat-btn" onClick={startNewChat}>
            <span aria-hidden="true">+</span> New chat
          </button>
        </div>
        <div className="session-list">
          {sessionsLoading ? (
            <p className="empty-state session-list-empty">Loading…</p>
          ) : sessions.length === 0 ? (
            <p className="empty-state session-list-empty">No chats yet — start one!</p>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className={`session-item ${s.id === activeSessionId ? 'active' : ''}`}
                onClick={() => openSession(s.id)}
              >
                <div className="session-item-main">
                  <span className="session-item-title">{s.title}</span>
                  <span className="session-item-time">{relativeTime(s.updated_at)}</span>
                </div>
                <div className="session-item-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    title="Rename"
                    onClick={(e) => {
                      e.stopPropagation();
                      renameSession(s);
                    }}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn-danger"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(s);
                    }}
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      <section className="chat-panel">
        <button className="mobile-back-btn" onClick={() => setMobileView('list')}>
          ‹ Chats
        </button>
        <div className="chat-log">
          {messagesLoading ? (
            <p className="empty-state">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="empty-state">
              Ask about the school trip, a WhatsApp thread, a flyer… anything that's been added to the
              family docs.
            </p>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                {m.role === 'assistant' ? (
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                ) : (
                  m.content
                )}
              </div>
            ))
          )}
          {sending && <div className="bubble assistant thinking">Thinking…</div>}
          <div ref={bottomRef} />
        </div>
        {error && <p className="error chat-error">{error}</p>}
        <form className="chat-input" onSubmit={handleSend}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
          />
          <button type="submit" disabled={sending || !input.trim()}>
            Send
          </button>
        </form>
      </section>
    </div>
  );
}
