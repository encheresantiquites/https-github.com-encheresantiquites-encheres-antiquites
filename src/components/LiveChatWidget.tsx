import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { useChat } from '../context/ChatContext.tsx';
import {
  MessageSquare,
  X,
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  Tag,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { getFilteredDefaultLots } from '../data/default-lots.ts';

interface ChatMessage {
  id: number;
  userId?: number | null;
  senderType: 'BUYER' | 'ADMIN';
  senderName: string;
  senderEmail?: string | null;
  lotId?: number | null;
  lotReference?: string | null;
  lotTitle?: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export const LiveChatWidget: React.FC = () => {
  const { user, token } = useAuth();
  const { isOpen, closeChat, toggleChat, lotContext, setLotContext, schedule, refreshSchedule } =
    useChat();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [availableLots, setAvailableLots] = useState<
    Array<{ id: number; reference: string; title: string; images?: string[]; startingPriceCents?: number }>
  >(() => getFilteredDefaultLots('current'));
  const [inputText, setInputText] = useState('');
  const [visitorName, setVisitorName] = useState('');
  const [visitorEmail, setVisitorEmail] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [showIdentityForm, setShowIdentityForm] = useState(false);
  const [sending, setSending] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll en bas
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      refreshSchedule();
      loadMessages();
      loadLots();
    }
  }, [isOpen, user?.email]);

  const loadLots = async () => {
    try {
      const res = await fetch('/api/lots?filter=current');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.lots) && data.lots.length > 0) {
          setAvailableLots(data.lots);
          return;
        }
      }
      setAvailableLots(getFilteredDefaultLots('current'));
    } catch (err) {
      setAvailableLots(getFilteredDefaultLots('current'));
    }
  };

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages]);

  const loadMessages = async () => {
    try {
      setLoading(true);
      const emailQuery = user?.email || visitorEmail || localStorage.getItem('visitor_chat_email');
      const queryParams = new URLSearchParams();
      if (emailQuery) {
        queryParams.set('email', emailQuery);
      }

      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/chat/messages?${queryParams.toString()}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (e) {
      console.error('Erreur chargement messages chat:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || sending) return;

    // Si le visiteur n'est pas connecté et n'a pas encore renseigné d'email, lui demander
    if (!user && !visitorEmail && !localStorage.getItem('visitor_chat_email') && !showIdentityForm) {
      setShowIdentityForm(true);
      return;
    }

    try {
      setSending(true);
      const email = user?.email || visitorEmail || localStorage.getItem('visitor_chat_email') || '';
      const name =
        user?.companyName
          ? `${user.companyName} (${user.firstName} ${user.lastName})`
          : user
          ? `${user.firstName} ${user.lastName}`
          : visitorName || 'Visiteur professionnel';

      if (email) {
        localStorage.setItem('visitor_chat_email', email);
      }
      if (visitorName) {
        localStorage.setItem('visitor_chat_name', visitorName);
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const body = {
        message: inputText.trim(),
        senderName: name,
        senderEmail: email || null,
        senderPhone: visitorPhone || user?.phone || null,
        lotId: lotContext?.id || null,
        lotReference: lotContext?.reference || null,
        lotTitle: lotContext?.title || null,
      };

      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.message]);
        setInputText('');
        setShowIdentityForm(false);

        if (!schedule.isOpen) {
          setSuccessNotice(
            "Votre message a été enregistré avec succès. Nous vous répondrons dès la réouverture du service (du lundi au vendredi de 9h à 17h) ou par email."
          );
          setTimeout(() => setSuccessNotice(null), 8000);
        }
      }
    } catch (err) {
      console.error('Erreur envoi message:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Floating Launcher Button */}
      <button
        onClick={toggleChat}
        aria-label="Contacter le vendeur en direct"
        className={`fixed bottom-5 right-5 z-40 flex items-center gap-3 px-4 py-3 rounded-full shadow-2xl transition-all duration-300 border cursor-pointer ${
          isOpen
            ? 'bg-black border-[#D4AF37] text-slate-300 scale-95 shadow-[0_0_20px_rgba(0,0,0,0.9)]'
            : 'bg-black text-slate-100 border-[#D4AF37] hover:scale-105 hover:border-[#E5C158] hover:shadow-[0_0_25px_rgba(212,175,55,0.4)]'
        }`}
      >
        <div className="relative">
          <MessageSquare className="w-5 h-5 text-[#D4AF37]" />
          {/* Status Indicator Dot */}
          <span
            className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-black ${
              schedule.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-emerald-400'
            }`}
          />
        </div>
        <div className="hidden sm:flex flex-col text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-white tracking-wide">EN LIGNE</span>
            <span
              className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-bold ${
                schedule.isOpen
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
              }`}
            >
              {schedule.isOpen ? 'En direct' : 'Horaires 9h–17h'}
            </span>
          </div>
          {/* Écriture en dessous en VERT ET GRAS */}
          <span className="text-[11px] font-bold text-emerald-400 mt-0.5">
            {schedule.isOpen ? 'Disponible pour vos questions' : 'Laissez un message (Lun–Ven 9h–17h)'}
          </span>
        </div>
      </button>

      {/* Floating Chat Modal / Drawer */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 sm:right-6 w-[calc(100vw-2rem)] sm:w-[400px] h-[550px] max-h-[80vh] bg-black border border-[#D4AF37]/60 rounded-2xl shadow-[0_15px_50px_rgba(0,0,0,0.9)] flex flex-col z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-6">
          {/* Header */}
          <div className="bg-black border-b border-slate-800 px-4 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#8C6D23] text-slate-950 font-bold flex items-center justify-center shadow-md text-sm border border-amber-200/50">
                <MessageSquare className="w-5 h-5 text-slate-950" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white font-serif">EN LIGNE</h3>
                  <span className="text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-medium">
                    Assistance Directe
                  </span>
                </div>
                {/* Écriture en dessous en VERT ET GRAS */}
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      schedule.isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-500'
                    }`}
                  />
                  <span className="text-[11px] font-bold text-emerald-400">
                    {schedule.scheduleMessage}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={closeChat}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Schedule Notice Strip */}
          <div
            className={`px-4 py-2 text-[11px] flex items-center gap-2 border-b ${
              schedule.isOpen
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40'
                : 'bg-amber-950/40 text-amber-200 border-amber-800/40'
            }`}
          >
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            <div className="flex-1">
              <span className="font-semibold">{schedule.openingHoursText}</span>
              {!schedule.isOpen && (
                <span className="block text-[10px] text-slate-400">
                  En dehors de ces plages, vos messages sont reçus et traités dès 9h00.
                </span>
              )}
            </div>
          </div>

          {/* Context Lot Banner (if user asks about a specific lot or wants to select one) */}
          {lotContext ? (
            <div className="bg-[#1C2541]/95 border-b border-amber-500/40 px-3 py-2 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                {lotContext.image ? (
                  <img
                    src={lotContext.image}
                    alt={lotContext.title}
                    className="w-9 h-9 rounded-lg object-cover border border-[#D4AF37]/50 flex-shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-slate-900 border border-[#D4AF37]/40 flex items-center justify-center flex-shrink-0">
                    <Tag className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[#D4AF37] font-mono text-[11px]">
                      {lotContext.reference}
                    </span>
                    <span className="text-[10px] text-emerald-400 font-semibold">
                      • Objet sélectionné
                    </span>
                  </div>
                  <p className="text-slate-200 text-[11px] truncate font-medium">
                    {lotContext.title}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setLotContext(null)}
                  className="text-[10px] text-slate-400 hover:text-amber-300 px-2 py-1 rounded bg-slate-900/80 border border-slate-700/60 transition-colors cursor-pointer"
                  title="Poser une question générale sans lot spécifique"
                >
                  Détacher
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-[#0B132B] border-b border-slate-800 px-3 py-2 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] flex-shrink-0">
                <Tag className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="hidden xs:inline">Objet concerné :</span>
              </div>
              <select
                value=""
                onChange={(e) => {
                  const selectedId = parseInt(e.target.value, 10);
                  if (selectedId) {
                    const found = availableLots.find((l) => l.id === selectedId);
                    if (found) {
                      setLotContext({
                        id: found.id,
                        reference: found.reference,
                        title: found.title,
                        image: found.images && found.images[0] ? found.images[0] : undefined,
                        startingPriceCents: found.startingPriceCents,
                      });
                    }
                  }
                }}
                className="bg-[#1C2541] text-amber-200 text-[11px] rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:border-[#D4AF37] flex-1 max-w-[280px] truncate cursor-pointer"
              >
                <option value="">-- Associer un lot du catalogue (optionnel) --</option>
                {availableLots.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.reference} - {l.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Success Banner when sending offline */}
          {successNotice && (
            <div className="bg-emerald-900/50 border-b border-emerald-700/50 p-2.5 text-xs text-emerald-200 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              <span>{successNotice}</span>
            </div>
          )}

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#070B19]/80 text-xs">
            {/* Introductory Message from Service EN LIGNE */}
            <div className="flex gap-2 max-w-[85%]">
              <div className="w-7 h-7 rounded-full bg-[#1C2541] border border-[#D4AF37]/50 text-[#D4AF37] text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                <MessageSquare className="w-3.5 h-3.5 text-[#D4AF37]" />
              </div>
              <div className="bg-[#1C2541] border border-slate-800 rounded-2xl rounded-tl-sm p-3 text-slate-200 space-y-1.5 shadow-md">
                <div>
                  <div className="font-semibold text-[#D4AF37] text-[11px]">EN LIGNE</div>
                  <div className="text-[10px] font-bold text-emerald-400">Assistance Vendeur • Direct 9h–17h</div>
                </div>
                <p className="leading-relaxed">
                  Bonjour et bienvenue. Je suis à votre écoute pour répondre à vos questions sur
                  l'authenticité, la provenance, l'état de conservation ou le transport de nos
                  collections familiales.
                </p>
                <p className="text-[10px] text-slate-400 italic">
                  Service direct ouvert du lundi au vendredi de 9h à 17h.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-4 text-slate-500">Chargement des messages...</div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.senderType === 'BUYER';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-3 shadow-md ${
                        isMe
                          ? 'bg-gradient-to-r from-amber-600/30 to-[#D4AF37]/30 border border-[#D4AF37]/50 text-amber-50 rounded-tr-sm'
                          : 'bg-[#1C2541] border border-slate-800 text-slate-200 rounded-tl-sm'
                      }`}
                    >
                      {/* En-tête de message */}
                      <div className="flex items-center justify-between gap-3 mb-1 text-[10px] text-slate-400">
                        <span className="font-semibold text-slate-300">
                          {isMe ? 'Vous' : msg.senderName}
                        </span>
                        <span>
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      {/* Référence au lot si présent */}
                      {msg.lotReference && (
                        <div className="mb-1.5 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-slate-900/60 border border-slate-700/50 text-[#D4AF37]">
                          <Tag className="w-2.5 h-2.5" />
                          <span>
                            {msg.lotReference} - {msg.lotTitle}
                          </span>
                        </div>
                      )}

                      <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                    </div>
                  </div>
                );
              })
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Identification Modal inside widget if visitor is not known */}
          {showIdentityForm && !user && (
            <div className="p-3 bg-[#1C2541] border-t border-slate-800 space-y-2 animate-in fade-in">
              <div className="text-[11px] font-semibold text-amber-200 flex items-center justify-between">
                <span>Vos coordonnées professionnelles pour la réponse :</span>
                <button
                  type="button"
                  onClick={() => setShowIdentityForm(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Nom / Entreprise *"
                  value={visitorName}
                  onChange={(e) => setVisitorName(e.target.value)}
                  className="bg-[#0B132B] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#D4AF37]"
                />
                <input
                  type="email"
                  placeholder="Email de contact *"
                  value={visitorEmail}
                  onChange={(e) => setVisitorEmail(e.target.value)}
                  className="bg-[#0B132B] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
            </div>
          )}

          {/* Form input */}
          <form
            onSubmit={handleSendMessage}
            className="p-3 bg-[#0B132B] border-t border-slate-800 flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                schedule.isOpen
                  ? 'Posez votre question en direct...'
                  : 'Laissez votre message (réponse dès 9h00)...'
              }
              className="flex-1 bg-[#1C2541] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-[#D4AF37] transition-colors"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || sending}
              className={`p-2.5 rounded-xl font-bold flex items-center justify-center transition-all cursor-pointer ${
                inputText.trim() && !sending
                  ? 'bg-[#D4AF37] text-slate-950 hover:bg-[#E5C158] shadow-md'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
