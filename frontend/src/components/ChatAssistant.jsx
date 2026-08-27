/**
 * ChatAssistant — v2 chat widget for Promo Immo Marrakech.
 *
 * Behavior:
 *  - Floating button (bottom-right) opens a chat panel.
 *  - On open, sends a "hello" message to the backend and displays the help text.
 *  - User can type messages or click suggestion chips.
 *  - Cards (property cards) are rendered with image, title, surface, bedrooms, link.
 *  - Markdown-style bold (**text**) is converted to <strong>.
 *  - Persists last 50 messages to localStorage.
 */
import { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, ExternalLink, Bed, Maximize } from 'lucide-react';

const STORAGE_KEY = 'v2-chat-history';

function fmt(text) {
  if (!text) return null;
  // Convert **bold** to <strong>
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    }
    // Convert URLs to clickable links
    const urlParts = p.split(/(https?:\/\/[^\s]+)/g);
    return urlParts.map((u, j) => {
      if (u.match(/^https?:\/\//)) {
        return (
          <a key={`${i}-${j}`} href={u} target="_blank" rel="noreferrer" className="text-purple-600 underline break-all">
            {u}
          </a>
        );
      }
      return <span key={`${i}-${j}`}>{u}</span>;
    });
  });
}

function PropertyCard({ card }) {
  return (
    <a
      href={card.url}
      target="_blank"
      rel="noreferrer"
      className="block mt-2 mb-2 bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
    >
      {card.image && (
        <img src={card.image} alt={card.title} className="w-full h-32 object-cover bg-gray-100" loading="lazy" />
      )}
      <div className="p-3">
        <div className="font-semibold text-sm text-gray-900 leading-tight">{card.title}</div>
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
          {card.surface && (
            <span className="flex items-center gap-1">
              <Maximize size={12} /> {card.surface} m²
            </span>
          )}
          {card.bedrooms && (
            <span className="flex items-center gap-1">
              <Bed size={12} /> {card.bedrooms} ch
            </span>
          )}
          {card.price && <span className="font-semibold text-purple-700">{card.price}</span>}
        </div>
        <div className="text-xs text-purple-600 mt-2 flex items-center gap-1">
          Voir sur le site <ExternalLink size={10} />
        </div>
      </div>
    </a>
  );
}

export default function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setMessages(JSON.parse(saved)); } catch { /* ignore */ }
    } else {
      // Initial hello
      send('Bonjour');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50)));
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function send(text) {
    if (!text.trim()) return;
    setBusy(true);
    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    try {
      const token = localStorage.getItem('token');
      const r = await fetch('/api/v2/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text }),
      });
      const data = await r.json();
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: data.text,
          cards: data.cards || [],
          suggestions: data.suggestions || [],
          whatsappLink: data.whatsappLink,
        },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: `Erreur réseau : ${e.message}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    send(input);
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-purple-600 text-white shadow-lg hover:bg-purple-700 flex items-center justify-center transition-transform hover:scale-105"
          aria-label="Open chat assistant"
        >
          <MessageCircle size={24} />
        </button>
      )}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-3rem)] h-[36rem] max-h-[calc(100vh-3rem)] bg-white rounded-2xl shadow-2xl flex flex-col border border-gray-200">
          <header className="bg-purple-600 text-white px-4 py-3 rounded-t-2xl flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm">Assistant Promo Immo</div>
              <div className="text-xs opacity-90">promoimmomarrakech.com · FR · AR · EN</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="hover:bg-purple-700 rounded p-1"
              aria-label="Close chat"
            >
              <X size={18} />
            </button>
          </header>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                    m.role === 'user'
                      ? 'bg-purple-600 text-white rounded-br-sm'
                      : 'bg-white border border-gray-200 rounded-bl-sm'
                  }`}
                >
                  <div className="whitespace-pre-wrap leading-relaxed">{fmt(m.text)}</div>
                  {m.cards?.map((c, j) => (
                    <PropertyCard key={j} card={c} />
                  ))}
                  {m.suggestions && m.suggestions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {m.suggestions.map((s, j) => (
                        <button
                          key={j}
                          onClick={() => send(s)}
                          className="text-xs bg-purple-100 hover:bg-purple-200 text-purple-800 px-2 py-1 rounded-full transition"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  {m.whatsappLink && (
                    <a
                      href={m.whatsappLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block mt-2 text-xs bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-full font-semibold"
                    >
                      Discuter sur WhatsApp
                    </a>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
          <form onSubmit={handleSubmit} className="border-t border-gray-200 p-3 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Posez votre question..."
              className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-purple-500"
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="bg-purple-600 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Send"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
