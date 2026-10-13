import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ChatMessage, Dispatch, Email, Key, LogEntry, Notice, Phone, Reading, Txn } from '@cc/shared';

// One demo workspace per browser. Reset makes a new workspace instead of deleting,
// because the audit log is append-only and refuses updates and deletes.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY, path TEXT NOT NULL, date TEXT NOT NULL, min INTEGER NOT NULL,
  bal INTEGER NOT NULL, adv_oct INTEGER NOT NULL, unlocked INTEGER NOT NULL DEFAULT 0,
  t0 INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS dispatches (
  ws TEXT NOT NULL, k TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL,
  PRIMARY KEY (ws, k));
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ws TEXT NOT NULL, k TEXT NOT NULL,
  at TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ws TEXT NOT NULL, chat TEXT NOT NULL, f TEXT NOT NULL,
  t TEXT NOT NULL, at TEXT NOT NULL, link TEXT, used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS capture_links (
  token TEXT PRIMARY KEY, ws TEXT NOT NULL, k TEXT NOT NULL, driver TEXT NOT NULL,
  created_at INTEGER NOT NULL, used_at INTEGER);
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY, ws TEXT NOT NULL, k TEXT NOT NULL, source TEXT NOT NULL,
  simulated INTEGER NOT NULL, mime TEXT, file TEXT, place TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS readings (
  ws TEXT NOT NULL, k TEXT NOT NULL, engine TEXT NOT NULL, status TEXT NOT NULL, data TEXT,
  PRIMARY KEY (ws, k));
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ws TEXT NOT NULL, who TEXT NOT NULL, what TEXT NOT NULL,
  amt INTEGER NOT NULL, ini TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ws TEXT NOT NULL, phone TEXT NOT NULL, app TEXT NOT NULL,
  title TEXT NOT NULL, text TEXT NOT NULL, action TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ws TEXT NOT NULL, k TEXT NOT NULL, to_addr TEXT NOT NULL,
  subject TEXT NOT NULL, body TEXT NOT NULL, attachments TEXT NOT NULL, sent_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ws TEXT NOT NULL, k TEXT NOT NULL, part INTEGER NOT NULL,
  amount INTEGER NOT NULL, charges INTEGER NOT NULL, status TEXT NOT NULL,
  disbursed_at TEXT NOT NULL, repaid_at TEXT);
`;

export interface WsRow { id: string; path: Key; date: string; min: number; bal: number; adv_oct: number; unlocked: number; t0: number | null }
export type StoredDispatch = Omit<Dispatch, 'log' | 'photo'>;
export interface PhotoRow { id: string; ws: string; k: Key; source: string; simulated: number; mime: string | null; file: string | null; place: string }
export interface LinkRow { token: string; ws: string; k: Key; driver: string; used_at: number | null }
export interface LoanRow { id: number; k: Key; part: number; amount: number; charges: number; status: string }

type Row = Record<string, unknown>;

export class Store {
  db: DatabaseSync;
  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(SCHEMA);
  }

  tx<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try { const r = fn(); this.db.exec('COMMIT'); return r; } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }

  /* workspaces */
  insertWs(w: WsRow) {
    this.db.prepare('INSERT INTO workspaces (id,path,date,min,bal,adv_oct,unlocked,t0,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(w.id, w.path, w.date, w.min, w.bal, w.adv_oct, w.unlocked, w.t0, Date.now());
  }
  ws(id: string): WsRow | undefined { return this.db.prepare('SELECT * FROM workspaces WHERE id=?').get(id) as unknown as WsRow | undefined }
  saveWs(w: WsRow) {
    this.db.prepare('UPDATE workspaces SET path=?,date=?,min=?,bal=?,adv_oct=?,unlocked=?,t0=? WHERE id=?')
      .run(w.path, w.date, w.min, w.bal, w.adv_oct, w.unlocked, w.t0, w.id);
  }

  /* dispatches */
  putDispatch(ws: string, d: StoredDispatch) {
    this.db.prepare('INSERT INTO dispatches (ws,k,status,data) VALUES (?,?,?,?) ON CONFLICT(ws,k) DO UPDATE SET status=excluded.status, data=excluded.data')
      .run(ws, d.k, d.status, JSON.stringify(d));
  }
  dispatches(ws: string): StoredDispatch[] {
    return (this.db.prepare('SELECT data FROM dispatches WHERE ws=? ORDER BY k').all(ws) as Row[]).map(r => JSON.parse(r.data as string));
  }

  /* audit log */
  log(ws: string, k: Key, at: string, text: string) {
    this.db.prepare('INSERT INTO audit_log (ws,k,at,text,created_at) VALUES (?,?,?,?,?)').run(ws, k, at, text, Date.now());
  }
  logs(ws: string, k: Key): LogEntry[] {
    return this.db.prepare('SELECT at,text FROM audit_log WHERE ws=? AND k=? ORDER BY id').all(ws, k) as unknown as LogEntry[];
  }

  /* whatsapp */
  addMessage(ws: string, chat: 'r' | 'a', f: Phone, t: string, at: string, link: ChatMessage['link'] = null) {
    this.db.prepare('INSERT INTO messages (ws,chat,f,t,at,link) VALUES (?,?,?,?,?,?)').run(ws, chat, f, t, at, link ? JSON.stringify(link) : null);
  }
  messages(ws: string, chat: 'r' | 'a'): ChatMessage[] {
    return (this.db.prepare('SELECT * FROM messages WHERE ws=? AND chat=? ORDER BY id').all(ws, chat) as Row[]).map(r => ({
      id: r.id as number, f: r.f as Phone, t: r.t as string, at: r.at as string,
      link: r.link ? JSON.parse(r.link as string) : null, used: !!r.used,
    }));
  }
  markLinksUsed(ws: string, chat: 'r' | 'a') { this.db.prepare('UPDATE messages SET used=1 WHERE ws=? AND chat=? AND link IS NOT NULL').run(ws, chat) }

  /* capture links */
  addLink(token: string, ws: string, k: Key, driver: string) {
    this.db.prepare('INSERT INTO capture_links (token,ws,k,driver,created_at) VALUES (?,?,?,?,?)').run(token, ws, k, driver, Date.now());
  }
  link(token: string): LinkRow | undefined { return this.db.prepare('SELECT * FROM capture_links WHERE token=?').get(token) as unknown as LinkRow | undefined }
  latestLink(ws: string, k: Key): LinkRow | undefined {
    return this.db.prepare('SELECT * FROM capture_links WHERE ws=? AND k=? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(ws, k) as unknown as LinkRow | undefined;
  }
  /** Marks a link used. Returns false if it was already used, so a link works once. */
  useLink(token: string): boolean {
    return Number(this.db.prepare('UPDATE capture_links SET used_at=? WHERE token=? AND used_at IS NULL').run(Date.now(), token).changes) === 1;
  }

  /* photos and readings */
  addPhoto(p: PhotoRow) {
    this.db.prepare('INSERT INTO photos (id,ws,k,source,simulated,mime,file,place,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(p.id, p.ws, p.k, p.source, p.simulated, p.mime, p.file, p.place, Date.now());
  }
  photo(id: string): PhotoRow | undefined { return this.db.prepare('SELECT * FROM photos WHERE id=?').get(id) as unknown as PhotoRow | undefined }
  latestPhoto(ws: string, k: Key): PhotoRow | undefined {
    return this.db.prepare('SELECT * FROM photos WHERE ws=? AND k=? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(ws, k) as unknown as PhotoRow | undefined;
  }
  putReadings(ws: string, k: Key, engine: string, status: 'pending' | 'done' | 'failed', data: Reading[] | null) {
    this.db.prepare('INSERT INTO readings (ws,k,engine,status,data) VALUES (?,?,?,?,?) ON CONFLICT(ws,k) DO UPDATE SET engine=excluded.engine,status=excluded.status,data=excluded.data')
      .run(ws, k, engine, status, data ? JSON.stringify(data) : null);
  }
  readings(ws: string, k: Key): { engine: string; status: string; data: Reading[] | null } | undefined {
    const r = this.db.prepare('SELECT engine,status,data FROM readings WHERE ws=? AND k=?').get(ws, k) as Row | undefined;
    return r && { engine: r.engine as string, status: r.status as string, data: r.data ? JSON.parse(r.data as string) : null };
  }

  /* money */
  addTxn(ws: string, t: Txn) { this.db.prepare('INSERT INTO transactions (ws,who,what,amt,ini) VALUES (?,?,?,?,?)').run(ws, t.who, t.what, t.amt, t.ini) }
  txns(ws: string): Txn[] { return this.db.prepare('SELECT who,what,amt,ini FROM transactions WHERE ws=? ORDER BY id DESC').all(ws) as unknown as Txn[] }
  addLoan(ws: string, k: Key, part: number, amount: number, charges: number, at: string) {
    this.db.prepare("INSERT INTO loans (ws,k,part,amount,charges,status,disbursed_at) VALUES (?,?,?,?,?,'disbursed',?)").run(ws, k, part, amount, charges, at);
  }
  loans(ws: string, k?: Key): LoanRow[] {
    return (k ? this.db.prepare('SELECT * FROM loans WHERE ws=? AND k=? ORDER BY id').all(ws, k) : this.db.prepare('SELECT * FROM loans WHERE ws=? ORDER BY id').all(ws)) as unknown as LoanRow[];
  }
  repayLoans(ws: string, k: Key, at: string) { this.db.prepare("UPDATE loans SET status='repaid', repaid_at=? WHERE ws=? AND k=? AND status='disbursed'").run(at, ws, k) }

  /* notices and email */
  addNotice(ws: string, n: Omit<Notice, 'id'>): Notice {
    const r = this.db.prepare('INSERT INTO notices (ws,phone,app,title,text,action,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(ws, n.phone, n.app, n.title, n.text, n.action ? JSON.stringify(n.action) : null, Date.now());
    return { ...n, id: Number(r.lastInsertRowid) };
  }
  addEmail(ws: string, k: Key, e: Email) {
    this.db.prepare('INSERT INTO emails (ws,k,to_addr,subject,body,attachments,sent_at) VALUES (?,?,?,?,?,?,?)')
      .run(ws, k, e.to, e.subject, e.body, JSON.stringify(e.attachments), e.sentAt ?? '');
  }
  emails(ws: string, k: Key): Email[] {
    return (this.db.prepare('SELECT * FROM emails WHERE ws=? AND k=? ORDER BY id').all(ws, k) as Row[]).map(r => ({
      to: r.to_addr as string, subject: r.subject as string, body: r.body as string, attachments: JSON.parse(r.attachments as string), sentAt: r.sent_at as string,
    }));
  }
}
