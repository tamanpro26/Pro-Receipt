/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState, useRef, useEffect, useCallback, createContext, useContext,
  useDeferredValue, memo, type ChangeEvent,
} from 'react';
import {
  Plus, Trash2, Download, Receipt, DollarSign,
  FileText, Settings2, Eye, Printer, Save,
  FolderOpen, Palette, CheckCircle2, User, Tag,
  Mail, Loader2, Sparkles, Send, Moon, Sun,
  MessageSquare, PanelLeftClose, PanelLeftOpen, LogIn, SquarePen, X, Pencil, Check,
  Paperclip, ImageIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SignInButton, UserButton } from '@clerk/clerk-react';

// ─── Auth Context ────────────────────────────────────────────────────────────
// Bridges Clerk hooks (called in main.tsx) into a plain React context so
// components never call Clerk hooks directly — works even without Clerk.

export interface AuthState {
  clerkEnabled: boolean;
  isSignedIn: boolean;
  userId: string | null;
  getToken: () => Promise<string | null>;
}

const AuthCtx = createContext<AuthState>({
  clerkEnabled: false, isSignedIn: false, userId: null, getToken: async () => null,
});

export const AuthProvider = AuthCtx.Provider;
export const useAppAuth = () => useContext(AuthCtx);

// Re-export for main.tsx — the bridge component lives there because it calls useAuth()
export { AuthCtx };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReceiptItem {
  id: string;
  description: string;
  quantity: number;
  price: number;
  discount: number;
}

export type ThemeKey = 'classic' | 'indigo' | 'bold' | 'forest' | 'sunset' | 'ocean' | 'rose' | 'slate' | 'custom';

export interface CustomThemeColors {
  accent: string;
  headerBg: string;
  headerText: string;
}

export interface ReceiptData {
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  businessEmail: string;
  businessWebsite: string;
  receiptNumber: string;
  date: string;
  dueDate: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: ReceiptItem[];
  taxRate: number;
  globalDiscount: number;
  currency: string;
  paymentMethod: string;
  paymentStatus: 'paid' | 'unpaid' | 'partial';
  notes: string;
  theme: ThemeKey;
  customTheme: CustomThemeColors;
  paperSize: 'A4' | 'Letter' | 'A5' | 'Legal';
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const CURRENCIES = [
  { symbol: '$',  label: 'USD – US Dollar'      },
  { symbol: '€',  label: 'EUR – Euro'            },
  { symbol: '£',  label: 'GBP – British Pound'   },
  { symbol: '¥',  label: 'JPY – Japanese Yen'    },
  { symbol: '₹',  label: 'INR – Indian Rupee'    },
  { symbol: '₩',  label: 'KRW – Korean Won'      },
  { symbol: 'A$', label: 'AUD – Australian Dollar'},
  { symbol: 'C$', label: 'CAD – Canadian Dollar' },
  { symbol: 'Fr', label: 'CHF – Swiss Franc'     },
  { symbol: 'R$', label: 'BRL – Brazilian Real'  },
  { symbol: '₺',  label: 'TRY – Turkish Lira'   },
  { symbol: '₿',  label: 'BTC – Bitcoin'         },
];

export const PAYMENT_METHODS = [
  'Cash','Credit Card','Debit Card','Bank Transfer',
  'PayPal','Stripe','Check','Crypto','Other',
];

export interface ThemeDef { accent: string; headerBg: string; headerText: string; label: string }

export const THEMES: Record<Exclude<ThemeKey,'custom'>, ThemeDef> = {
  classic: { accent: '#1A1A1A', headerBg: '#ffffff', headerText: '#1A1A1A', label: 'Classic'   },
  indigo:  { accent: '#4F46E5', headerBg: '#EEF2FF', headerText: '#3730A3', label: 'Indigo'    },
  bold:    { accent: '#0F172A', headerBg: '#0F172A', headerText: '#ffffff', label: 'Bold Dark' },
  forest:  { accent: '#166534', headerBg: '#F0FDF4', headerText: '#14532D', label: 'Forest'    },
  sunset:  { accent: '#C2410C', headerBg: '#FFF7ED', headerText: '#9A3412', label: 'Sunset'    },
  ocean:   { accent: '#0E7490', headerBg: '#ECFEFF', headerText: '#155E75', label: 'Ocean'     },
  rose:    { accent: '#BE185D', headerBg: '#FFF1F2', headerText: '#9F1239', label: 'Rose'      },
  slate:   { accent: '#475569', headerBg: '#F8FAFC', headerText: '#334155', label: 'Slate'     },
};

const API_URL = (import.meta as any).env?.VITE_API_URL ?? '';
const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
export const isValidEmail = (s: string) => EMAIL_RE.test(s.trim());

const INITIAL_DATA: ReceiptData = {
  businessName: 'ACME SOLUTIONS',
  businessAddress: '123 Innovation Way, Tech City, TC 54321',
  businessPhone: '(555) 012-3456',
  businessEmail: 'hello@acme.com',
  businessWebsite: 'www.acme.com',
  receiptNumber: 'REC-2024-001',
  date: new Date().toISOString().split('T')[0],
  dueDate: '',
  customerName: 'John Doe',
  customerEmail: 'john@example.com',
  customerPhone: '',
  items: [
    { id: '1', description: 'Web Design Services',     quantity: 1, price: 1200, discount: 0 },
    { id: '2', description: 'Cloud Hosting (Monthly)', quantity: 1, price: 45,   discount: 0 },
  ],
  taxRate: 8.5,
  globalDiscount: 0,
  currency: '$',
  paymentMethod: 'Bank Transfer',
  paymentStatus: 'unpaid',
  notes: 'Thank you for your business!',
  theme: 'classic',
  customTheme: { accent: '#6366f1', headerBg: '#f0f0ff', headerText: '#3730a3' },
  paperSize: 'A4',
};

// ─── Shared style tokens ──────────────────────────────────────────────────────

export const inp = "w-full px-3.5 py-2 bg-[#f4f4f5] border border-transparent rounded-lg focus:bg-white focus:border-black/10 outline-none transition-all text-sm text-[#0d0d0e]";
const btnOutlineLight = "flex items-center gap-1.5 bg-white text-[#3d3d3f] border border-black/[0.08] px-3 py-1.5 rounded-md text-sm font-medium hover:bg-[#f4f4f5] transition-all";
const btnOutlineDark  = "flex items-center gap-1.5 bg-white/[0.06] text-[#c7c7c8] border border-white/[0.08] px-3 py-1.5 rounded-md text-sm font-medium hover:bg-white/[0.1] transition-all";

const STORAGE_KEY      = 'proreceipt_saved';
const LOCAL_CHATS_KEY  = 'proreceipt_ai_chats';

// Defined here so App() can use it for initial state
interface AiMessage { role: 'user' | 'ai'; content: string }

// ─── Chat history (localStorage-first) ───────────────────────────────────────

interface ChatEntry {
  id: string;
  title: string;
  messages: AiMessage[];
  receiptHtml: string;
  updatedAt: number;
}

function readLocalChats(): ChatEntry[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_CHATS_KEY) || '[]'); }
  catch { return []; }
}
function upsertLocalChat(chat: ChatEntry): ChatEntry[] {
  const list = readLocalChats();
  const idx = list.findIndex(c => c.id === chat.id);
  if (idx >= 0) list[idx] = chat; else list.unshift(chat);
  const sorted = list.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 100);
  localStorage.setItem(LOCAL_CHATS_KEY, JSON.stringify(sorted));
  return sorted;
}
function removeLocalChat(id: string): ChatEntry[] {
  const list = readLocalChats().filter(c => c.id !== id);
  localStorage.setItem(LOCAL_CHATS_KEY, JSON.stringify(list));
  return list;
}
const AI_STUDIO_GREETING: AiMessage = {
  role: 'ai',
  content: "Welcome to AI Studio! Describe the receipt you'd like — your business, items, customer details, and any style preferences. I'll design a completely unique receipt for you from scratch.",
};

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  // Single source of truth for receipt data (drives PDF/email/preview)
  const [data, setData]                   = useState<ReceiptData>(INITIAL_DATA);
  const [isGenerating, setIsGenerating]   = useState(false);
  const [isSending, setIsSending]         = useState(false);
  const [savedReceipts, setSavedReceipts] = useState<{ id: string; name: string; data: ReceiptData }[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [saveName, setSaveName]           = useState('');
  const [toast, setToast]                 = useState<{ msg: string; type: 'ok'|'err' } | null>(null);

  // syncKey bumps when a receipt is loaded externally so each card can
  // re-initialise its local state without remounting (VS Code: lazy re-indexing).
  const [syncKey, setSyncKey]         = useState(0);
  const [mobileTab, setMobileTab]     = useState<'editor' | 'preview'>('editor');
  const [mode, setMode]               = useState<'manual' | 'ai'>('manual');

  // AI Studio — lifted here so state survives switching between Manual / AI tabs
  const [aiMessages, setAiMessages]       = useState<AiMessage[]>([AI_STUDIO_GREETING]);
  const [aiReceiptHtml, setAiReceiptHtml] = useState('');
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [dark, setDark]                       = useState(() => {
    const stored = localStorage.getItem('proreceipt_dark');
    if (stored !== null) return stored === 'true';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });
  const btnOutline = dark ? btnOutlineDark : btnOutlineLight;

  // useDeferredValue decouples preview renders from editor renders:
  // inputs update at high priority; preview repaints at lower priority.
  const previewData = useDeferredValue(data);

  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setSavedReceipts(JSON.parse(stored));
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('proreceipt_dark', String(dark));
  }, [dark]);

  const showToast = useCallback((msg: string, type: 'ok'|'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── STABLE update callback ─────────────────────────────────────────────────
  // Empty dep array = same reference every render. This is the key that makes
  // React.memo on child cards effective (no prop change = no re-render).
  const update = useCallback((patch: Partial<ReceiptData>) => {
    setData(d => ({ ...d, ...patch }));
  }, []);

  // ── Persistence ──────────────────────────────────────────────────────────────

  const persistSaved = (list: typeof savedReceipts) => {
    setSavedReceipts(list);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  };

  const handleSave = () => {
    const name = saveName.trim() || `${data.businessName} – ${data.receiptNumber}`;
    persistSaved([...savedReceipts, { id: crypto.randomUUID(), name, data }]);
    setShowSaveModal(false);
    setSaveName('');
    showToast('Receipt saved!');
  };

  const handleLoad = useCallback((entry: { id: string; name: string; data: ReceiptData }) => {
    setData(entry.data);
    setSyncKey(k => k + 1); // tells every card to re-sync local state
    setShowLoadModal(false);
    showToast('Receipt loaded!');
  }, [showToast]);

  const handleDelete = (id: string) => persistSaved(savedReceipts.filter(r => r.id !== id));

  // ── PDF Export (Puppeteer / headless Chrome on the backend) ──────────────────
  // The backend renders the same HTML + CSS with a real Chrome engine, so the
  // downloaded PDF is pixel-perfect relative to what you see in the preview.

  const handleDownloadPDF = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch(`${API_URL}/api/generate-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptData: data, paperSize: data.paperSize }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Server error ${res.status}`);
      }

      // Stream the PDF blob and trigger a browser download
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `receipt-${data.receiptNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

    } catch (e: any) {
      console.error(e);
      showToast(e.message || 'PDF generation failed.', 'err');
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Email ─────────────────────────────────────────────────────────────────────

  const handleSendEmail = async () => {
    const email = data.customerEmail.trim();
    if (!email)              { showToast('Enter a customer email first.', 'err'); return; }
    if (!isValidEmail(email)) { showToast('Invalid email address.', 'err');       return; }
    setIsSending(true);
    try {
      const res  = await fetch(`${API_URL}/api/send-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: email, receiptData: data }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Unknown error');
      showToast(`Receipt sent to ${email}!`);
    } catch (e: any) {
      showToast(e.message || 'Failed to send email.', 'err');
    } finally {
      setIsSending(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className={`min-h-screen flex flex-col font-sans lg:h-screen lg:overflow-hidden transition-colors duration-300 ${dark ? 'bg-[#121212] text-gray-100' : 'bg-[#F5F5F5] text-[#1A1A1A]'}`}>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className={`fixed top-20 left-1/2 -translate-x-1/2 z-100 text-sm px-4 py-2 rounded-full shadow-lg flex items-center gap-2 ${
              toast.type === 'err' ? 'bg-red-600 text-white' : 'bg-black text-white'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" /> {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className={`shrink-0 z-50 border-b px-4 sm:px-6 py-2.5 flex justify-between items-center no-print transition-colors duration-300 ${dark ? 'bg-[#0d0d0e] border-white/[0.06]' : 'bg-white border-black/[0.06]'}`}>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${dark ? 'bg-white/[0.08]' : 'bg-[#0d0d0e]'}`}>
            <Receipt className="text-white w-4 h-4" />
          </div>
          <h1 className={`text-sm font-semibold tracking-[-0.01em] hidden sm:block ${dark ? 'text-[#ededef]' : 'text-[#0d0d0e]'}`}>ProReceipt</h1>
          {/* Mode toggle */}
          <div className={`flex rounded-[6px] p-0.5 text-xs font-medium ${dark ? 'bg-white/[0.06]' : 'bg-[#f4f4f5]'}`}>
            <button onClick={() => setMode('manual')}
              className={`px-3 py-1.5 rounded-[4px] transition-all ${mode === 'manual' ? (dark ? 'bg-white/[0.1] text-[#ededef] shadow-sm' : 'bg-white text-[#0d0d0e] shadow-[0_1px_2px_rgba(0,0,0,0.08)]') : (dark ? 'text-[#5c5c63] hover:text-[#8b8b8e]' : 'text-[#9b9ba0] hover:text-[#5c5c63]')}`}>
              Manual
            </button>
            <button onClick={() => setMode('ai')}
              className={`px-3 py-1.5 rounded-[4px] transition-all flex items-center gap-1 ${mode === 'ai' ? (dark ? 'bg-white/[0.1] text-[#ededef] shadow-sm' : 'bg-white text-[#0d0d0e] shadow-[0_1px_2px_rgba(0,0,0,0.08)]') : (dark ? 'text-[#5c5c63] hover:text-[#8b8b8e]' : 'text-[#9b9ba0] hover:text-[#5c5c63]')}`}>
              <Sparkles className="w-3 h-3" /> AI Studio
            </button>
          </div>
        </div>
        {mode === 'manual' && (
          <div className="flex items-center gap-1.5">
            <button onClick={() => setShowLoadModal(true)} className={btnOutline}>
              <FolderOpen className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Load</span>
            </button>
            <button onClick={() => { setSaveName(`${data.businessName} – ${data.receiptNumber}`); setShowSaveModal(true); }} className={btnOutline}>
              <Save className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Save</span>
            </button>
            <button onClick={() => window.print()} className={btnOutline}>
              <Printer className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Print</span>
            </button>
            <button onClick={handleSendEmail} disabled={isSending}
              className={`${btnOutline} disabled:opacity-50 disabled:cursor-not-allowed`}>
              {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isSending ? 'Sending…' : 'Email'}</span>
            </button>
            <button onClick={handleDownloadPDF} disabled={isGenerating}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${dark ? 'bg-[#5E6AD2] text-white hover:bg-[#6B7AE8]' : 'bg-[#0d0d0e] text-white hover:bg-[#1a1a1d]'}`}>
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isGenerating ? 'Generating…' : 'Download'}</span>
            </button>
          </div>
        )}
      </header>

      {/* Mobile tab switcher — Manual mode only, below lg */}
      {mode === 'manual' && (
        <div className={`lg:hidden shrink-0 flex border-b no-print transition-colors duration-300 ${dark ? 'bg-[#0d0d0e] border-white/[0.06]' : 'bg-white border-black/[0.06]'}`}>
          <button
            onClick={() => setMobileTab('editor')}
            className={`flex-1 py-2.5 text-xs font-medium tracking-wide uppercase transition-colors ${mobileTab === 'editor' ? (dark ? 'text-[#ededef] border-b-2 border-[#5E6AD2]' : 'text-[#0d0d0e] border-b-2 border-[#5E6AD2]') : (dark ? 'text-[#5c5c63]' : 'text-[#9b9ba0]')}`}
          >
            Editor
          </button>
          <button
            onClick={() => setMobileTab('preview')}
            className={`flex-1 py-2.5 text-xs font-medium tracking-wide uppercase transition-colors ${mobileTab === 'preview' ? (dark ? 'text-[#ededef] border-b-2 border-[#5E6AD2]' : 'text-[#0d0d0e] border-b-2 border-[#5E6AD2]') : (dark ? 'text-[#5c5c63]' : 'text-[#9b9ba0]')}`}
          >
            Preview
          </button>
        </div>
      )}

      {/* ── Manual Editor Layout ── */}
      {mode === 'manual' ? (
      <div className="lg:flex-1 lg:min-h-0 lg:overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 grid grid-cols-1 lg:grid-cols-2 gap-6 lg:h-full">

          {/* ── Editor column ── */}
          <section
            className={`space-y-4 pb-8 pr-1 no-print lg:overflow-y-auto lg:h-full lg:pb-10 lg:space-y-5 ${mobileTab === 'editor' ? 'block' : 'hidden'} lg:block`}
            style={{ willChange: 'transform' }}
          >
            <BusinessDetailsCard onUpdate={update} syncKey={syncKey} initial={INITIAL_DATA} />
            <ReceiptInfoCard     onUpdate={update} syncKey={syncKey} initial={INITIAL_DATA} />
            <CustomerInfoCard   onUpdate={update} syncKey={syncKey} initial={INITIAL_DATA} />
            <PaymentCard        onUpdate={update} syncKey={syncKey} initial={INITIAL_DATA} />
            <ItemsCard          onUpdate={update} syncKey={syncKey} initial={INITIAL_DATA} />
            <ThemeCard          onUpdate={update} syncKey={syncKey} initial={INITIAL_DATA} />
            <NotesCard          onUpdate={update} syncKey={syncKey} initial={INITIAL_DATA} />
            <p className="text-center text-gray-400 text-xs pb-2">© 2026 ProReceipt Maker</p>
          </section>

          {/* ── Preview column ── */}
          <div className={`${mobileTab === 'preview' ? 'block' : 'hidden'} lg:block lg:h-full lg:min-h-0`}>
            <ReceiptPreview data={previewData} receiptRef={receiptRef} />
          </div>

        </div>
      </div>
      ) : (
      /* ── AI Studio Layout ── */
      <AIStudio
        receiptHtml={aiReceiptHtml}
        setReceiptHtml={setAiReceiptHtml}
        messages={aiMessages}
        setMessages={setAiMessages}
        currentChatId={currentChatId}
        setCurrentChatId={setCurrentChatId}
        dark={dark}
        showToast={showToast}
      />
      )}

      {/* Print overlay */}
      <div className="hidden print:block fixed inset-0 bg-white z-9999" />

      {/* Save Modal */}
      <AnimatePresence>
        {showSaveModal && (
          <Modal onClose={() => setShowSaveModal(false)} title="Save Receipt">
            <Field label="Save As">
              <input value={saveName} onChange={e => setSaveName(e.target.value)}
                className={inp} placeholder={`${data.businessName} – ${data.receiptNumber}`}
                onKeyDown={e => e.key === 'Enter' && handleSave()} autoFocus />
            </Field>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowSaveModal(false)} className="flex-1 py-2 rounded-xl border border-black/10 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} className="flex-1 py-2 rounded-xl bg-black text-white text-sm hover:bg-gray-900">Save</button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Load Modal */}
      <AnimatePresence>
        {showLoadModal && (
          <Modal onClose={() => setShowLoadModal(false)} title="Load Receipt">
            {savedReceipts.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No saved receipts yet.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {savedReceipts.map(r => (
                  <div key={r.id} className="flex items-center justify-between bg-gray-50 px-4 py-3 rounded-xl">
                    <button onClick={() => handleLoad(r)} className="text-sm font-medium text-left flex-1 hover:text-black truncate">{r.name}</button>
                    <button onClick={() => handleDelete(r.id)} className="ml-3 text-gray-300 hover:text-red-500 transition-colors shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setShowLoadModal(false)} className="w-full mt-4 py-2 rounded-xl border border-black/10 text-sm hover:bg-gray-50">Close</button>
          </Modal>
        )}
      </AnimatePresence>

      {/* Dark mode toggle */}
      <motion.button
        onClick={() => setDark(d => !d)}
        className={`fixed bottom-5 right-5 z-50 w-8 h-8 rounded-full flex items-center justify-center no-print transition-all duration-200 ${
          dark
            ? 'bg-white/[0.07] hover:bg-white/[0.12] text-[#8b8b8e] hover:text-[#c7c7c8] border border-white/[0.06]'
            : 'bg-white hover:bg-[#f4f4f5] text-[#5c5c63] hover:text-[#3d3d3f] border border-black/[0.08] shadow-[0_1px_4px_rgba(0,0,0,0.06)]'
        }`}
        whileTap={{ scale: 0.92 }}
        title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        <AnimatePresence mode="wait">
          {dark ? (
            <motion.div key="sun" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
              <Sun className="w-5 h-5" />
            </motion.div>
          ) : (
            <motion.div key="moon" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.2 }}>
              <Moon className="w-5 h-5" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ISOLATED CARD COMPONENTS
//
// VS Code principle: "File Exclusion" — each card watches only its own slice.
// Typing in BusinessDetailsCard never re-renders ReceiptInfoCard, ItemsCard, etc.
//
// How it works:
//  1. Each card has LOCAL state for its fields (inputs read from local state).
//  2. On every keystroke, only that card's local state changes (re-render cost ~0).
//  3. onUpdate() syncs the change up to parent (triggers deferred preview repaint).
//  4. React.memo + stable onUpdate ref = React bails out of all OTHER cards.
//  5. When a receipt is loaded externally, syncKey bumps → useEffect re-syncs
//     local state to new data (lazy re-index, like VS Code's optimised indexing).
// ─────────────────────────────────────────────────────────────────────────────

type Updater = (patch: Partial<ReceiptData>) => void;

interface CardProps {
  onUpdate: Updater;
  syncKey: number;
  initial: ReceiptData; // used only as the initial value; changes via syncKey
}

// ── Business Details ──────────────────────────────────────────────────────────

const BusinessDetailsCard = memo(function BusinessDetailsCard({ onUpdate, syncKey, initial }: CardProps) {
  const [v, setV] = useState({
    businessName:    initial.businessName,
    businessAddress: initial.businessAddress,
    businessPhone:   initial.businessPhone,
    businessEmail:   initial.businessEmail,
    businessWebsite: initial.businessWebsite,
  });

  // Re-sync when a receipt is loaded (syncKey changes) — NOT on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setV({ businessName: initial.businessName, businessAddress: initial.businessAddress, businessPhone: initial.businessPhone, businessEmail: initial.businessEmail, businessWebsite: initial.businessWebsite }); }, [syncKey]);

  const set = (field: keyof typeof v) => (e: ChangeEvent<HTMLInputElement>) => {
    const next = { ...v, [field]: e.target.value };
    setV(next);
    onUpdate(next);
  };

  return (
    <Card icon={<Settings2 className="w-4 h-4 text-gray-400" />} title="Business Details">
      <Field label="Business Name">
        <input value={v.businessName}    onChange={set('businessName')}    className={inp} placeholder="ACME Corp" />
      </Field>
      <Field label="Address">
        <input value={v.businessAddress} onChange={set('businessAddress')} className={inp} placeholder="123 Street, City" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Phone">
          <input value={v.businessPhone} onChange={set('businessPhone')} className={inp} placeholder="(555) 000-0000" />
        </Field>
        <Field label="Email">
          <input value={v.businessEmail} onChange={set('businessEmail')} className={inp} placeholder="hello@company.com" />
        </Field>
      </div>
      <Field label="Website">
        <input value={v.businessWebsite} onChange={set('businessWebsite')} className={inp} placeholder="www.company.com" />
      </Field>
    </Card>
  );
});

// ── Receipt Info ──────────────────────────────────────────────────────────────

const PAPER_SIZES = [
  { value: 'A4',     label: 'A4  (210 × 297 mm)'  },
  { value: 'Letter', label: 'Letter (8.5 × 11 in)' },
  { value: 'A5',     label: 'A5  (148 × 210 mm)'  },
  { value: 'Legal',  label: 'Legal (8.5 × 14 in)'  },
];

const ReceiptInfoCard = memo(function ReceiptInfoCard({ onUpdate, syncKey, initial }: CardProps) {
  const [v, setV] = useState({
    receiptNumber:  initial.receiptNumber,
    date:           initial.date,
    dueDate:        initial.dueDate,
    taxRate:        initial.taxRate,
    currency:       initial.currency,
    globalDiscount: initial.globalDiscount,
    paperSize:      initial.paperSize,
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setV({ receiptNumber: initial.receiptNumber, date: initial.date, dueDate: initial.dueDate, taxRate: initial.taxRate, currency: initial.currency, globalDiscount: initial.globalDiscount, paperSize: initial.paperSize }); }, [syncKey]);

  const setField = <K extends keyof typeof v>(field: K, value: typeof v[K]) => {
    const next = { ...v, [field]: value };
    setV(next);
    onUpdate(next);
  };

  return (
    <Card icon={<FileText className="w-4 h-4 text-gray-400" />} title="Receipt Info">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Receipt #">
          <input value={v.receiptNumber} onChange={e => setField('receiptNumber', e.target.value)} className={inp} />
        </Field>
        <Field label="Date">
          <input type="date" value={v.date} onChange={e => setField('date', e.target.value)} className={inp} />
        </Field>
        <Field label="Due Date">
          <input type="date" value={v.dueDate} onChange={e => setField('dueDate', e.target.value)} className={inp} />
        </Field>
        <Field label="Tax Rate (%)">
          <input type="number" value={v.taxRate}
            onChange={e => setField('taxRate', parseFloat(e.target.value) || 0)}
            onFocus={e => e.target.select()} className={inp} />
        </Field>
        <Field label="Currency">
          <select value={v.currency} onChange={e => setField('currency', e.target.value)} className={inp}>
            {CURRENCIES.map(c => <option key={c.symbol} value={c.symbol}>{c.symbol} — {c.label}</option>)}
          </select>
        </Field>
        <Field label="Global Discount (%)">
          <input type="number" min="0" max="100" value={v.globalDiscount}
            onChange={e => setField('globalDiscount', parseFloat(e.target.value) || 0)}
            onFocus={e => e.target.select()} className={inp} />
        </Field>
        <Field label="PDF Paper Size">
          <select value={v.paperSize} onChange={e => setField('paperSize', e.target.value as ReceiptData['paperSize'])} className={inp}>
            {PAPER_SIZES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </Field>
      </div>
    </Card>
  );
});

// ── Customer Info ─────────────────────────────────────────────────────────────

const CustomerInfoCard = memo(function CustomerInfoCard({ onUpdate, syncKey, initial }: CardProps) {
  const [v, setV] = useState({
    customerName:  initial.customerName,
    customerEmail: initial.customerEmail,
    customerPhone: initial.customerPhone,
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setV({ customerName: initial.customerName, customerEmail: initial.customerEmail, customerPhone: initial.customerPhone }); }, [syncKey]);

  const set = (field: keyof typeof v) => (e: ChangeEvent<HTMLInputElement>) => {
    const next = { ...v, [field]: e.target.value };
    setV(next);
    onUpdate(next);
  };

  const emailInvalid = v.customerEmail !== '' && !isValidEmail(v.customerEmail);

  return (
    <Card icon={<User className="w-4 h-4 text-gray-400" />} title="Customer Info">
      <Field label="Customer Name">
        <input value={v.customerName} onChange={set('customerName')} className={inp} placeholder="Client Name" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Customer Email">
          <input value={v.customerEmail} onChange={set('customerEmail')}
            className={`${inp} ${emailInvalid ? 'border-red-400 bg-red-50' : ''}`}
            placeholder="client@email.com" />
          {emailInvalid && <p className="text-xs text-red-500 mt-1">Invalid email address</p>}
        </Field>
        <Field label="Customer Phone">
          <input value={v.customerPhone} onChange={set('customerPhone')} className={inp} placeholder="(555) 000-0000" />
        </Field>
      </div>
    </Card>
  );
});

// ── Payment ───────────────────────────────────────────────────────────────────

const PaymentCard = memo(function PaymentCard({ onUpdate, syncKey, initial }: CardProps) {
  const [v, setV] = useState({
    paymentMethod: initial.paymentMethod,
    paymentStatus: initial.paymentStatus,
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setV({ paymentMethod: initial.paymentMethod, paymentStatus: initial.paymentStatus }); }, [syncKey]);

  const setField = <K extends keyof typeof v>(field: K, value: typeof v[K]) => {
    const next = { ...v, [field]: value };
    setV(next);
    onUpdate(next);
  };

  return (
    <Card icon={<DollarSign className="w-4 h-4 text-gray-400" />} title="Payment">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Payment Method">
          <select value={v.paymentMethod} onChange={e => setField('paymentMethod', e.target.value)} className={inp}>
            {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Payment Status">
          <select value={v.paymentStatus} onChange={e => setField('paymentStatus', e.target.value as ReceiptData['paymentStatus'])} className={inp}>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
          </select>
        </Field>
      </div>
    </Card>
  );
});

// ── Items ─────────────────────────────────────────────────────────────────────

const ItemsCard = memo(function ItemsCard({ onUpdate, syncKey, initial }: CardProps) {
  const [items, setItems] = useState<ReceiptItem[]>(initial.items);
  const [currency, setCurrency] = useState(initial.currency);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setItems(initial.items); setCurrency(initial.currency); }, [syncKey]);

  // Keep currency in sync when ReceiptInfoCard changes it (cross-card dependency)
  // We rely on the parent data flowing down via a currency prop isn't available here,
  // so we listen for currency changes through onUpdate side-effects with a lightweight
  // approach: re-read from the latest parent value via a ref trick.
  const latestCurrencyRef = useRef(currency);
  latestCurrencyRef.current = currency;

  const syncItems = useCallback((next: ReceiptItem[]) => {
    setItems(next);
    onUpdate({ items: next });
  }, [onUpdate]);

  const addItem = useCallback(() => {
    syncItems([...items, { id: crypto.randomUUID(), description: '', quantity: 1, price: 0, discount: 0 }]);
  }, [items, syncItems]);

  const removeItem = useCallback((id: string) => {
    syncItems(items.filter(i => i.id !== id));
  }, [items, syncItems]);

  const updateItem = useCallback((id: string, field: keyof ReceiptItem, value: string | number) => {
    syncItems(items.map(i => i.id === id ? { ...i, [field]: value } : i));
  }, [items, syncItems]);

  const itemTotal = (i: ReceiptItem) => i.price * i.quantity * (1 - i.discount / 100);
  const fmt = (n: number) => `${currency}${n.toFixed(2)}`;

  return (
    <Card
      icon={<Tag className="w-4 h-4 text-gray-400" />}
      title="Items"
      action={
        <button onClick={addItem} className="text-xs font-bold flex items-center gap-1 bg-black text-white px-3 py-1.5 rounded-full hover:opacity-80 transition-all">
          <Plus className="w-3 h-3" /> Add Item
        </button>
      }
    >
      <AnimatePresence mode="popLayout">
        {items.map(item => (
          <motion.div
            key={item.id} layout
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
            className="bg-gray-50 p-4 rounded-xl space-y-3 mb-3"
          >
            <div className="grid grid-cols-12 gap-3 items-end">
              <div className="col-span-12 sm:col-span-6 space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Description</label>
                <input type="text" value={item.description}
                  onChange={e => updateItem(item.id, 'description', e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-black/5 rounded-lg focus:border-black/20 outline-none text-sm" placeholder="Item name…" />
              </div>
              <div className="col-span-4 sm:col-span-2 space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Qty</label>
                <input type="number" value={item.quantity}
                  onChange={e => updateItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                  onFocus={e => e.target.select()}
                  className="w-full px-3 py-1.5 bg-white border border-black/5 rounded-lg focus:border-black/20 outline-none text-sm" />
              </div>
              <div className="col-span-4 sm:col-span-2 space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Price</label>
                <input type="number" value={item.price}
                  onChange={e => updateItem(item.id, 'price', parseFloat(e.target.value) || 0)}
                  onFocus={e => e.target.select()}
                  className="w-full px-3 py-1.5 bg-white border border-black/5 rounded-lg focus:border-black/20 outline-none text-sm" />
              </div>
              <div className="col-span-4 sm:col-span-2 space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Disc %</label>
                <input type="number" min="0" max="100" value={item.discount}
                  onChange={e => updateItem(item.id, 'discount', parseFloat(e.target.value) || 0)}
                  onFocus={e => e.target.select()}
                  className="w-full px-3 py-1.5 bg-white border border-black/5 rounded-lg focus:border-black/20 outline-none text-sm" />
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400">
                Total: <strong className="text-gray-700">{fmt(itemTotal(item))}</strong>
                {item.discount > 0 && <span className="ml-2 text-emerald-600">({item.discount}% off)</span>}
              </span>
              <button onClick={() => removeItem(item.id)} className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </Card>
  );
});

// ── Theme ─────────────────────────────────────────────────────────────────────

const ThemeCard = memo(function ThemeCard({ onUpdate, syncKey, initial }: CardProps) {
  const [theme, setTheme]             = useState<ThemeKey>(initial.theme);
  const [customTheme, setCustomTheme] = useState<CustomThemeColors>(initial.customTheme);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setTheme(initial.theme); setCustomTheme(initial.customTheme); }, [syncKey]);

  const selectTheme = (t: ThemeKey) => {
    setTheme(t);
    onUpdate({ theme: t });
  };

  const setColor = (field: keyof CustomThemeColors) => (e: ChangeEvent<HTMLInputElement>) => {
    const next = { ...customTheme, [field]: e.target.value };
    setCustomTheme(next);
    onUpdate({ customTheme: next });
  };

  return (
    <Card icon={<Palette className="w-4 h-4 text-gray-400" />} title="Receipt Theme">
      <div className="grid grid-cols-3 gap-2 mb-3">
        {(Object.keys(THEMES) as Exclude<ThemeKey,'custom'>[]).map(t => (
          <button key={t} onClick={() => selectTheme(t)}
            className={`py-2.5 rounded-xl border-2 text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              theme === t ? 'border-black bg-black text-white' : 'border-black/10 bg-white text-gray-600 hover:border-black/30'
            }`}>
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: THEMES[t].accent }} />
            {THEMES[t].label}
          </button>
        ))}
        <button onClick={() => selectTheme('custom')}
          className={`py-2.5 rounded-xl border-2 text-xs font-semibold transition-all ${
            theme === 'custom' ? 'border-black bg-black text-white' : 'border-black/10 bg-white text-gray-600 hover:border-black/30'
          }`}>
          Custom
        </button>
      </div>

      <AnimatePresence>
        {theme === 'custom' && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-black/5">
              {(['accent','headerBg','headerText'] as const).map(field => (
                <Field key={field} label={field === 'accent' ? 'Accent' : field === 'headerBg' ? 'Header Bg' : 'Header Text'}>
                  <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-transparent focus-within:border-black/10">
                    <input type="color" value={customTheme[field]} onChange={setColor(field)}
                      className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0" />
                    <span className="text-xs text-gray-500 font-mono">{customTheme[field]}</span>
                  </div>
                </Field>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
});

// ── Notes ─────────────────────────────────────────────────────────────────────

const NotesCard = memo(function NotesCard({ onUpdate, syncKey, initial }: CardProps) {
  const [notes, setNotes] = useState(initial.notes);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setNotes(initial.notes); }, [syncKey]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setNotes(e.target.value);
    onUpdate({ notes: e.target.value });
  };

  return (
    <Card icon={<FileText className="w-4 h-4 text-gray-400" />} title="Notes">
      <textarea value={notes} onChange={handleChange}
        className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-black/10 outline-none transition-all min-h-20 text-sm text-black"
        placeholder="Additional notes or terms…" />
    </Card>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// RECEIPT PREVIEW
// Memoized + driven by useDeferredValue(data) from parent.
// Re-renders at lower priority than the editor — never blocks typing.
// ─────────────────────────────────────────────────────────────────────────────

const ReceiptPreview = memo(function ReceiptPreview({
  data,
  receiptRef,
}: {
  data: ReceiptData;
  receiptRef: React.RefObject<HTMLDivElement | null>;
}) {
  const itemTotal   = (i: ReceiptItem) => i.price * i.quantity * (1 - i.discount / 100);
  const subtotal    = data.items.reduce((s, i) => s + itemTotal(i), 0);
  const discountAmt = (subtotal * data.globalDiscount) / 100;
  const taxable     = subtotal - discountAmt;
  const taxAmt      = (taxable * data.taxRate) / 100;
  const total       = taxable + taxAmt;
  const fmt         = (n: number) => `${data.currency}${n.toFixed(2)}`;

  const theme: ThemeDef = data.theme === 'custom'
    ? { ...data.customTheme, label: 'Custom' }
    : THEMES[data.theme];

  const subText  = theme.headerText === '#ffffff' ? '#94a3b8' : '#888';
  const bodyText = theme.headerText === '#ffffff' ? '#cbd5e1' : '#666';

  return (
    <section className="pb-8 lg:overflow-y-auto lg:h-full lg:pb-10 no-print" style={{ willChange: 'transform' }}>
      <div className="flex items-center gap-2 mb-4 px-2">
        <Eye className="w-4 h-4 text-gray-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Live Preview</h2>
      </div>

      <div className="bg-white shadow-2xl rounded-sm mx-auto overflow-hidden w-full max-w-150">
        <div id="receipt-to-capture" ref={receiptRef}
          className="p-6 sm:p-12 w-full flex flex-col relative bg-white"
          style={{ fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace', color: '#1a1a1a' }}
        >
          <div className="absolute top-0 left-0 w-full h-1.5" style={{ backgroundColor: theme.accent }} />

          <div className="text-center mb-8 py-8 -mx-12 px-12" style={{ backgroundColor: theme.headerBg }}>
            <h2 className="text-2xl font-bold tracking-widest uppercase mb-1" style={{ color: theme.headerText }}>
              {data.businessName}
            </h2>
            <p className="text-xs" style={{ color: bodyText }}>{data.businessAddress}</p>
            <div className="flex justify-center gap-4 mt-2 text-xs flex-wrap" style={{ color: subText }}>
              {data.businessPhone   && <span>{data.businessPhone}</span>}
              {data.businessEmail   && <span>{data.businessEmail}</span>}
              {data.businessWebsite && <span>{data.businessWebsite}</span>}
            </div>
          </div>

          <div className="flex justify-end mb-4">
            <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full ${
              data.paymentStatus === 'paid'    ? 'bg-emerald-100 text-emerald-700' :
              data.paymentStatus === 'partial' ? 'bg-amber-100 text-amber-700'    :
                                                 'bg-red-100 text-red-700'
            }`}>
              {data.paymentStatus}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:gap-8 mb-4 sm:mb-8 py-4 sm:py-6"
            style={{ borderTop: `1px solid ${theme.accent}`, borderBottom: `1px solid ${theme.accent}` }}>
            <div>
              <p className="text-[10px] uppercase font-bold text-[#999] mb-1">Billed To</p>
              <p className="text-sm font-bold">{data.customerName}</p>
              {data.customerEmail && <p className="text-xs text-[#666]">{data.customerEmail}</p>}
              {data.customerPhone && <p className="text-xs text-[#666]">{data.customerPhone}</p>}
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase font-bold text-[#999] mb-1">Details</p>
              <p className="text-xs">No: <span className="font-bold">{data.receiptNumber}</span></p>
              <p className="text-xs">Date: {data.date}</p>
              {data.dueDate && <p className="text-xs">Due: {data.dueDate}</p>}
              <p className="text-xs">Via: {data.paymentMethod}</p>
            </div>
          </div>

          <div className="grow">
            <table className="w-full text-xs sm:text-sm border-collapse">
              <thead>
                <tr style={{ borderBottom: `2px solid ${theme.accent}` }}>
                  <th className="py-1.5 sm:py-2 text-left   font-bold uppercase tracking-wider text-[10px] sm:text-xs">Description</th>
                  <th className="py-1.5 sm:py-2 text-center font-bold uppercase tracking-wider text-[10px] sm:text-xs">Qty</th>
                  <th className="py-1.5 sm:py-2 text-right  font-bold uppercase tracking-wider text-[10px] sm:text-xs">Price</th>
                  <th className="py-1.5 sm:py-2 text-right  font-bold uppercase tracking-wider text-[10px] sm:text-xs">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td className="py-1.5 sm:py-3">
                      {item.description || 'Untitled Item'}
                      {item.discount > 0 && (
                        <span className="ml-1 sm:ml-2 text-[10px] bg-emerald-100 text-emerald-700 px-1 sm:px-1.5 py-0.5 rounded-full">
                          {item.discount}% off
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 sm:py-3 text-center">{item.quantity}</td>
                    <td className="py-1.5 sm:py-3 text-right">{fmt(item.price)}</td>
                    <td className="py-1.5 sm:py-3 text-right font-bold">{fmt(itemTotal(item))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 pt-6" style={{ borderTop: `2px solid ${theme.accent}` }}>
            <div className="flex justify-end mb-6">
              <div className="w-full sm:w-56 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[#999] uppercase text-xs">Subtotal</span>
                  <span>{fmt(subtotal)}</span>
                </div>
                {data.globalDiscount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-emerald-600 uppercase text-xs">Discount ({data.globalDiscount}%)</span>
                    <span className="text-emerald-600">−{fmt(discountAmt)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-[#999] uppercase text-xs">Tax ({data.taxRate}%)</span>
                  <span>{fmt(taxAmt)}</span>
                </div>
                <div className="flex justify-between pt-2 mt-1" style={{ borderTop: `1px solid ${theme.accent}` }}>
                  <span className="font-bold uppercase text-sm">Total</span>
                  <span className="font-bold text-base sm:text-lg">{fmt(total)}</span>
                </div>
              </div>
            </div>

            {data.notes && (
              <div className="mb-6 p-4 bg-[#f9f9f9] rounded">
                <p className="text-[10px] uppercase font-bold text-[#999] mb-1">Notes</p>
                <p className="text-xs italic text-[#666]">{data.notes}</p>
              </div>
            )}

            <div className="text-center">
              <p className="text-sm font-medium tracking-widest uppercase mb-3">Thank you for your business</p>
              <div className="flex justify-center mb-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center opacity-10"
                  style={{ border: `1px solid ${theme.accent}` }}>
                  <Receipt className="w-4 h-4" />
                </div>
              </div>
              <p className="text-[8px] text-[#ccc] uppercase tracking-[0.4em]">Generated via ProReceipt</p>
            </div>
          </div>

          <div className="absolute bottom-0 left-0 w-full h-1.5" style={{ backgroundColor: theme.accent }} />
        </div>
      </div>
    </section>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// AI STUDIO — Generates complete HTML receipts with unique creative designs
// Chat + live iframe preview. State is lifted to App to survive tab switching.
// ─────────────────────────────────────────────────────────────────────────────

const AI_LOADING_MSGS = [
  'Crafting your receipt design...',
  'Laying out the structure...',
  'Adding creative touches...',
  'Styling the typography...',
  'Fine-tuning every detail...',
  'Polishing the final result...',
  'Your receipt is almost ready...',
  'Just a moment more...',
];

const AI_SUGGESTIONS = [
  { icon: '☕', label: 'Coffee shop receipt', prompt: 'Create a receipt for my coffee shop — 2 lattes, 1 cappuccino and 3 muffins, paid by card' },
  { icon: '💻', label: 'Freelance invoice',   prompt: 'Make a professional invoice for web design services, $2,500 total, net 30 days' },
  { icon: '🍽️', label: 'Restaurant bill',     prompt: 'Generate a stylish receipt for a dinner for 4 at a fancy Italian restaurant' },
  { icon: '🏢', label: 'Business invoice',    prompt: 'Design a modern corporate invoice for software development consulting services' },
];

// ── Scaled iframe preview ──────────────────────────────────────────────────────
// Reads the receipt's natural width after load and applies CSS transform so it
// always fits the container without horizontal scroll, while keeping the design
// pixel-perfect (no re-layout). The wrapper height is adjusted to match so no
// dead space or clipping occurs.
const ScaledIframePreview = memo(function ScaledIframePreview({
  html,
  title = 'AI Receipt Preview',
}: {
  html: string;
  title?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const iframeRef  = useRef<HTMLIFrameElement>(null);
  const [scale,  setScale]  = useState(1);
  const [docH,   setDocH]   = useState(0);

  const recompute = useCallback(() => {
    const wrapper = wrapperRef.current;
    const de = iframeRef.current?.contentDocument?.documentElement;
    if (!wrapper || !de) return;
    const naturalW   = de.scrollWidth  || 800;
    const naturalH   = de.scrollHeight || 600;
    const s = Math.min(1, wrapper.clientWidth / naturalW);
    setScale(s);
    setDocH(naturalH);
  }, []);

  // Re-run whenever the container is resized (responsive)
  useEffect(() => {
    const ro = new ResizeObserver(recompute);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, [recompute]);

  return (
    <div ref={wrapperRef} className="w-full h-full overflow-x-hidden overflow-y-auto">
      {/* Shrink wrapper to scaled height so no dead space below */}
      <div style={{ height: docH > 0 ? docH * scale : 'auto' }}>
        <iframe
          ref={iframeRef}
          srcDoc={html}
          title={title}
          sandbox="allow-same-origin"
          onLoad={recompute}
          style={{
            display: 'block',
            border: 'none',
            width:  scale < 1 ? `${(1 / scale) * 100}%` : '100%',
            height: docH > 0 ? `${docH}px` : '100%',
            transformOrigin: 'top left',
            transform: scale < 1 ? `scale(${scale})` : 'none',
          }}
        />
      </div>
    </div>
  );
});



function AIStudio({ receiptHtml, setReceiptHtml, messages, setMessages, currentChatId, setCurrentChatId, dark, showToast }: {
  receiptHtml: string;
  setReceiptHtml: (h: string) => void;
  messages: AiMessage[];
  setMessages: (m: AiMessage[]) => void;
  currentChatId: string | null;
  setCurrentChatId: (id: string | null) => void;
  dark: boolean;
  showToast: (msg: string, type?: 'ok' | 'err') => void;
}) {
  const auth = useAppAuth();
  const [input, setInput]                 = useState('');
  const [isLoading, setIsLoading]         = useState(false);
  const [loadingStep, setLoadingStep]     = useState(0);
  const [isDownloading, setIsDownloading]   = useState(false);
  const [sidebarOpen, setSidebarOpen]         = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobilePanel, setMobilePanel]       = useState<'chat' | 'preview'>('chat');
  const [renamingId, setRenamingId]             = useState<string | null>(null);
  const [renameValue, setRenameValue]           = useState('');
  const [attachedFiles, setAttachedFiles]       = useState<Array<{ id: string; file: File; type: 'image' | 'text'; preview?: string; content?: string }>>([]);
  const [isDragOver, setIsDragOver]             = useState(false);
  const [showAttachMenu, setShowAttachMenu]     = useState(false);
  const [pendingReceiptGen, setPendingReceiptGen] = useState(false);
  // localStorage is the source of truth — works without server or sign-in
  const [chats, setChats] = useState<ChatEntry[]>(() => readLocalChats());
  const scrollRef       = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef(0);
  const renameInputRef  = useRef<HTMLInputElement>(null);
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const dragCounter     = useRef(0);

  // ── Process dropped / selected files ──
  const processFiles = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach(file => {
      const id = crypto.randomUUID();
      const isImage = file.type.startsWith('image/');
      const reader = new FileReader();
      reader.onload = e => {
        const result = e.target?.result as string;
        setAttachedFiles(prev => [
          ...prev,
          isImage
            ? { id, file, type: 'image' as const, preview: result }
            : { id, file, type: 'text'  as const, content: result },
        ]);
      };
      if (isImage) reader.readAsDataURL(file); else reader.readAsText(file);
    });
  }, []);

  // ── Persist a chat to localStorage (and server if signed in) ──
  const persistChat = useCallback(async (
    id: string, msgs: AiMessage[], html: string,
  ) => {
    const title = msgs.find(m => m.role === 'user')?.content.slice(0, 60) || 'New Chat';
    const entry: ChatEntry = { id, title, messages: msgs, receiptHtml: html, updatedAt: Date.now() };
    setChats(upsertLocalChat(entry));

    // Also sync to server when signed in (best-effort, silent fail)
    if (auth.isSignedIn) {
      const token = await auth.getToken().catch(() => null);
      if (!token) return;
      // Try update first, fall back to create
      const upd = await fetch(`${API_URL}/api/chats/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, messages: msgs, receipt_html: html }),
      }).catch(() => null);
      // If the chat doesn't exist on the server yet (404), create it
      if (upd && upd.status === 404) {
        await fetch(`${API_URL}/api/chats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id, title, messages: msgs, receipt_html: html }),
        }).catch(() => {});
      }
    }
  }, [auth.isSignedIn, auth.getToken]);

  // ── New Chat ──
  const newChat = () => {
    setMessages([AI_STUDIO_GREETING]);
    setReceiptHtml('');
    setCurrentChatId(null);
    setSidebarOpen(false);
    setMobilePanel('chat');
  };

  // ── Load a chat from sidebar ──
  const loadChat = (chatId: string) => {
    const entry = readLocalChats().find(c => c.id === chatId);
    if (!entry) return;
    setMessages(entry.messages);
    setReceiptHtml(entry.receiptHtml);
    setCurrentChatId(chatId);
    setSidebarOpen(false);
    setMobilePanel(entry.receiptHtml ? 'preview' : 'chat');
  };

  // ── Delete a chat ──
  const deleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChats(removeLocalChat(chatId));
    if (currentChatId === chatId) {
      setMessages([AI_STUDIO_GREETING]);
      setReceiptHtml('');
      setCurrentChatId(null);
    }
    // Also delete from server if signed in
    if (auth.isSignedIn) {
      const token = await auth.getToken().catch(() => null);
      if (token) {
        fetch(`${API_URL}/api/chats/${chatId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
    }
  };

  // ── Rename a chat ──
  const startRename = (chat: ChatEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(chat.id);
    setRenameValue(chat.title);
    setTimeout(() => { renameInputRef.current?.select(); }, 0);
  };

  const commitRename = async (chatId: string) => {
    const newTitle = renameValue.trim();
    if (!newTitle) { setRenamingId(null); return; }
    const updated = readLocalChats().map(c => c.id === chatId ? { ...c, title: newTitle } : c);
    localStorage.setItem(LOCAL_CHATS_KEY, JSON.stringify(updated));
    setChats(updated);
    setRenamingId(null);
    // Sync to server if signed in
    if (auth.isSignedIn) {
      const token = await auth.getToken().catch(() => null);
      if (token) {
        fetch(`${API_URL}/api/chats/${chatId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ title: newTitle }),
        }).catch(() => {});
      }
    }
  };

  // ── Sync chats from server when signed in (so chats load on any device) ──
  useEffect(() => {
    if (!auth.isSignedIn) return;
    (async () => {
      const token = await auth.getToken().catch(() => null);
      if (!token) return;
      const res = await fetch(`${API_URL}/api/chats`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      if (!res?.ok) return;
      const summaries: Array<{ id: string; title: string; updated_at: string }> = await res.json().catch(() => []);
      if (summaries.length === 0) return;
      const localChats = readLocalChats();
      const localIds = new Set(localChats.map(c => c.id));
      const missing = summaries.filter(s => !localIds.has(s.id));
      if (missing.length === 0) return;
      // Fetch full data for chats not in localStorage, in parallel
      const fetched = (await Promise.all(
        missing.map(s =>
          fetch(`${API_URL}/api/chats/${s.id}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        )
      )).filter(Boolean).map((c: any): ChatEntry => ({
        id: c.id,
        title: c.title,
        messages: c.messages,
        receiptHtml: c.receipt_html ?? '',
        updatedAt: new Date(c.updated_at).getTime(),
      }));
      if (fetched.length === 0) return;
      const merged = [...fetched, ...localChats].sort((a, b) => b.updatedAt - a.updatedAt);
      localStorage.setItem(LOCAL_CHATS_KEY, JSON.stringify(merged));
      setChats(merged);
    })();
  }, [auth.isSignedIn]);

  // ── Auto-scroll — only fires when a new message is added, not on isLoading toggles ──
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      prevMsgCountRef.current = messages.length;
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // ── Loading step animation ──
  useEffect(() => {
    if (!isLoading) return;
    const id = setInterval(() => setLoadingStep(s => (s + 1) % AI_LOADING_MSGS.length), 2500);
    return () => clearInterval(id);
  }, [isLoading]);

  // ── Send message ──
  const send = async () => {
    const text = input.trim();
    if ((!text && attachedFiles.length === 0) || isLoading) return;

    setInput('');
    setShowAttachMenu(false);

    // Ask the AI to classify whether this is receipt-related (drives preview animation)
    // Fire-and-forget: updates pendingReceiptGen when result arrives
    fetch(`${API_URL}/api/ai-classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text || '(file uploaded)' }),
    })
      .then(r => r.json())
      .then((d: any) => { if (d.isReceiptRelated) setPendingReceiptGen(true); })
      .catch(() => {});

    // Build text — append any text-file contents
    const textContent = [
      text,
      ...attachedFiles.filter(f => f.type === 'text' && f.content)
        .map(f => `\n\n[Attached: ${f.file.name}]\n${f.content}`),
    ].join('').trim();

    // Build the display message (no base64 in history)
    const displayText = text + (attachedFiles.length > 0 ? ` [+${attachedFiles.length} file${attachedFiles.length > 1 ? 's' : ''}]` : '');
    const userMsg: AiMessage = { role: 'user', content: displayText || '(file uploaded)' };

    // Build the API content (images go as vision blocks)
    const imageFiles = attachedFiles.filter(f => f.type === 'image' && f.preview);
    const apiContent: any = imageFiles.length > 0
      ? [
          { type: 'text', text: textContent || 'Use these images to help create the receipt.' },
          ...imageFiles.map(f => ({ type: 'image_url', image_url: { url: f.preview! } })),
        ]
      : textContent;

    setAttachedFiles([]);

    const next: AiMessage[] = [...messages, userMsg];
    setMessages(next);
    setIsLoading(true);
    setLoadingStep(0);

    const chatId = currentChatId ?? (() => {
      const id = crypto.randomUUID();
      setCurrentChatId(id);
      return id;
    })();

    try {
      // Previous turns as plain text; last user turn may have vision content
      const apiMessages = [
        ...next.slice(1, -1).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
        { role: 'user', content: apiContent },
      ];

      const res = await fetch(`${API_URL}/api/ai-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `API error ${res.status}`);

      const fullReply: string = data.reply ?? '';
      let newHtml = receiptHtml;
      const htmlMatch = fullReply.match(/```html\s*([\s\S]*?)```/);
      if (htmlMatch) {
        newHtml = htmlMatch[1].trim();
        setReceiptHtml(newHtml);
        if (window.innerWidth < 1024) setMobilePanel('preview');
      }

      const finalMessages = [...next, { role: 'ai' as const, content: fullReply }];
      setMessages(finalMessages);
      persistChat(chatId, finalMessages, newHtml);
    } catch (err: any) {
      const errMessages = [...next, { role: 'ai' as const, content: `Something went wrong: ${err.message}` }];
      setMessages(errMessages);
    } finally {
      setIsLoading(false);
      setPendingReceiptGen(false);
    }
  };

  // ── Download PDF ──
  const downloadPdf = async () => {
    if (!receiptHtml) return;
    setIsDownloading(true);

    // Best-effort: parse the receipt's declared width from its CSS so the
    // iframe matches and there is no extra whitespace around the content.
    const widthMatch = receiptHtml.match(/max-width\s*:\s*(\d+)px/i)
      || receiptHtml.match(/(?<![a-z-])width\s*:\s*(\d+)px/i);
    const receiptWidth = widthMatch ? Math.min(parseInt(widthMatch[1], 10), 1200) : 800;

    const tmp = document.createElement('iframe');
    // visibility:hidden keeps the element in the browser's render/paint pipeline
    // (unlike opacity:0 which can suppress GPU-composited layers like shadows and
    // gradients). position:fixed at top:0 left:0 gives it a real viewport.
    tmp.style.cssText = [
      'position:fixed', 'top:0', 'left:0',
      `width:${receiptWidth}px`, 'height:1px',
      'visibility:hidden', 'pointer-events:none',
      'border:none', 'z-index:-1',
    ].join(';');
    document.body.appendChild(tmp);

    try {
      // Step 1 — load receipt HTML into the iframe
      await new Promise<void>((resolve, reject) => {
        tmp.addEventListener('load',  () => resolve(), { once: true });
        tmp.addEventListener('error', () => reject(new Error('iframe failed to load')), { once: true });
        tmp.srcdoc = receiptHtml;
      });

      const iframeDoc = tmp.contentDocument;
      if (!iframeDoc) throw new Error('Preview not ready');

      // Step 2 — wait for fonts + allow CSS transitions/layouts to settle
      await iframeDoc.fonts?.ready;
      await new Promise(r => setTimeout(r, 150));

      // Step 3 — read natural dimensions, resize iframe for full capture
      const body     = iframeDoc.body;
      const de       = iframeDoc.documentElement;
      const naturalW = body.scrollWidth  || de.scrollWidth  || receiptWidth;
      const naturalH = body.scrollHeight || de.scrollHeight || 600;
      tmp.style.width  = `${naturalW}px`;
      tmp.style.height = `${naturalH}px`;
      await new Promise(r => setTimeout(r, 50)); // reflow after resize

      // Step 4 — capture at 3× (288 DPI — print quality) → this is the PNG step
      const SCALE      = 3;
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(body, {
        scale: SCALE, useCORS: true, allowTaint: true,
        backgroundColor: '#ffffff', logging: false,
        width: naturalW, height: naturalH,
        windowWidth: naturalW, windowHeight: naturalH,
        scrollX: 0, scrollY: 0,
      });

      // Step 5 — export as PNG
      const pngDataUrl = canvas.toDataURL('image/png');

      // Step 6 — build PDF from the PNG; page is sized exactly to the receipt
      const { jsPDF } = await import('jspdf');
      const PX_TO_MM  = 25.4 / 96;
      const pageW = (canvas.width  / SCALE) * PX_TO_MM;
      const pageH = (canvas.height / SCALE) * PX_TO_MM;
      const pdf = new jsPDF({
        orientation: pageH > pageW ? 'portrait' : 'landscape',
        unit: 'mm', format: [pageW, pageH], compress: true,
      });
      pdf.addImage(pngDataUrl, 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');
      pdf.save(`receipt-${Date.now()}.pdf`);
      showToast('PDF downloaded!', 'ok');

    } catch (err: any) {
      showToast(err.message || 'Failed to download PDF', 'err');
    } finally {
      document.body.removeChild(tmp);
      setIsDownloading(false);
    }
  };

  const displayContent = (msg: AiMessage) =>
    msg.role === 'ai' ? (msg.content.replace(/```html[\s\S]*?```/g, '').trim() || 'Receipt generated! Check the preview.') : msg.content;

  // ── Dark-aware tokens ──
  const cardBg    = dark ? 'bg-[#111113] border-white/[0.06]' : 'bg-white border-black/[0.06]';
  const headerBdr = dark ? 'border-white/[0.06]' : 'border-black/[0.06]';
  const inputBg   = dark ? 'bg-white/[0.04] border-white/[0.08] text-[#ededef] placeholder-[#5c5c63] focus:border-[#5E6AD2]/50' : 'bg-[#f4f4f5] border-transparent text-[#0d0d0e] placeholder-[#9b9ba0] focus:bg-white focus:border-black/[0.1]';
  const sidebarBg = dark ? 'bg-[#0d0d0e]' : 'bg-[#f9f9fb]';
  const sidebarItemBg = dark ? 'hover:bg-white/[0.04]' : 'hover:bg-black/[0.04]';
  const sidebarItemActive = dark ? 'bg-white/[0.07] text-[#ededef]' : 'bg-black/[0.05] text-[#0d0d0e]';

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">

      {/* ── Sidebar (desktop: always visible, mobile: overlay) ── */}

      {/* Mobile backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar panel */}
      <div className={`
        fixed lg:relative inset-y-0 left-0 z-50 lg:z-auto
        w-64 shrink-0 flex flex-col border-r transition-all duration-300 overflow-hidden
        ${sidebarBg} ${dark ? 'border-white/10' : 'border-gray-200'}
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        ${sidebarCollapsed ? 'lg:w-0 lg:border-r-0' : 'lg:w-64'} lg:translate-x-0
      `}>
        {/* Sidebar header */}
        <div className={`shrink-0 flex items-center justify-between px-4 py-4 border-b ${headerBdr}`}>
          <button onClick={newChat}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors w-full ${dark ? 'bg-white/[0.06] text-[#c7c7c8] hover:bg-white/[0.1]' : 'bg-black/[0.04] text-[#3d3d3f] hover:bg-black/[0.07]'}`}>
            <SquarePen className="w-3.5 h-3.5" /> New Chat
          </button>
          <button onClick={() => setSidebarOpen(false)} className={`lg:hidden ml-2 p-1.5 rounded-md ${dark ? 'hover:bg-white/[0.06] text-[#5c5c63]' : 'hover:bg-black/[0.05] text-[#9b9ba0]'}`}>
            <X className="w-4 h-4" />
          </button>
          <button onClick={() => setSidebarCollapsed(true)} className={`hidden lg:block ml-2 p-1.5 rounded-md ${dark ? 'hover:bg-white/[0.06] text-[#5c5c63]' : 'hover:bg-black/[0.05] text-[#9b9ba0]'}`}>
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Chat list — always shown from localStorage */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {chats.length === 0 ? (
            <p className={`text-xs text-center py-8 px-4 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
              No chats yet. Start a conversation!
            </p>
          ) : (
            <div className="space-y-0.5">
              {chats.map(chat => (
                <div key={chat.id}
                  onClick={() => renamingId === chat.id ? undefined : loadChat(chat.id)}
                  className={`group flex items-center gap-2 px-2.5 py-2 rounded-md transition-colors text-sm ${
                    renamingId === chat.id ? (dark ? 'bg-white/[0.04]' : 'bg-black/[0.04]') :
                    currentChatId === chat.id ? sidebarItemActive : `cursor-pointer ${dark ? 'text-[#8b8b8e]' : 'text-[#5c5c63]'} ${sidebarItemBg}`
                  }`}>
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-50" />
                  {renamingId === chat.id ? (
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename(chat.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      onBlur={() => commitRename(chat.id)}
                      onClick={e => e.stopPropagation()}
                      className={`flex-1 min-w-0 text-sm bg-transparent outline-none border-b ${dark ? 'border-[#5E6AD2] text-[#ededef]' : 'border-[#5E6AD2] text-[#0d0d0e]'}`}
                    />
                  ) : (
                    <span className="flex-1 truncate">{chat.title}</span>
                  )}
                  {renamingId === chat.id ? (
                    <button onMouseDown={e => { e.preventDefault(); commitRename(chat.id); }}
                      className={`p-1 rounded-md text-[#5E6AD2] transition-all shrink-0 ${dark ? 'hover:bg-white/[0.06]' : 'hover:bg-black/[0.06]'}`}>
                      <Check className="w-3 h-3" />
                    </button>
                  ) : (
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0">
                      <button onClick={(e) => startRename(chat, e)}
                        className={`p-1 rounded-md transition-all ${dark ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-200 text-gray-400'}`}>
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={(e) => deleteChat(chat.id, e)}
                        className="p-1 rounded-md hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-all">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar footer — auth */}
        <div className={`shrink-0 border-t px-4 py-3 ${headerBdr}`}>
          {auth.clerkEnabled ? (
            auth.isSignedIn ? (
              <div className="flex items-center gap-3">
                <UserButton
                  appearance={{
                    elements: { avatarBox: 'w-8 h-8' },
                  }}
                />
                <span className={`text-xs truncate ${dark ? 'text-gray-400' : 'text-gray-500'}`}>My Account</span>
              </div>
            ) : (
              <SignInButton mode="modal">
                <button className={`flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm font-medium transition-colors ${dark ? 'bg-white/[0.06] text-[#c7c7c8] hover:bg-white/[0.1]' : 'bg-[#5E6AD2]/[0.08] text-[#5E6AD2] hover:bg-[#5E6AD2]/[0.14]'}`}>
                  <LogIn className="w-3.5 h-3.5" /> Sign In
                </button>
              </SignInButton>
            )
          ) : (
            <p className={`text-[10px] text-center ${dark ? 'text-gray-600' : 'text-gray-300'}`}>
              Auth not configured
            </p>
          )}
        </div>
      </div>

      {/* ── Main content (chat + preview) ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

        {/* Mobile tab bar — hidden on desktop */}
        <div className={`lg:hidden shrink-0 flex border-b ${dark ? 'border-white/[0.06] bg-[#0d0d0e]' : 'border-black/[0.06] bg-[#f9f9fb]'}`}>
          <button onClick={() => setMobilePanel('chat')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium tracking-wide uppercase transition-colors border-b-2 ${
              mobilePanel === 'chat'
                ? 'border-[#5E6AD2] text-[#5E6AD2]'
                : `border-transparent ${dark ? 'text-[#5c5c63]' : 'text-[#9b9ba0]'}`
            }`}>
            <MessageSquare className="w-3.5 h-3.5" /> Chat
          </button>
          <button onClick={() => setMobilePanel('preview')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium tracking-wide uppercase transition-colors border-b-2 ${
              mobilePanel === 'preview'
                ? 'border-[#5E6AD2] text-[#5E6AD2]'
                : `border-transparent ${dark ? 'text-[#5c5c63]' : 'text-[#9b9ba0]'}`
            }`}>
            <Eye className="w-3.5 h-3.5" /> Preview
            {receiptHtml && <span className="w-1.5 h-1.5 rounded-full bg-[#5E6AD2] ml-0.5" />}
          </button>
        </div>

        <div className="flex-1 flex lg:flex-row min-h-0 gap-0 lg:gap-4 p-2 sm:p-4 overflow-hidden">

          {/* Chat panel */}
          <div className={`${mobilePanel === 'chat' ? 'flex' : 'hidden'} lg:flex flex-1 flex-col rounded-xl border min-h-0 min-w-0 ${cardBg}`}>
            {/* Chat header */}
            <div className={`shrink-0 flex items-center gap-2.5 px-4 py-3 border-b ${headerBdr}`}>
              <button onClick={() => window.innerWidth >= 1024 ? setSidebarCollapsed(false) : setSidebarOpen(true)}
                className={`${sidebarCollapsed ? '' : 'lg:hidden'} p-1.5 -ml-1 rounded-md ${dark ? 'hover:bg-white/[0.06] text-[#5c5c63]' : 'hover:bg-black/[0.05] text-[#9b9ba0]'}`}>
                <PanelLeftOpen className="w-4 h-4" />
              </button>
              <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${dark ? 'bg-[#5E6AD2]/20' : 'bg-[#5E6AD2]/10'}`}>
                <Sparkles className="w-3.5 h-3.5 text-[#5E6AD2]" />
              </div>
              <div className="min-w-0">
                <h2 className={`text-sm font-semibold tracking-[-0.01em] ${dark ? 'text-[#ededef]' : 'text-[#0d0d0e]'}`}>AI Studio</h2>
                <p className={`text-[10px] ${dark ? 'text-[#5c5c63]' : 'text-[#9b9ba0]'}`}>Powered by GPT</p>
              </div>
            </div>

            {/* Messages */}
            <div
              className={`flex-1 min-h-0 overflow-y-auto px-4 py-4 relative transition-colors duration-150 ${isDragOver ? (dark ? 'bg-[#5E6AD2]/5' : 'bg-[#5E6AD2]/[0.04]') : ''}`}
              onDragEnter={e => { e.preventDefault(); dragCounter.current++; setIsDragOver(true); }}
              onDragOver={e => e.preventDefault()}
              onDragLeave={() => { dragCounter.current--; if (dragCounter.current === 0) setIsDragOver(false); }}
              onDrop={e => { e.preventDefault(); dragCounter.current = 0; setIsDragOver(false); if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files); }}
            >
              {/* Drag-over overlay */}
              <AnimatePresence>
                {isDragOver && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-2 rounded-xl border-2 border-dashed border-[#5E6AD2]/50 flex items-center justify-center z-20 pointer-events-none bg-[#5E6AD2]/[0.04]">
                    <div className="text-center">
                      <Paperclip className="w-8 h-8 mx-auto mb-2 text-[#5E6AD2]" />
                      <p className={`text-sm font-medium text-[#5E6AD2]`}>Drop files here</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-3">
                {messages.map((msg, i) => (
                  <motion.div key={i}
                    initial={i === messages.length - 1 ? { opacity: 0, y: 6 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-[#5E6AD2] text-white rounded-2xl rounded-br-sm'
                        : dark
                          ? 'bg-white/[0.04] text-[#c7c7c8] border border-white/[0.06] rounded-2xl rounded-bl-sm'
                          : 'bg-[#f4f4f5] text-[#3d3d3f] border border-black/[0.06] rounded-2xl rounded-bl-sm'
                    }`}>
                      {displayContent(msg)}
                    </div>
                  </motion.div>
                ))}

                {/* AI thinking animation */}
                {isLoading && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
                    <div className={`rounded-2xl rounded-bl-sm px-3.5 py-2.5 border ${dark ? 'bg-white/[0.04] border-white/[0.06]' : 'bg-[#f4f4f5] border-black/[0.06]'}`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded-sm flex items-center justify-center ${dark ? 'bg-[#5E6AD2]/20' : 'bg-[#5E6AD2]/10'}`}>
                          <Sparkles className="w-2.5 h-2.5 text-[#5E6AD2]" />
                        </div>
                        <div className="flex items-center gap-[3px]">
                          {[0, 1, 2].map(i => (
                            <motion.div key={i}
                              className={`w-1 h-1 rounded-full ${dark ? 'bg-[#5c5c63]' : 'bg-[#9b9ba0]'}`}
                              animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
                {/* Suggestion chips — first load only */}
                {messages.length === 1 && !isLoading && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-2 gap-2 mt-4">
                    {AI_SUGGESTIONS.map(s => (
                      <button key={s.label} onClick={() => setInput(s.prompt)}
                        className={`text-left px-3 py-3 rounded-lg border transition-all hover:-translate-y-px active:translate-y-0 ${
                          dark ? 'border-white/[0.07] hover:bg-white/[0.03] text-[#c7c7c8]' : 'border-black/[0.07] hover:bg-[#f4f4f5] text-[#3d3d3f]'
                        }`}>
                        <span className="text-base">{s.icon}</span>
                        <p className="mt-1.5 text-xs font-medium leading-tight tracking-[-0.01em]">{s.label}</p>
                        <p className={`mt-0.5 text-[10px] leading-tight line-clamp-2 ${dark ? 'text-[#5c5c63]' : 'text-[#9b9ba0]'}`}>{s.prompt}</p>
                      </button>
                    ))}
                  </motion.div>
                )}

                <div ref={scrollRef} />
              </div>
            </div>

            {/* Input */}
            <div className={`shrink-0 border-t ${headerBdr}`}>
              {/* Attached file chips */}
              <AnimatePresence>
                {attachedFiles.length > 0 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="flex flex-wrap gap-2 px-4 pt-3">
                    {attachedFiles.map(f => (
                      <motion.div key={f.id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border ${dark ? 'bg-white/[0.04] border-white/[0.08] text-[#c7c7c8]' : 'bg-[#f4f4f5] border-black/[0.06] text-[#3d3d3f]'}`}>
                        {f.type === 'image' && f.preview
                          ? <img src={f.preview} className="w-5 h-5 rounded object-cover" alt="" />
                          : <FileText className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                        <span className="max-w-[90px] truncate">{f.file.name}</span>
                        <button onClick={() => setAttachedFiles(prev => prev.filter(a => a.id !== f.id))}
                          className="ml-0.5 hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex gap-2 px-4 py-3">
                {/* Plus / attach button */}
                <div className="relative shrink-0">
                  {showAttachMenu && <div className="fixed inset-0 z-30" onClick={() => setShowAttachMenu(false)} />}
                  <button
                    onClick={e => { e.stopPropagation(); setShowAttachMenu(v => !v); }}
                    className={`p-2 rounded-lg transition-all duration-200 ${showAttachMenu ? 'bg-[#5E6AD2] text-white' : dark ? 'bg-white/[0.04] text-[#5c5c63] hover:bg-white/[0.08] hover:text-[#8b8b8e]' : 'bg-[#f4f4f5] text-[#9b9ba0] hover:bg-[#ececee] hover:text-[#5c5c63]'}`}>
                    <motion.div animate={{ rotate: showAttachMenu ? 45 : 0 }} transition={{ duration: 0.2 }}>
                      <Plus className="w-4 h-4" />
                    </motion.div>
                  </button>

                  <AnimatePresence>
                    {showAttachMenu && (
                      <motion.div initial={{ opacity: 0, scale: 0.9, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 8 }}
                        transition={{ duration: 0.15 }} onClick={e => e.stopPropagation()}
                        className={`absolute bottom-full left-0 mb-2 rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.16)] border overflow-hidden z-40 min-w-[160px] ${dark ? 'bg-[#161618] border-white/[0.08]' : 'bg-white border-black/[0.08]'}`}>
                        <button onClick={() => { fileInputRef.current!.accept = 'image/*'; fileInputRef.current!.click(); setShowAttachMenu(false); }}
                          className={`flex items-center gap-2.5 px-3.5 py-2.5 text-sm w-full text-left transition-colors ${dark ? 'hover:bg-white/[0.04] text-[#c7c7c8]' : 'hover:bg-[#f4f4f5] text-[#3d3d3f]'}`}>
                          <ImageIcon className="w-3.5 h-3.5 text-[#5E6AD2]" /> Upload Image
                        </button>
                        <button onClick={() => { fileInputRef.current!.accept = '.txt,.md,.csv,.json'; fileInputRef.current!.click(); setShowAttachMenu(false); }}
                          className={`flex items-center gap-2.5 px-3.5 py-2.5 text-sm w-full text-left transition-colors border-t ${dark ? 'hover:bg-white/[0.04] text-[#c7c7c8] border-white/[0.05]' : 'hover:bg-[#f4f4f5] text-[#3d3d3f] border-black/[0.05]'}`}>
                          <FileText className="w-3.5 h-3.5 text-[#5E6AD2]" /> Upload File
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <input ref={fileInputRef} type="file" multiple className="hidden"
                    onChange={e => { if (e.target.files?.length) processFiles(e.target.files); e.target.value = ''; }} />
                </div>

                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                  placeholder={receiptHtml ? 'Describe changes...' : 'Describe your receipt...'}
                  disabled={isLoading}
                  className={`flex-1 rounded-xl px-4 py-2.5 text-sm outline-none transition-colors disabled:opacity-40 border ${inputBg}`}
                  autoFocus />
                <button onClick={send} disabled={(!input.trim() && attachedFiles.length === 0) || isLoading}
                  className="p-2.5 bg-[#5E6AD2] text-white rounded-lg hover:bg-[#6B7AE8] transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Preview panel */}
          <div className={`${mobilePanel === 'preview' ? 'flex' : 'hidden'} lg:flex flex-1 flex-col rounded-xl border min-h-0 min-w-0 ${cardBg}`}>
            <div className={`shrink-0 flex items-center justify-between px-4 py-3 border-b ${headerBdr}`}>
              <div className="flex items-center gap-2">
                <Eye className={`w-3.5 h-3.5 ${dark ? 'text-[#5c5c63]' : 'text-[#9b9ba0]'}`} />
                <h2 className={`text-sm font-semibold tracking-[-0.01em] ${dark ? 'text-[#ededef]' : 'text-[#0d0d0e]'}`}>Preview</h2>
              </div>
              <div className="flex items-center gap-2">
                {receiptHtml && (
                  <button onClick={downloadPdf} disabled={isDownloading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#5E6AD2] text-white rounded-md text-xs font-medium hover:bg-[#6B7AE8] transition-colors disabled:opacity-50">
                    {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    {isDownloading ? 'Generating...' : 'Download PDF'}
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {isLoading && pendingReceiptGen ? (
                /* ── "Building receipt" animation ── */
                <div className="flex flex-col items-center justify-center h-full p-6">
                  <div className="relative">
                    {/* Ambient glow */}
                    <motion.div
                      className={`absolute -inset-6 rounded-3xl blur-2xl ${dark ? 'bg-[#5E6AD2]/10' : 'bg-[#5E6AD2]/[0.08]'}`}
                      animate={{ opacity: [0.3, 0.7, 0.3], scale: [0.95, 1.05, 0.95] }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    />

                    {/* Receipt construction card */}
                    <motion.div
                      className={`relative w-52 rounded-2xl p-5 overflow-hidden shadow-2xl ${
                        dark
                          ? 'bg-[#111113] border border-[#5E6AD2]/20'
                          : 'bg-white border border-black/[0.06]'
                      }`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                    >
                      {/* Scanning beam */}
                      <motion.div
                        className="absolute left-0 right-0 h-10 bg-gradient-to-b from-[#5E6AD2]/15 via-[#5E6AD2]/5 to-transparent pointer-events-none z-10"
                        animate={{ top: ['-40px', 'calc(100% + 40px)'] }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      />

                      <div className="space-y-3">
                        {/* Logo placeholder */}
                        <div className="flex justify-center">
                          <motion.div
                            className={`w-12 h-12 rounded-lg ${dark ? 'bg-[#5E6AD2]/20' : 'bg-[#5E6AD2]/10'}`}
                            animate={{ opacity: [0.3, 0.8, 0.3] }}
                            transition={{ duration: 2, repeat: Infinity }}
                          />
                        </div>
                        {/* Business name */}
                        <motion.div className={`h-3 w-3/5 mx-auto rounded ${dark ? 'bg-[#5E6AD2]/30' : 'bg-[#5E6AD2]/20'}`}
                          animate={{ opacity: [0.2, 0.7, 0.2] }} transition={{ duration: 2, repeat: Infinity, delay: 0.1 }} />
                        {/* Address */}
                        <motion.div className={`h-1.5 w-2/5 mx-auto rounded ${dark ? 'bg-white/10' : 'bg-gray-200'}`}
                          animate={{ opacity: [0.2, 0.5, 0.2] }} transition={{ duration: 2, repeat: Infinity, delay: 0.2 }} />

                        {/* Divider */}
                        <motion.div className={`h-px ${dark ? 'bg-white/10' : 'bg-gray-200'}`}
                          initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                          transition={{ duration: 0.8, delay: 0.3 }} />

                        {/* Item rows */}
                        {[0.85, 0.7, 0.9].map((w, i) => (
                          <div key={i} className="flex justify-between items-center">
                            <motion.div
                              className={`h-2 rounded ${dark ? 'bg-white/10' : 'bg-gray-200'}`}
                              style={{ width: `${w * 60}%` }}
                              animate={{ opacity: [0.15, 0.6, 0.15] }}
                              transition={{ duration: 2, repeat: Infinity, delay: 0.4 + i * 0.15 }}
                            />
                            <motion.div
                              className={`h-2 w-8 rounded ${dark ? 'bg-white/10' : 'bg-gray-200'}`}
                              animate={{ opacity: [0.15, 0.6, 0.15] }}
                              transition={{ duration: 2, repeat: Infinity, delay: 0.5 + i * 0.15 }}
                            />
                          </div>
                        ))}

                        {/* Divider */}
                        <motion.div className={`h-px ${dark ? 'bg-white/10' : 'bg-gray-200'}`}
                          initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                          transition={{ duration: 0.8, delay: 1 }} />

                        {/* Total */}
                        <div className="flex justify-between items-center pt-1">
                          <motion.div className={`h-2 w-10 rounded ${dark ? 'bg-white/10' : 'bg-gray-200'}`}
                            animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 2, repeat: Infinity, delay: 1.2 }} />
                          <motion.div className={`h-4 w-16 rounded ${dark ? 'bg-[#5E6AD2]/30' : 'bg-[#5E6AD2]/20'}`}
                            animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity, delay: 1.3 }} />
                        </div>
                      </div>

                      {/* Typing cursor */}
                      <motion.div
                        className="mt-3 w-1.5 h-4 rounded-sm bg-[#5E6AD2]"
                        animate={{ opacity: [1, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity }}
                      />
                    </motion.div>
                  </div>

                  {/* Status text */}
                  <div className="mt-8 text-center space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 text-[#5E6AD2] animate-spin" />
                      <AnimatePresence mode="wait">
                        <motion.span
                          key={loadingStep}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          className={`text-sm font-medium ${dark ? 'text-gray-300' : 'text-gray-600'}`}
                        >
                          {AI_LOADING_MSGS[loadingStep]}
                        </motion.span>
                      </AnimatePresence>
                    </div>
                    <p className={`text-xs ${dark ? 'text-gray-600' : 'text-gray-400'}`}>Designing your receipt...</p>
                  </div>
                </div>

              ) : receiptHtml ? (
                <ScaledIframePreview html={receiptHtml} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-5 p-8">
                  <motion.div
                    className={`w-48 rounded-xl p-5 space-y-3 ${dark ? 'bg-white/5 border border-white/10' : 'bg-gray-50 border border-gray-100'}`}
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
                    <div className="flex justify-center">
                      <motion.div className={`w-10 h-10 rounded-lg ${dark ? 'bg-[#5E6AD2]/20' : 'bg-[#5E6AD2]/10'}`}
                        animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 2, repeat: Infinity }} />
                    </div>
                    {[0.7, 1, 0.6, 0.9, 0.5].map((w, i) => (
                      <motion.div key={i} className={`h-2 rounded-full ${dark ? 'bg-white/8' : 'bg-gray-200'}`}
                        style={{ width: `${w * 100}%` }} animate={{ opacity: [0.3, 0.7, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }} />
                    ))}
                    <div className={`h-px ${dark ? 'bg-white/10' : 'bg-gray-200'}`} />
                    <div className="flex justify-between items-center">
                      <motion.div className={`h-2 w-10 rounded-full ${dark ? 'bg-white/8' : 'bg-gray-200'}`} animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 2, repeat: Infinity, delay: 0.5 }} />
                      <motion.div className={`h-3 w-14 rounded-full ${dark ? 'bg-[#5E6AD2]/30' : 'bg-[#5E6AD2]/15'}`} animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 2, repeat: Infinity, delay: 0.7 }} />
                    </div>
                  </motion.div>
                  <div className="text-center space-y-1">
                    <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 3, repeat: Infinity }}>
                      <Sparkles className="w-5 h-5 mx-auto mb-1 text-[#5E6AD2]" />
                    </motion.div>
                    <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-400'}`}>Your AI-generated receipt</p>
                    <p className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-300'}`}>will appear here</p>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}

// ─── Shared helper components ─────────────────────────────────────────────────

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-500 uppercase">{label}</label>
      {children}
    </div>
  );
}

export function Card({
  icon, title, action, children,
}: {
  icon: React.ReactNode; title: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl p-6 shadow-sm border border-black/5 dark:border-white/10 transition-colors duration-300">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{title}</h2>
        </div>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white dark:bg-[#1e1e1e] dark:text-gray-100 rounded-2xl p-6 w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-4">{title}</h3>
        {children}
      </motion.div>
    </motion.div>
  );
}
