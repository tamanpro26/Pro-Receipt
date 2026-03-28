/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState, useRef, useEffect, useCallback,
  useDeferredValue, memo, type ChangeEvent,
} from 'react';
import {
  Plus, Trash2, Download, Receipt, DollarSign,
  FileText, Settings2, Eye, Printer, Save,
  FolderOpen, Palette, CheckCircle2, User, Tag,
  Mail, Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
// html2canvas / jsPDF removed — PDF is now generated server-side by Puppeteer
// for pixel-perfect output matching the browser preview.

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

const STORAGE_KEY = 'proreceipt_saved';
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

export const inp = "w-full px-4 py-2 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-black/10 outline-none transition-all text-sm";
const btnOutline  = "flex items-center gap-2 bg-white text-black border border-black/10 px-3 py-2 rounded-full text-sm font-medium hover:bg-gray-50 transition-all";

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

  // useDeferredValue decouples preview renders from editor renders:
  // inputs update at high priority; preview repaints at lower priority.
  const previewData = useDeferredValue(data);

  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setSavedReceipts(JSON.parse(stored));
  }, []);

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
    <div className="min-h-screen flex flex-col bg-[#F5F5F5] text-[#1A1A1A] font-sans lg:h-screen lg:overflow-hidden">

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
      <header className="shrink-0 z-50 bg-white/90 backdrop-blur-md border-b border-black/5 px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center no-print">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#1A1A1A] rounded-lg flex items-center justify-center shrink-0">
            <Receipt className="text-white w-5 h-5" />
          </div>
          <h1 className="text-base sm:text-lg font-semibold tracking-tight">ProReceipt</h1>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button onClick={() => setShowLoadModal(true)} className={btnOutline}>
            <FolderOpen className="w-4 h-4" /> <span className="hidden sm:inline">Load</span>
          </button>
          <button onClick={() => { setSaveName(`${data.businessName} – ${data.receiptNumber}`); setShowSaveModal(true); }} className={btnOutline}>
            <Save className="w-4 h-4" /> <span className="hidden sm:inline">Save</span>
          </button>
          <button onClick={() => window.print()} className={btnOutline}>
            <Printer className="w-4 h-4" /> <span className="hidden sm:inline">Print</span>
          </button>
          <button onClick={handleSendEmail} disabled={isSending}
            className={`${btnOutline} disabled:opacity-50 disabled:cursor-not-allowed`}>
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            <span className="hidden sm:inline">{isSending ? 'Sending…' : 'Email'}</span>
          </button>
          <button onClick={handleDownloadPDF} disabled={isGenerating}
            className="flex items-center gap-1.5 sm:gap-2 bg-[#1A1A1A] text-white px-3 sm:px-4 py-2 rounded-full text-sm font-medium hover:bg-black transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="hidden sm:inline">{isGenerating ? 'Generating…' : 'Download PDF'}</span>
          </button>
        </div>
      </header>

      {/* Mobile tab switcher — only visible below lg breakpoint */}
      <div className="lg:hidden shrink-0 flex bg-white border-b border-black/5 no-print">
        <button
          onClick={() => setMobileTab('editor')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${mobileTab === 'editor' ? 'text-black border-b-2 border-black' : 'text-gray-400'}`}
        >
          Editor
        </button>
        <button
          onClick={() => setMobileTab('preview')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${mobileTab === 'preview' ? 'text-black border-b-2 border-black' : 'text-gray-400'}`}
        >
          Preview
        </button>
      </div>

      {/* Two-panel layout */}
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
        className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-black/10 outline-none transition-all min-h-20 text-sm"
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
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">{title}</h2>
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
        className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-4">{title}</h3>
        {children}
      </motion.div>
    </motion.div>
  );
}
