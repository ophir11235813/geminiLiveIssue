import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get('/chat/history')
      .then((data) => setMessages(data.messages))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || sending) return;

    setInput('');
    setError('');
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setSending(true);
    try {
      const data = await api.post('/chat', { message: question });
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-page">
      <div className="chat-log">
        {messages.length === 0 && (
          <p className="empty-state">
            Ask about the school trip, a WhatsApp thread, a flyer… anything that's been added to the
            family docs.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.content}
          </div>
        ))}
        {sending && <div className="bubble assistant thinking">Thinking…</div>}
        <div ref={bottomRef} />
      </div>
      {error && <p className="error">{error}</p>}
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
    </div>
  );
}
