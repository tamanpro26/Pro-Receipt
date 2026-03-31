import express    from 'express';
import cors       from 'cors';
import nodemailer from 'nodemailer';
import Database   from 'better-sqlite3';

import { config } from 'dotenv';
import path       from 'path';
import fs         from 'fs';
import { fileURLToPath } from 'url';
import crypto     from 'crypto';

config({ path: '.env' });

// Clerk Express middleware needs CLERK_PUBLISHABLE_KEY (no VITE_ prefix).
// Map it automatically if only the VITE_ variant was provided.
if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY) {
  process.env.CLERK_PUBLISHABLE_KEY = process.env.VITE_CLERK_PUBLISHABLE_KEY;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');

const app = express();

// In production the frontend is served from the same origin, so CORS is only
// needed in local dev (Vite runs on :3000, server on :3001).
const isDev = process.env.NODE_ENV !== 'production';
app.use(cors({
  origin: isDev
    ? ['http://localhost:3000', 'http://127.0.0.1:3000']
    : false,   // same-origin in prod → no CORS header needed
}));

app.use(express.json({ limit: '5mb' }));

// ─── Clerk auth (optional) ──────────────────────────────────────────────────

let clerkEnabled = false;
if (process.env.CLERK_SECRET_KEY) {
  try {
    const { clerkMiddleware } = await import('@clerk/express');
    app.use(clerkMiddleware());
    clerkEnabled = true;
    console.log('[clerk] Auth middleware enabled');
  } catch (err: any) {
    console.warn('[clerk] Failed to load @clerk/express:', err.message);
  }
}

async function getUserId(req: express.Request): Promise<string | null> {
  if (!clerkEnabled) return null;
  try {
    const { getAuth } = await import('@clerk/express');
    const { userId } = getAuth(req);
    return userId;
  } catch { return null; }
}

// ─── Database (SQLite) ──────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'proreceipt.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT 'New Chat',
    messages    TEXT NOT NULL DEFAULT '[]',
    receipt_html TEXT DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_chats_user ON chats(user_id);
`);

// ─── Email validation ─────────────────────────────────────────────────────────

const EMAIL_RE  = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
const validEmail = (s: string) => EMAIL_RE.test(s.trim());

// ─── Theme map (mirrors the frontend THEMES constant) ─────────────────────────

const THEME_MAP: Record<string, { accent: string; headerBg: string; headerText: string }> = {
  classic: { accent: '#1A1A1A', headerBg: '#ffffff', headerText: '#1A1A1A' },
  indigo:  { accent: '#4F46E5', headerBg: '#EEF2FF', headerText: '#3730A3' },
  bold:    { accent: '#0F172A', headerBg: '#0F172A', headerText: '#ffffff' },
  forest:  { accent: '#166534', headerBg: '#F0FDF4', headerText: '#14532D' },
  sunset:  { accent: '#C2410C', headerBg: '#FFF7ED', headerText: '#9A3412' },
  ocean:   { accent: '#0E7490', headerBg: '#ECFEFF', headerText: '#155E75' },
  rose:    { accent: '#BE185D', headerBg: '#FFF1F2', headerText: '#9F1239' },
  slate:   { accent: '#475569', headerBg: '#F8FAFC', headerText: '#334155' },
};

// ─── Browser launcher ─────────────────────────────────────────────────────────
// Dev:  use the Chromium bundled with `puppeteer` (works on Windows/Mac/Linux).
// Prod: use @sparticuz/chromium + puppeteer-core (works on Render/Lambda where
//       a full Chromium install is not available).

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--font-render-hinting=none',
];

async function launchBrowser() {
  if (isDev) {
    // Regular puppeteer ships its own Chromium — no extra setup needed locally
    const puppeteer = (await import('puppeteer')).default;
    return puppeteer.launch({ headless: true, args: BROWSER_ARGS });
  }

  // Production / serverless: use the stripped-down Sparticuz Chromium build
  const chromium      = (await import('@sparticuz/chromium')).default;
  const puppeteerCore = (await import('puppeteer-core')).default;
  return puppeteerCore.launch({
    headless:       true,
    executablePath: await chromium.executablePath(),
    args:           [...chromium.args, ...BROWSER_ARGS],
  });
}

// ─── POST /api/generate-pdf ───────────────────────────────────────────────────
// Uses headless Chrome (Puppeteer) so the PDF is rendered by the same engine
// as the browser preview — pixel-perfect, correct fonts, correct colours.

// Paper size → viewport width in px at 96 dpi
const PAPER_VIEWPORTS: Record<string, { width: number; height: number }> = {
  A4:     { width: 794,  height: 1123 },
  Letter: { width: 816,  height: 1056 },
  A5:     { width: 559,  height: 794  },
  Legal:  { width: 816,  height: 1344 },
};

app.post('/api/generate-pdf', async (req, res) => {
  const { receiptData: d, paperSize = 'A4', html: rawHtml } = req.body ?? {};

  // Support two modes: raw HTML (AI Studio) or structured receipt data (Manual Editor)
  if (!d && !rawHtml) { res.status(400).json({ error: 'Receipt data or HTML is required.' }); return; }

  const viewport = PAPER_VIEWPORTS[paperSize] ?? PAPER_VIEWPORTS.A4;
  const htmlContent = rawHtml || buildReceiptHtmlForPdf(d, paperSize);
  const filename = rawHtml ? `receipt-ai-${Date.now()}.pdf` : `receipt-${d.receiptNumber}.pdf`;

  let browser;
  try {
    browser = await launchBrowser();

    const page = await browser.newPage();

    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 2 });

    await page.setContent(htmlContent, { waitUntil: 'load', timeout: 15_000 });
    await page.evaluateHandle('document.fonts.ready');

    const pdf = await page.pdf({
      format: paperSize as any,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(pdf));

  } catch (err: any) {
    console.error('[pdf error]', err.message);
    res.status(500).json({ error: `PDF generation failed: ${err.message}` });
  } finally {
    await browser?.close();
  }
});

// ─── POST /api/send-receipt ───────────────────────────────────────────────────

app.post('/api/send-receipt', async (req, res) => {
  const { to, receiptData } = req.body ?? {};

  if (!to || typeof to !== 'string' || !validEmail(to)) {
    res.status(400).json({ error: 'Invalid email address.' }); return;
  }
  if (!receiptData) {
    res.status(400).json({ error: 'Receipt data is required.' }); return;
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    res.status(503).json({ error: 'Email service not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS in .env.local' });
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT ?? '587'),
    secure: SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  try {
    await transporter.sendMail({
      from: SMTP_FROM ?? SMTP_USER,
      to: to.trim(),
      subject: `Receipt ${receiptData.receiptNumber} from ${receiptData.businessName}`,
      html: buildEmailHtml(receiptData),
    });
    res.json({ success: true, message: `Receipt sent to ${to.trim()}` });
  } catch (err: any) {
    console.error('[email error]', err.message);
    res.status(500).json({ error: `Failed to send email: ${err.message}` });
  }
});

// ─── POST /api/ai-chat ──────────────────────────────────────────────────────
// Multi-turn conversation with GPT-4o mini to design HTML receipts.
// The OPENAI_API_KEY is read from process.env at request time — never baked
// into the frontend bundle.

function getAiSystemPrompt(): string {
  const today = new Date().toISOString().split('T')[0];
  return `You are ProReceipt AI Studio, a friendly and creative receipt designer assistant.

CONVERSATION RULES:
- You are a conversational assistant FIRST. Respond naturally to greetings, questions, and casual messages.
- Only generate a receipt when the user clearly intends to create or modify one (e.g., mentions a business, items, prices, or explicitly asks for a receipt).
- If the user says something like "hello", "how are you", "what can you do", or anything NOT related to receipt creation, just reply conversationally — do NOT generate any HTML.
- When unsure if the user wants a receipt, ask a clarifying question instead of generating one.

WHEN TO GENERATE A RECEIPT:
- The user mentions a business name, items/services, prices, or says "create a receipt", "make me a receipt", etc.
- The user provides enough context that clearly implies they want a receipt (e.g., "I sold 3 laptops to John for $500 each").
- The user asks to modify an existing receipt (only if one was already generated in the conversation).
- If the user gives partial info (e.g., just a business name), you may ask 1-2 quick questions OR generate with sensible defaults.

RULES FOR HTML OUTPUT (only when generating a receipt):
- Output a COMPLETE HTML document (<!DOCTYPE html> to </html>)
- ALWAYS wrap the HTML in a \`\`\`html code block
- Include ALL styles inline or in a <style> tag — NO external CSS files
- You may use Google Fonts via <link> tags
- Design must be CREATIVE and UNIQUE — vary layouts, color schemes, typography, and decorative elements
- The receipt should look like a real, beautifully designed document
- Make it print-friendly (max-width ~800px, centered)
- Include all receipt details: business info, items table, totals, tax, payment info, dates
- Calculate totals, tax, and discounts correctly
- Fill in missing details with realistic examples when generating
- Today's date: ${today}

DESIGN GUIDELINES — CRITICAL, follow these strictly:
- NEVER produce a plain white page with a basic table. Every receipt must feel professionally designed.
- Give each receipt a STRONG visual identity: think branded hotel bill, trendy café receipt, luxury invoice, retro shop ticket, modern SaaS billing page, etc.
- Layout: go beyond a simple top-to-bottom list. Use header banners, two-column sections, sidebar accent strips, colored footers, full-bleed background sections, or decorative dividers.
- Color: pick a bold, deliberate palette — deep jewel tones, warm earth tones, cool monochromes, vibrant neons on dark, pastel with strong accent. Never default to plain black on white.
- Typography: use Google Fonts. Mix a display/serif font for the business name or total with a clean sans-serif for body text. Use large, dramatic numbers for the grand total.
- Details: watermark-style logo placeholder, CSS-drawn stamp or seal, subtle background texture or pattern, colored row stripes in the items table.
- CSS techniques: gradients (linear/radial), box-shadow, border-radius, ::before/::after pseudo-elements for decorative shapes, mix of padding/spacing for breathing room.

IMPORTANT:
- Do NOT include a \`\`\`html code block unless you are actually generating/updating a receipt
- For follow-up edits, output the COMPLETE updated HTML receipt
- Be concise and friendly in all responses`;
}

app.post('/api/ai-chat', async (req, res) => {
  const { messages } = req.body ?? {};

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    res.status(503).json({ error: 'AI not configured. Set OPENAI_API_KEY in your environment variables.' });
    return;
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'Messages are required.' });
    return;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        temperature: 1.2,
        messages: [
          { role: 'system', content: getAiSystemPrompt() },
          ...messages.map((m: { role: string; content: string }) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
          })),
        ],
      }),
    });

    const data = await response.json() as any;
    if (!response.ok) throw new Error(data.error?.message ?? `OpenAI error ${response.status}`);

    const reply: string = data.choices?.[0]?.message?.content ?? '';
    res.json({ reply });
  } catch (err: any) {
    console.error('[ai-chat error]', err.message);
    res.status(500).json({ error: `AI generation failed: ${err.message}` });
  }
});

// ─── POST /api/ai-classify ───────────────────────────────────────────────────
// Ultra-fast intent check: is the user's message about receipt work?
// Returns { isReceiptRelated: boolean }. Runs in parallel with /ai-chat so
// the frontend knows whether to show the "building" animation in preview.

app.post('/api/ai-classify', async (req, res) => {
  const { message } = req.body ?? {};
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY || !message) { res.json({ isReceiptRelated: false }); return; }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 3,
        messages: [
          { role: 'system', content: 'Reply ONLY "yes" or "no". Is this message asking to create, modify, or discuss a receipt, invoice, or bill? (Includes requests about layout, colors, items, prices, business details, formatting, etc.)' },
          { role: 'user', content: message },
        ],
      }),
    });
    const data = await response.json() as any;
    const reply = (data.choices?.[0]?.message?.content ?? '').trim().toLowerCase();
    res.json({ isReceiptRelated: reply.startsWith('yes') });
  } catch {
    res.json({ isReceiptRelated: false });
  }
});

// ─── Chat CRUD ──────────────────────────────────────────────────────────────

// GET /api/chats — list all chats for the authenticated user (summary only)
app.get('/api/chats', async (req, res) => {
  const userId = await getUserId(req);
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const rows = db.prepare(
    'SELECT id, title, updated_at FROM chats WHERE user_id = ? ORDER BY updated_at DESC'
  ).all(userId);
  res.json(rows);
});

// GET /api/chats/:id — full chat data
app.get('/api/chats/:id', async (req, res) => {
  const userId = await getUserId(req);
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const row = db.prepare(
    'SELECT * FROM chats WHERE id = ? AND user_id = ?'
  ).get(req.params.id, userId) as any;

  if (!row) { res.status(404).json({ error: 'Chat not found' }); return; }
  res.json({ ...row, messages: JSON.parse(row.messages) });
});

// POST /api/chats — create a new chat
app.post('/api/chats', async (req, res) => {
  const userId = await getUserId(req);
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const id = req.body?.id || crypto.randomUUID();
  const { title = 'New Chat', messages = [], receipt_html = '' } = req.body ?? {};

  db.prepare(
    'INSERT INTO chats (id, user_id, title, messages, receipt_html) VALUES (?, ?, ?, ?, ?)'
  ).run(id, userId, title, JSON.stringify(messages), receipt_html);

  res.json({ id, title, messages, receipt_html });
});

// PUT /api/chats/:id — update an existing chat
app.put('/api/chats/:id', async (req, res) => {
  const userId = await getUserId(req);
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const existing = db.prepare(
    'SELECT id FROM chats WHERE id = ? AND user_id = ?'
  ).get(req.params.id, userId);
  if (!existing) { res.status(404).json({ error: 'Chat not found' }); return; }

  const { title, messages, receipt_html } = req.body ?? {};
  const sets: string[] = [];
  const vals: any[] = [];

  if (title !== undefined)        { sets.push('title = ?');        vals.push(title); }
  if (messages !== undefined)     { sets.push('messages = ?');     vals.push(JSON.stringify(messages)); }
  if (receipt_html !== undefined) { sets.push('receipt_html = ?'); vals.push(receipt_html); }

  if (sets.length === 0) { res.json({ ok: true }); return; }

  sets.push("updated_at = datetime('now')");
  vals.push(req.params.id, userId);

  db.prepare(`UPDATE chats SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
  res.json({ ok: true });
});

// DELETE /api/chats/:id
app.delete('/api/chats/:id', async (req, res) => {
  const userId = await getUserId(req);
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  db.prepare('DELETE FROM chats WHERE id = ? AND user_id = ?').run(req.params.id, userId);
  res.json({ ok: true });
});

// ─── PDF HTML builder ─────────────────────────────────────────────────────────
// Generates a self-contained A4 HTML document rendered by Puppeteer.
// Matches the React preview exactly: same font, same theme colours, same layout.

function buildReceiptHtmlForPdf(d: any, paperSize = 'A4'): string {
  const theme = d.theme === 'custom'
    ? (d.customTheme as { accent: string; headerBg: string; headerText: string })
    : (THEME_MAP[d.theme] ?? THEME_MAP.classic);

  const fmt       = (n: number) => `${d.currency}${Number(n).toFixed(2)}`;
  const lineTotal = (i: any)    => i.price * i.quantity * (1 - (i.discount ?? 0) / 100);
  const sub       = (d.items as any[]).reduce((s: number, i: any) => s + lineTotal(i), 0);
  const discAmt   = (sub * (d.globalDiscount ?? 0)) / 100;
  const taxable   = sub - discAmt;
  const taxAmt    = (taxable * (d.taxRate ?? 0)) / 100;
  const total     = taxable + taxAmt;

  const subText  = theme.headerText === '#ffffff' ? '#94a3b8' : '#888888';
  const bodyText = theme.headerText === '#ffffff' ? '#cbd5e1' : '#666666';

  const statusPalette: Record<string, [string, string]> = {
    paid:    ['#d1fae5', '#065f46'],
    unpaid:  ['#fee2e2', '#991b1b'],
    partial: ['#fef3c7', '#92400e'],
  };
  const [sBg, sFg] = statusPalette[d.paymentStatus] ?? statusPalette.unpaid;

  const itemRows = (d.items as any[]).map(i => `
    <tr>
      <td class="td">${i.description || 'Untitled Item'}${i.discount > 0
        ? `<span class="disc-badge">${i.discount}% off</span>` : ''
      }</td>
      <td class="td" style="text-align:center">${i.quantity}</td>
      <td class="td" style="text-align:right">${fmt(i.price)}</td>
      <td class="td" style="text-align:right;font-weight:700">${fmt(lineTotal(i))}</td>
    </tr>`).join('');

  const discRow = d.globalDiscount > 0 ? `
    <tr>
      <td colspan="3" class="sum-label" style="color:#059669">Discount (${d.globalDiscount}%)</td>
      <td class="sum-val"  style="color:#059669">−${fmt(discAmt)}</td>
    </tr>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Receipt ${d.receiptNumber}</title>

<!-- JetBrains Mono — same font as the browser preview -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">

<style>
/* ── Page setup ─────────────────────────────────────────────────── */
@page {
  size: ${paperSize};
  margin: 12mm 15mm;   /* consistent safe margin on all paper sizes */
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: #1a1a1a;
  background: #fff;
  width: 100%;          /* fluid — adapts to whatever paper size is used */
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ── Receipt shell ──────────────────────────────────────────────── */
.receipt {
  width: 100%;          /* fills the printable area of any paper size */
  display: flex;
  flex-direction: column;
  position: relative;
  background: #fff;
}

.accent-bar { height: 6px; background: ${theme.accent}; }

/* ── Business header ────────────────────────────────────────────── */
.header {
  background: ${theme.headerBg};
  text-align: center;
  padding: 44px 40px 24px;
}
.biz-name {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: ${theme.headerText};
  margin-bottom: 5px;
}
.biz-address { font-size: 11px; color: ${bodyText}; margin-bottom: 3px; }
.biz-contacts { font-size: 11px; color: ${subText}; }

/* ── Body ───────────────────────────────────────────────────────── */
.body { padding: 20px 40px 36px; flex: 1; }

.status-row { text-align: right; margin-bottom: 14px; }
.badge {
  display: inline-block;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 2px;
  padding: 3px 12px;
  border-radius: 999px;
  background: ${sBg};
  color: ${sFg};
}

/* ── Info grid ──────────────────────────────────────────────────── */
.info-grid {
  display: flex;
  justify-content: space-between;
  border-top: 1px solid ${theme.accent};
  border-bottom: 1px solid ${theme.accent};
  padding: 14px 0;
  margin-bottom: 22px;
}
.info-label { font-size: 9px; text-transform: uppercase; font-weight: 700; color: #999; margin-bottom: 4px; }
.info-name  { font-size: 13px; font-weight: 700; }
.info-sub   { font-size: 11px; color: #666; margin-top: 2px; }
.info-right { text-align: right; }

/* ── Items table ────────────────────────────────────────────────── */
.items { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
.items th {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 700;
  padding: 7px 6px 9px;
  border-bottom: 2px solid ${theme.accent};
}
.td {
  padding: 10px 6px;
  border-bottom: 1px solid #eeeeee;
  vertical-align: top;
}
.disc-badge {
  margin-left: 6px;
  font-size: 9px;
  background: #d1fae5;
  color: #065f46;
  padding: 1px 5px;
  border-radius: 4px;
}

/* ── Summary ────────────────────────────────────────────────────── */
.summary { width: 220px; margin-left: auto; border-collapse: collapse; }
.sum-label { text-align: right; padding: 4px 6px; font-size: 10px; text-transform: uppercase; color: #999; }
.sum-val   { text-align: right; padding: 4px 6px; }
.sum-total td {
  padding-top: 10px;
  font-weight: 700;
  border-top: 1px solid ${theme.accent};
}
.sum-total .sum-label { font-size: 12px; color: #1a1a1a; }
.sum-total .sum-val   { font-size: 18px; }

/* ── Notes ──────────────────────────────────────────────────────── */
.notes { background: #f9f9f9; border-radius: 6px; padding: 12px 14px; margin-top: 18px; }
.notes-label { font-size: 9px; text-transform: uppercase; font-weight: 700; color: #999; margin-bottom: 4px; }
.notes-text  { font-size: 11px; color: #666; font-style: italic; }

/* ── Footer ─────────────────────────────────────────────────────── */
.footer { text-align: center; margin-top: 24px; padding-top: 18px; border-top: 1px solid #eee; }
.footer-main { font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: #333; }
.footer-sub  { font-size: 8px;  letter-spacing: 4px; text-transform: uppercase; color: #ccc; margin-top: 6px; }
</style>
</head>
<body>
<div class="receipt">

  <div class="accent-bar"></div>

  <div class="header">
    <div class="biz-name">${d.businessName}</div>
    <div class="biz-address">${d.businessAddress}</div>
    <div class="biz-contacts">${[d.businessPhone, d.businessEmail, d.businessWebsite].filter(Boolean).join(' · ')}</div>
  </div>

  <div class="body">

    <div class="status-row"><span class="badge">${d.paymentStatus}</span></div>

    <div class="info-grid">
      <div>
        <div class="info-label">Billed To</div>
        <div class="info-name">${d.customerName}</div>
        ${d.customerEmail ? `<div class="info-sub">${d.customerEmail}</div>` : ''}
        ${d.customerPhone ? `<div class="info-sub">${d.customerPhone}</div>` : ''}
      </div>
      <div class="info-right">
        <div class="info-label">Details</div>
        <div class="info-sub">No: <strong>${d.receiptNumber}</strong></div>
        <div class="info-sub">Date: ${d.date}</div>
        ${d.dueDate ? `<div class="info-sub">Due: ${d.dueDate}</div>` : ''}
        <div class="info-sub">Via: ${d.paymentMethod}</div>
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th style="text-align:left">Description</th>
          <th style="text-align:center">Qty</th>
          <th style="text-align:right">Price</th>
          <th style="text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <table class="summary">
      <tr>
        <td class="sum-label">Subtotal</td>
        <td class="sum-val">${fmt(sub)}</td>
      </tr>
      ${discRow}
      <tr>
        <td class="sum-label">Tax (${d.taxRate}%)</td>
        <td class="sum-val">${fmt(taxAmt)}</td>
      </tr>
      <tr class="sum-total">
        <td class="sum-label">Total</td>
        <td class="sum-val">${fmt(total)}</td>
      </tr>
    </table>

    ${d.notes ? `
    <div class="notes">
      <div class="notes-label">Notes</div>
      <div class="notes-text">${d.notes}</div>
    </div>` : ''}

    <div class="footer">
      <div class="footer-main">Thank you for your business</div>
      <div class="footer-sub">Generated via ProReceipt</div>
    </div>

  </div><!-- /body -->

  <div class="accent-bar"></div>

</div><!-- /receipt -->
</body>
</html>`;
}

// ─── Email HTML builder (unchanged, email-client-safe inline styles) ──────────

function buildEmailHtml(d: any): string {
  const fmt       = (n: number) => `${d.currency}${Number(n).toFixed(2)}`;
  const lineTotal = (i: any)    => i.price * i.quantity * (1 - (i.discount ?? 0) / 100);
  const sub       = (d.items as any[]).reduce((s: number, i: any) => s + lineTotal(i), 0);
  const discAmt   = (sub * (d.globalDiscount ?? 0)) / 100;
  const taxable   = sub - discAmt;
  const taxAmt    = (taxable * (d.taxRate ?? 0)) / 100;
  const total     = taxable + taxAmt;

  const itemRows = (d.items as any[]).map(i => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;">
        ${i.description || 'Item'}
        ${i.discount > 0 ? `<span style="margin-left:6px;font-size:10px;background:#d1fae5;color:#065f46;padding:1px 6px;border-radius:999px">${i.discount}% off</span>` : ''}
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right">${fmt(i.price)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:bold">${fmt(lineTotal(i))}</td>
    </tr>`).join('');

  const discRow = d.globalDiscount > 0 ? `
    <tr>
      <td colspan="3" style="text-align:right;padding:6px 8px;color:#059669;font-size:12px">Discount (${d.globalDiscount}%)</td>
      <td style="text-align:right;padding:6px 8px;color:#059669;font-size:12px">-${fmt(discAmt)}</td>
    </tr>` : '';

  const sBg = { paid:'#d1fae5', unpaid:'#fee2e2', partial:'#fef3c7' }[d.paymentStatus as string] ?? '#f3f4f6';
  const sFg = { paid:'#065f46', unpaid:'#991b1b', partial:'#92400e' }[d.paymentStatus as string] ?? '#374151';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Receipt ${d.receiptNumber}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:monospace,Courier,serif">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.09)">
  <div style="background:#1a1a1a;color:#fff;padding:36px 32px;text-align:center">
    <h1 style="margin:0 0 6px;font-size:22px;letter-spacing:4px;text-transform:uppercase">${d.businessName}</h1>
    <p style="margin:0;font-size:12px;color:#aaa">${d.businessAddress}</p>
    <p style="margin:6px 0 0;font-size:12px;color:#aaa">${[d.businessPhone, d.businessEmail, d.businessWebsite].filter(Boolean).join(' · ')}</p>
    <div style="margin-top:14px">
      <span style="background:${sBg};color:${sFg};font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:2px;padding:3px 12px;border-radius:999px">${d.paymentStatus}</span>
    </div>
  </div>
  <div style="padding:28px 32px">
    <table style="width:100%;border-top:1px solid #000;border-bottom:1px solid #000;padding:16px 0;margin-bottom:24px;border-collapse:collapse">
      <tr>
        <td style="padding:16px 0;vertical-align:top;width:50%">
          <div style="font-size:10px;color:#999;text-transform:uppercase;font-weight:bold;margin-bottom:4px">Billed To</div>
          <div style="font-weight:bold;font-size:14px">${d.customerName}</div>
          ${d.customerEmail ? `<div style="font-size:12px;color:#666">${d.customerEmail}</div>` : ''}
          ${d.customerPhone ? `<div style="font-size:12px;color:#666">${d.customerPhone}</div>` : ''}
        </td>
        <td style="padding:16px 0;vertical-align:top;text-align:right;width:50%">
          <div style="font-size:10px;color:#999;text-transform:uppercase;font-weight:bold;margin-bottom:4px">Details</div>
          <div style="font-size:12px">No: <strong>${d.receiptNumber}</strong></div>
          <div style="font-size:12px">Date: ${d.date}</div>
          ${d.dueDate ? `<div style="font-size:12px">Due: ${d.dueDate}</div>` : ''}
          <div style="font-size:12px">Via: ${d.paymentMethod}</div>
        </td>
      </tr>
    </table>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="border-bottom:2px solid #000">
          <th style="text-align:left;padding:8px;text-transform:uppercase;font-size:10px;letter-spacing:1px">Description</th>
          <th style="text-align:center;padding:8px;text-transform:uppercase;font-size:10px;letter-spacing:1px">Qty</th>
          <th style="text-align:right;padding:8px;text-transform:uppercase;font-size:10px;letter-spacing:1px">Price</th>
          <th style="text-align:right;padding:8px;text-transform:uppercase;font-size:10px;letter-spacing:1px">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
      <tfoot>
        <tr><td colspan="3" style="text-align:right;padding:12px 8px 4px;color:#999;font-size:12px">Subtotal</td><td style="text-align:right;padding:12px 8px 4px;font-size:12px">${fmt(sub)}</td></tr>
        ${discRow}
        <tr><td colspan="3" style="text-align:right;padding:4px 8px;color:#999;font-size:12px">Tax (${d.taxRate}%)</td><td style="text-align:right;padding:4px 8px;font-size:12px">${fmt(taxAmt)}</td></tr>
        <tr style="border-top:2px solid #000">
          <td colspan="3" style="text-align:right;padding:12px 8px;font-weight:bold;text-transform:uppercase;font-size:13px">Total</td>
          <td style="text-align:right;padding:12px 8px;font-weight:bold;font-size:20px">${fmt(total)}</td>
        </tr>
      </tfoot>
    </table>
    ${d.notes ? `<div style="margin-top:24px;padding:14px;background:#f9f9f9;border-radius:6px;font-size:12px;color:#666;font-style:italic">${d.notes}</div>` : ''}
    <div style="text-align:center;margin-top:32px;padding-top:20px;border-top:1px solid #eee">
      <p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#333">Thank you for your business</p>
      <p style="margin:10px 0 0;font-size:9px;color:#ccc;letter-spacing:4px;text-transform:uppercase">Generated via ProReceipt</p>
    </div>
  </div>
</div>
</body></html>`;
}

// ─── Serve React build in production ─────────────────────────────────────────

if (!isDev) {
  app.use(express.static(DIST));
  // SPA fallback — let React Router handle unknown paths
  app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => console.log(`ProReceipt backend → http://localhost:${PORT}`));
