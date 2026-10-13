// Domain types and money rules shared by the server and the web app.
// Amounts are rupees before GST. GST is as on the invoice and is never advanced.

export type Key = 'a' | 'b' | 'c';
export type Phone = 'p' | 'r';
export type Status = 'transit' | 'asked' | 'photo' | 'proof' | 'await' | 'adv' | 'paid';

export const ORD: Record<Status, number> = { transit: 0, asked: 1, photo: 2, proof: 3, await: 3.5, adv: 4, paid: 5 };

export const LENDER = 'Kaveri Finance';
export const CLERK = 'Meena';
export const MERCHANT = {
  name: 'Shree Ganesh Corrugators',
  short: 'Shree Ganesh',
  owner: 'Prakash Patil',
  gstin: '27ABKFS4471M1ZQ',
  address: 'B-14, Chakan MIDC Ph II, Pune',
  bank: 'HDFC Bank ••4412',
  ifsc: 'RAZR0000001',
  limit: 600000,
};

export interface LogEntry { at: string; text: string }

export interface Dispatch {
  k: Key;
  id: string; // delivery challan number, e.g. DC/2610/0418
  buyer: string;
  sh: string;
  site: string;
  item: string;
  unit: string;
  qty: number;
  recd: number;
  rate: number;
  terms: number;
  tenor: number;
  fee: number; // flat charge per part, as a fraction
  pct: number; // max advance as a fraction of payable
  newB: boolean;
  va: string;
  vaNote: string;
  email: string;
  hist: string;
  drv: string;
  veh: string;
  left: string;
  acc: string;
  obj: string;
  msme: string;
  grn: string;
  due: string;
  stampDate: string | null;
  note: string | null;
  status: Status;
  stale: boolean;
  askedAt: string | null;
  shotAt: string | null;
  selfShot: boolean;
  proofAt: string | null;
  booked: boolean;
  bookedAt: string | null;
  cnPosted: boolean;
  amt: number;
  t2: number;
  t2Pending: boolean;
  charges: number;
  advAt: string | null;
  elapsed: string | null;
  photo: { url: string | null; simulated: boolean; place: string } | null;
  log: LogEntry[];
}

export interface Reading { label: string; value: string; detail: string; verdict: string; tone: 'g' | 'y' | 'r' | 'n' }

export interface ChatMessage { id: number; f: Phone; t: string; at: string; link: { title: string; sub: string; token: string } | null; used: boolean }

export interface Txn { who: string; what: string; amt: number; ini: string }

export interface Notice { id: number; phone: Phone; app: 'rzp' | 'wa' | 'bank'; title: string; text: string; action: { view: string; k?: Key } | null }

export interface Email { to: string; subject: string; body: string; attachments: string[]; sentAt: string | null }

export interface Snapshot {
  workspace: string;
  path: Key;
  date: string;
  clock: string;
  clockAP: string;
  bal: number;
  advOct: number;
  unlocked: boolean;
  dispatches: Record<Key, Dispatch>;
  pays: Txn[];
  chats: { r: ChatMessage[]; a: ChatMessage[] };
  engine: 'scripted' | 'claude';
}

export interface Offer {
  k: Key;
  nowCap: number;
  options: number[];
  amount: number;
  t2: number;
  charges: number;
  apr: string;
  repay: number;
  yours: number;
}

export interface Capture {
  dispatch: { id: string; buyer: string; sh: string; site: string; qty: number; unit: string; veh: string };
  merchant: string;
  driver: string;
  used: boolean;
}

/* ---------- money rules ---------- */
type M = Pick<Dispatch, 'qty' | 'recd' | 'rate' | 'pct' | 'newB' | 'fee' | 'tenor'>;
export const inv = (d: M) => d.qty * d.rate;
export const payable = (d: M) => d.recd * d.rate;
export const cn = (d: M) => inv(d) - payable(d);
export const maxAdv = (d: M) => Math.floor((payable(d) * d.pct) / 1000) * 1000;
/** First part: 50% while the gate receipt is provisional, or the new-buyer cap. */
export const nowCap = (d: M) => Math.floor((payable(d) * (d.newB ? d.pct : 0.5)) / 1000) * 1000;
/** Second part, paid when QC clears. New buyers get one part only. */
export const t2For = (d: M, a: number) => (d.newB ? 0 : Math.round((a * (d.pct / 0.5 - 1)) / 1000) * 1000);
export const feeOf = (d: M, a: number) => Math.round(a * d.fee);
export const apr = (d: M) => ((d.fee * 365) / d.tenor * 100).toFixed(1);
export const pctLabel = (d: M) => (d.fee * 100).toFixed(1) + '%';
export const relOf = (d: Dispatch) => payable(d) - (d.amt || 0) - (d.charges || 0);
export const offerOptions = (d: M) => [...new Set([Math.round((nowCap(d) * 0.5) / 1000) * 1000, Math.round((nowCap(d) * 0.75) / 1000) * 1000, nowCap(d)])];

export const inr = (n: number) => Math.round(n).toLocaleString('en-IN');
export const R = (n: number) => '₹' + inr(n);
export const last4 = (va: string) => va.slice(-4);
export const invNo = (d: Pick<Dispatch, 'id'>) => 'INV/' + d.id.slice(3);
