import type { ChatMessage, Email, Key, LogEntry, Notice, Phone, Reading, Txn, Dispatch } from '../../shared/src/index.js';

// One demo workspace is one JSON document. It is loaded, changed and saved per request,
// which works the same on a laptop and on Netlify Functions (no disk, no long-running process).

export interface WsRow { id: string; path: Key; date: string; min: number; bal: number; adv_oct: number; unlocked: number; t0: number | null }
export type StoredDispatch = Omit<Dispatch, 'log' | 'photo'>;
export interface PhotoRow { id: string; k: Key; source: string; simulated: number; mime: string | null; file: string | null; place: string; created_at: number }
export interface LinkRow { token: string; ws: string; k: Key; driver: string; created_at: number; used_at: number | null }
export interface LoanRow { id: number; k: Key; part: number; amount: number; charges: number; status: string; disbursed_at: string; repaid_at: string | null }
export interface StoredNotice extends Notice { showAt: number }
export type Timer = { at: number; kind: 'anil'; token: string } | { at: number; kind: 'cn' | 'book'; k: Key };

export interface Doc {
  ws: WsRow;
  dispatches: Record<Key, StoredDispatch>;
  log: (LogEntry & { k: Key })[];
  messages: { r: ChatMessage[]; a: ChatMessage[] };
  links: LinkRow[];
  photos: PhotoRow[];
  readings: Partial<Record<Key, { engine: string; status: string; data: Reading[] | null }>>;
  txns: Txn[];
  loans: LoanRow[];
  notices: StoredNotice[];
  emails: (Email & { k: Key })[];
  timers: Timer[];
  seq: number;
  version: number;
}

/** Helpers over a loaded document. Mirrors the queries the service needs. */
export class WsDoc {
  constructor(public d: Doc) {}
  private next() { return ++this.d.seq }

  log(k: Key, at: string, text: string) { this.d.log.push({ k, at, text }) }
  logs(k: Key): LogEntry[] { return this.d.log.filter(l => l.k === k).map(({ at, text }) => ({ at, text })) }

  addMessage(chat: 'r' | 'a', f: Phone, t: string, at: string, link: ChatMessage['link'] = null) {
    this.d.messages[chat].push({ id: this.next(), f, t, at, link, used: false });
  }
  markLinksUsed(chat: 'r' | 'a') { for (const m of this.d.messages[chat]) if (m.link) m.used = true }

  addLink(token: string, k: Key, driver: string) { this.d.links.push({ token, ws: this.d.ws.id, k, driver, created_at: Date.now(), used_at: null }) }
  link(token: string) { return this.d.links.find(l => l.token === token) }
  latestLink(k: Key) { return [...this.d.links].reverse().find(l => l.k === k) }
  /** Marks a link used. Returns false if it was already used, so a link works once. */
  useLink(token: string) { const l = this.link(token); if (!l || l.used_at) return false; l.used_at = Date.now(); return true }

  addPhoto(p: Omit<PhotoRow, 'created_at'>) { this.d.photos.push({ ...p, created_at: Date.now() }) }
  latestPhoto(k: Key) { return [...this.d.photos].reverse().find(p => p.k === k) }
  photo(id: string) { return this.d.photos.find(p => p.id === id) }
  putReadings(k: Key, engine: string, status: 'pending' | 'done' | 'failed', data: Reading[] | null) { this.d.readings[k] = { engine, status, data } }

  addTxn(t: Txn) { this.d.txns.push(t) }
  txns(): Txn[] { return [...this.d.txns].reverse() }
  addLoan(k: Key, part: number, amount: number, charges: number, at: string) {
    this.d.loans.push({ id: this.next(), k, part, amount, charges, status: 'disbursed', disbursed_at: at, repaid_at: null });
  }
  loans(k?: Key) { return this.d.loans.filter(l => !k || l.k === k) }
  repayLoans(k: Key, at: string) { for (const l of this.d.loans) if (l.k === k && l.status === 'disbursed') { l.status = 'repaid'; l.repaid_at = at } }

  addNotice(n: Omit<Notice, 'id'>, delayMs = 0) { this.d.notices.push({ ...n, id: this.next(), showAt: Date.now() + delayMs }) }
  addEmail(k: Key, e: Email) { this.d.emails.push({ ...e, k }) }
  emails(k: Key): Email[] { return this.d.emails.filter(e => e.k === k).map(({ k: _k, ...e }) => e) }
}

/** The record is append-only: a save may add entries but never change or drop one. */
export function assertAppendOnly(prev: Doc | null, next: Doc) {
  if (!prev) return;
  if (next.log.length < prev.log.length) throw new Error('audit log is append-only');
  prev.log.forEach((l, i) => {
    const n = next.log[i];
    if (n.k !== l.k || n.at !== l.at || n.text !== l.text) throw new Error('audit log is append-only');
  });
}
