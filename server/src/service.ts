import { randomBytes, randomUUID } from 'node:crypto';
import {
  CLERK, LENDER, MERCHANT, ORD, R, cn, feeOf, inr, invNo, last4, nowCap, offerOptions, payable, relOf, t2For, apr,
  type Dispatch, type Email, type Key, type Notice, type Offer, type Snapshot,
} from '../../shared/src/index.js';
import { START, seedChats, seedDispatches, seedLogs, seedTxns } from './seed.js';
import { WsDoc, assertAppendOnly, type Doc, type StoredDispatch, type Timer } from './doc.js';
import type { Repo } from './repo.js';
import { scriptedRead, type ReadResult } from './reader.js';

export class HttpError extends Error { constructor(public status: number, message: string) { super(message) } }
const fail = (msg: string, status = 409): never => { throw new HttpError(status, msg) };

export type Reader = (d: Dispatch, image: Uint8Array, mime: string) => Promise<ReadResult>;
export interface ServiceOptions {
  /** Multiplier for simulated delays (driver replies, clerk, buyer). 0 in tests. */
  delayScale?: number;
  /** Reads real photos. Without one, the scripted reader is used. */
  read?: Reader;
  engine?: Snapshot['engine'];
}
type PhotoIn = { simulated: true } | { simulated: false; bytes: Uint8Array; mime: string };

/** Sim clock helpers. The demo runs on its own clock so the story fits in a few minutes. */
const clock = (min: number) => { const h = Math.floor(min / 60) % 24, m = min % 60; return `${h % 12 || 12}:${String(m).padStart(2, '0')}` };
const clockAP = (min: number) => clock(min) + ' ' + (Math.floor(min / 60) % 24 < 12 ? 'AM' : 'PM');

/** One workspace's state for the length of one request. */
class Ctx {
  constructor(public svc: Service, public doc: WsDoc) {}
  get w() { return this.doc.d.ws }
  get D() { return this.doc.d.dispatches }
  get id() { return this.w.id }
  tick(n = 1) { this.w.min += n }
  now() { return `${this.w.date}, ${clockAP(this.w.min)}` }
  ap() { return clockAP(this.w.min) }
  hm() { return clock(this.w.min) }
  log(d: StoredDispatch, text: string) { this.doc.log(d.k, this.now(), text) }
  full(k: Key): Dispatch { return hydrate(this.doc, this.D[k]) }
  notify(n: Omit<Notice, 'id'>, ms = 0) { this.doc.addNotice(n, ms * this.svc.scale) }
  /** Something an outside party does a moment later. Runs on the next request after it is due. */
  later(ms: number, t: { kind: 'anil'; token: string } | { kind: 'cn' | 'book'; k: Key }) { this.doc.d.timers.push({ ...t, at: Date.now() + ms * this.svc.scale } as Timer) }
}

function hydrate(doc: WsDoc, d: StoredDispatch): Dispatch {
  const p = doc.latestPhoto(d.k);
  return { ...d, log: doc.logs(d.k), photo: p ? { url: p.file ? `/api/photos/${p.id}` : null, simulated: !!p.simulated, place: p.place } : null };
}

export class Service {
  constructor(public repo: Repo, private opts: ServiceOptions = {}) {}
  get scale() { return this.opts.delayScale ?? 1 }

  /**
   * Loads the workspace, runs any due events, applies the action and saves.
   * The save is conditional, so a request that raced another one starts over.
   */
  async act<T>(ws: string, fn: (c: Ctx) => T, opts: { saveIf?: (changed: boolean) => boolean } = {}): Promise<{ out: T; doc: WsDoc }> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const got = (await this.repo.load(ws)) ?? fail('Unknown workspace', 404);
      const prev = structuredClone(got.doc);
      const c = new Ctx(this, new WsDoc(got.doc));
      const ran = this.runDue(c);
      const out = fn(c);
      if (opts.saveIf && !opts.saveIf(ran)) return { out, doc: c.doc };
      assertAppendOnly(prev, c.doc.d);
      if (await this.repo.save(c.doc.d, got.etag)) return { out, doc: c.doc };
    }
    return fail('Busy, please try again', 503);
  }

  private runDue(c: Ctx): boolean {
    const now = Date.now(), due = c.doc.d.timers.filter(t => t.at <= now).sort((a, b) => a.at - b.at);
    if (!due.length) return false;
    c.doc.d.timers = c.doc.d.timers.filter(t => t.at > now);
    for (const t of due) {
      try {
        if (t.kind === 'anil') this.captureCore(c, t.token, { simulated: true });
        else if (t.kind === 'cn') this.clerkPostsCN(c, t.k);
        else if (t.kind === 'book') this.bookCore(c, t.k);
      } catch { /* the moment passed, for example the owner already acted */ }
    }
    return true;
  }

  /* ---------- workspaces ---------- */
  async create(path: Key = 'a', unlocked = false): Promise<string> {
    const id = randomUUID();
    const doc: Doc = {
      ws: { id, path, date: START.date, min: START.min, bal: START.bal, adv_oct: 0, unlocked: unlocked ? 1 : 0, t0: null },
      dispatches: seedDispatches(), log: [], messages: { r: [], a: [] }, links: [], photos: [], readings: {}, txns: [...seedTxns],
      loans: [], notices: [], emails: [], timers: [], seq: 0, version: 0,
    };
    const w = new WsDoc(doc);
    for (const k of ['a', 'b', 'c'] as Key[]) for (const [at, t] of seedLogs[k]) w.log(k, at, t);
    for (const chat of ['r', 'a'] as const) for (const [f, t, at] of seedChats[chat]) w.addMessage(chat, f, t, at);
    await this.repo.save(doc, null);
    return id;
  }
  async exists(ws: string) { return !!(await this.repo.load(ws)) }
  async unlock(ws: string) { await this.act(ws, c => { c.w.unlocked = 1 }) }

  async snapshot(ws: string): Promise<Snapshot> {
    // A read also moves simulated events forward. It only saves when one ran.
    const { doc } = await this.act(ws, () => null, { saveIf: ran => ran });
    const d = doc.d, now = Date.now();
    return {
      workspace: ws, path: d.ws.path, date: d.ws.date, clock: clock(d.ws.min), clockAP: clockAP(d.ws.min), bal: d.ws.bal, advOct: d.ws.adv_oct,
      unlocked: !!d.ws.unlocked, dispatches: Object.fromEntries(Object.values(d.dispatches).map(x => [x.k, hydrate(doc, x)])) as Record<Key, Dispatch>,
      pays: doc.txns(), chats: d.messages, engine: this.opts.engine ?? 'scripted', version: d.version,
      notices: d.notices.filter(n => n.showAt <= now && n.showAt > now - 120_000).map(({ showAt: _s, ...n }) => n),
      pending: d.timers.length > 0 || d.notices.some(n => n.showAt > now),
    };
  }

  /* ---------- ask the driver ---------- */
  async requestPhoto(ws: string, k: Key, origin: string) {
    const { out } = await this.act(ws, c => {
      const d = c.D[k];
      if (d.status !== 'transit') fail('Photo already asked for');
      if (d.newB) fail('First delivery: you are at the dock. Take the photo yourself');
      const token = randomBytes(6).toString('base64url');
      const chat = k === 'a' ? 'r' : 'a';
      const where = k === 'a' ? 'Endurance, Chakan Plant' : 'Pune Precision, Pimpri';
      c.doc.addLink(token, k, d.drv);
      c.tick();
      c.doc.addMessage(chat, 'p', `${d.drv}, please send a photo of ${d.sh}'s stamped challan using this link. No login needed.\n${origin.replace(/^https?:\/\//, '')}/c/${token}`, c.hm(),
        { title: `Challan photo · ${MERCHANT.short}`, sub: `${d.id} · ${where}`, token });
      d.status = 'asked'; d.askedAt = c.ap();
      c.log(d, `Photo link sent to ${d.drv} on WhatsApp`);
      if (k === 'a') c.notify({ phone: 'r', app: 'wa', title: MERCHANT.owner, text: `Ramesh, please send a photo of Endurance's stamped challan using this link.`, action: { view: 'wa' } }, 600);
      else c.later(3200, { kind: 'anil', token }); // Anil replies from his depot by himself
      return token;
    });
    await this.repo.putLink(out, ws);
    return { token: out };
  }

  async remind(ws: string, k: Key) {
    await this.act(ws, c => {
      const d = c.D[k]; if (d.status !== 'asked') fail('Nothing to remind about');
      c.tick();
      c.doc.addMessage(k === 'a' ? 'r' : 'a', 'p', 'Reminder: please send the stamped challan photo from the link above.', c.hm());
      if (k === 'a') c.notify({ phone: 'r', app: 'wa', title: MERCHANT.owner, text: 'Reminder: please send the stamped challan photo from the link above.', action: { view: 'wa' } });
    });
  }

  /* ---------- capture (driver's link or owner's camera) ---------- */
  private async wsOfLink(token: string) { return (await this.repo.getLink(token)) ?? fail('This link is not valid', 404) }

  async captureInfo(token: string) {
    const ws = await this.wsOfLink(token);
    const got = (await this.repo.load(ws)) ?? fail('Not found', 404);
    const doc = new WsDoc(got.doc), l = doc.link(token) ?? fail('This link is not valid', 404), d = got.doc.dispatches[l.k];
    return { dispatch: { id: d.id, buyer: d.buyer, sh: d.sh, site: d.site, qty: d.qty, unit: d.unit, veh: d.veh }, merchant: MERCHANT.name, driver: l.driver, used: !!l.used_at };
  }

  async capture(token: string, photo: PhotoIn) {
    const ws = await this.wsOfLink(token);
    const photoId = await this.storePhoto(photo);
    const { out: k } = await this.act(ws, c => this.captureCore(c, token, photo, photoId));
    await this.read(ws, k, photo);
  }

  private captureCore(c: Ctx, token: string, photo: PhotoIn, photoId: string | null = null): Key {
    const l = c.doc.link(token) ?? fail('This link is not valid', 404);
    if (c.D[l.k].status !== 'asked') fail('This challan already has its photo', 410);
    if (!c.doc.useLink(token)) fail('This link has been used. It worked once, for this challan only.', 410);
    const k = l.k, d = c.D[k];
    const place = k === 'a' ? 'near Endurance gate 3' : k === 'c' ? "Anil's depot, Chakan" : 'Sundaram, Bhosari';
    c.tick(k === 'c' ? 2 : 1);
    this.photoIn(c, d, photo, photoId, 'driver', place);
    d.status = 'photo'; d.shotAt = c.ap(); c.w.t0 = Date.now();
    c.doc.markLinksUsed(k === 'a' ? 'r' : 'a');
    if (k === 'a') {
      c.doc.addMessage('r', 'r', 'Sent the photo.', c.hm());
      c.log(d, 'Ramesh sent the stamped challan photo from Endurance gate 3');
      c.notify({ phone: 'p', app: 'rzp', title: 'Ramesh sent the stamped challan', text: photo.simulated ? `${d.id} · Endurance. Razorpay read it: 960 of 1,000 received, subject to QC.` : `${d.id} · Endurance. Razorpay is reading the photo.`, action: { view: 'chk', k } }, 500);
    } else {
      c.doc.addMessage('a', 'r', 'Sent the photo. The challan was still in the truck.', c.hm());
      c.log(d, `${d.drv} sent the stamped challan photo. Stamp dated 9 Oct`);
      c.notify({ phone: 'p', app: 'rzp', title: `${d.drv} sent the stamped challan`, text: `${d.id} · ${d.sh}. Razorpay read it: all ${inr(d.qty)} received, stamped 9 Oct.`, action: { view: 'chk', k } });
    }
    if (photo.simulated) this.scripted(c, k);
    return k;
  }

  async selfPhoto(ws: string, k: Key, photo: PhotoIn) {
    const photoId = await this.storePhoto(photo);
    await this.act(ws, c => {
      const d = c.D[k];
      if (!['transit', 'asked', 'photo'].includes(d.status)) fail('The proof has already gone to the buyer');
      c.tick();
      this.photoIn(c, d, photo, photoId, 'owner', k === 'b' ? 'Sundaram, Bhosari' : `${d.sh}'s dock`);
      d.status = 'photo'; d.selfShot = true; d.shotAt = c.ap(); c.w.t0 = Date.now();
      c.log(d, `You photographed the stamped challan at ${d.sh}'s dock`);
      if (photo.simulated) this.scripted(c, k);
    });
    await this.read(ws, k, photo);
  }

  private async storePhoto(photo: PhotoIn) {
    if (photo.simulated) return null;
    const id = randomUUID();
    await this.repo.putPhoto(id, photo.bytes, photo.mime);
    return id;
  }
  private photoIn(c: Ctx, d: StoredDispatch, photo: PhotoIn, id: string | null, source: string, place: string) {
    c.doc.addPhoto({ id: id ?? randomUUID(), k: d.k, source, simulated: photo.simulated ? 1 : 0, mime: photo.simulated ? null : photo.mime, file: id, place });
    c.doc.putReadings(d.k, 'scripted', 'pending', null);
  }
  private scripted(c: Ctx, k: Key) {
    const res = scriptedRead(c.full(k));
    if (res.recd) c.D[k].recd = res.recd;
    c.doc.putReadings(k, 'scripted', 'done', res.readings);
  }

  /** AI read of a real photo. Falls back to the scripted reading if no reader is set up or it fails. */
  private async read(ws: string, k: Key, photo: PhotoIn) {
    if (photo.simulated) return;
    let res: ReadResult | null = null, error: string | undefined;
    if (this.opts.read) {
      const got = await this.repo.load(ws);
      try { res = await this.opts.read(hydrate(new WsDoc(got!.doc), got!.doc.dispatches[k]), photo.bytes, photo.mime) }
      catch (e) { error = (e as Error).message.slice(0, 300); console.warn('[reader] falling back to scripted reading:', error) }
    }
    await this.act(ws, c => {
      if (!res) { this.scripted(c, k); if (error) c.doc.d.readings[k]!.error = `AI read failed, showing sample readings: ${error}`; return }
      if (res.recd && c.D[k].status === 'photo') c.D[k].recd = res.recd;
      c.doc.putReadings(k, this.opts.engine ?? 'ai', 'done', res.readings);
    });
  }

  async readings(ws: string, k: Key) {
    const got = (await this.repo.load(ws)) ?? fail('Unknown workspace', 404);
    return got.doc.readings[k] ?? { engine: 'scripted', status: 'none', data: null };
  }

  async setReceived(ws: string, k: Key, qty: number) {
    await this.act(ws, c => {
      const d = c.D[k];
      if (d.status !== 'photo') fail('Received quantity can change only before the proof is sent');
      if (!Number.isInteger(qty) || qty < 1 || qty > d.qty) fail(`Enter a number from 1 to ${inr(d.qty)}`, 400);
      if (qty === d.recd) return;
      d.recd = qty;
      c.log(d, `You set received to ${inr(qty)} of ${inr(d.qty)}${qty < d.qty ? `. Credit note for ${inr(d.qty - qty)} ${d.unit}` : '. No credit note'}`);
    });
  }

  /* ---------- proof to the buyer's accounts ---------- */
  emailFor(d: Dispatch): Email {
    const n = d.id.slice(3).replace('/', '-');
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const short = cn(d) ? `Your stores noted ${inr(d.qty - d.recd)} ${d.unit} damaged. ${d.cnPosted ? 'Our credit note is attached.' : 'Our credit note follows today from our accounts team.'}` : 'No shortage noted.';
    const body = `Delivered to ${esc(d.site)} on ${d.acc} 2026 and stamped by your stores, subject to count and QC. ${short}<br><br>`
      + `Amount payable: <b>${R(payable(d))}</b> + GST, due ${d.due}.<br>Pay to: ${MERCHANT.name}, A/c ${d.va}, IFSC ${MERCHANT.ifsc}.<br>Please reply with your GRN once booked.<br><br>`
      + `We are a Udyam-registered micro enterprise. Payment is due within 45 days of acceptance under the MSMED Act.`
      + (d.newB ? '<br><br>This is a new payment account. The confirmation letter is attached. Please verify by calling us on the number in your vendor records.' : '');
    return {
      to: d.email, subject: `Delivery proof ${d.id}, invoice ${invNo(d)}`, body,
      attachments: ['Stamped challan.jpg', `INV-${n}.pdf`, ...(cn(d) && d.cnPosted ? [`CN-${n}.pdf`] : []), ...(d.newB ? ['Account letter.pdf'] : [])],
      sentAt: null,
    };
  }

  async sendProof(ws: string, k: Key) {
    await this.act(ws, c => {
      const d = c.D[k];
      if (d.status !== 'photo') fail('Nothing to send yet');
      if (c.doc.d.readings[k]?.status !== 'done') fail('Razorpay is still reading the challan');
      c.tick(); d.status = 'proof'; d.proofAt = c.ap();
      const e = this.emailFor(c.full(k)); e.sentAt = c.now();
      c.doc.addEmail(k, e);
      c.log(d, `Proof emailed to ${d.email}: stamped challan, invoice${d.newB ? ', account letter' : ''}. Booking unconfirmed`);
      if (cn(d)) {
        c.log(d, `Draft credit note for ${inr(d.qty - d.recd)} ${d.unit} sent to ${CLERK} to post in Tally`);
        c.later(2600, { kind: 'cn', k });
      }
    });
  }

  /** Meena, the clerk, posts the credit note in Tally. */
  private clerkPostsCN(c: Ctx, k: Key) {
    const d = c.D[k]; if (d.cnPosted) return;
    d.cnPosted = true; c.tick();
    const n = d.id.slice(3);
    c.log(d, `${CLERK} posted CN/${n} in Tally. Sent to ${d.sh}'s accounts`);
    c.doc.addEmail(k, { to: d.email, subject: `Credit note CN/${n} for ${invNo(d)}`, body: `Credit note for ${inr(d.qty - d.recd)} ${d.unit} damaged, ${R(cn(d))} + GST.`, attachments: [`CN-${n.replace('/', '-')}.pdf`], sentAt: c.now() });
    c.notify({ phone: 'p', app: 'rzp', title: `${CLERK} posted the credit note in Tally`, text: `CN/${n} for ${R(cn(d))} sent to ${d.sh}'s accounts.`, action: null });
  }

  async emailView(ws: string, k: Key): Promise<Email> {
    const got = (await this.repo.load(ws)) ?? fail('Unknown workspace', 404);
    const doc = new WsDoc(got.doc), sent = doc.emails(k)[0];
    return sent ?? this.emailFor(hydrate(doc, got.doc.dispatches[k]));
  }

  /* ---------- advance from the lender ---------- */
  offerFor(d: StoredDispatch, amount?: number): Offer {
    const cap = nowCap(d), options = offerOptions(d), a = amount && options.includes(amount) ? amount : cap, t2 = t2For(d, a);
    const charges = feeOf(d, a) + feeOf(d, t2);
    return { k: d.k, nowCap: cap, options, amount: a, t2, charges, apr: apr(d), repay: a + t2 + charges, yours: payable(d) - a - t2 - charges };
  }
  async offer(ws: string, k: Key, amount?: number) {
    const got = (await this.repo.load(ws)) ?? fail('Unknown workspace', 404);
    return this.offerFor(got.doc.dispatches[k], amount);
  }

  async takeAdvance(ws: string, k: Key, amount: number) {
    await this.act(ws, c => {
      const d = c.D[k];
      if (d.status !== 'proof') fail('The advance is available after the proof is sent');
      const o = this.offerFor(d, amount);
      if (o.amount !== amount) fail('Pick one of the offered amounts', 400);
      const outstanding = c.doc.loans().filter(l => l.status === 'disbursed').reduce((s, l) => s + l.amount, 0);
      if (outstanding + amount + o.t2 > MERCHANT.limit) fail('This is above your approved limit');
      d.amt = amount; d.t2 = o.t2; d.t2Pending = o.t2 > 0; d.charges = feeOf(d, amount); c.tick();
      if (d.newB) {
        d.status = 'await';
        c.log(d, `${LENDER} approved ${R(d.amt)}. Waiting for ${d.sh} to confirm receipt and approve the account`);
        return;
      }
      this.disburse(c, d);
    });
  }

  private disburse(c: Ctx, d: StoredDispatch) {
    d.status = 'adv'; d.advAt = c.ap();
    if (c.w.t0) { const s = Math.round((Date.now() - c.w.t0) / 1000); d.elapsed = s < 60 ? `${s} seconds` : `${Math.floor(s / 60)} min ${s % 60} s` }
    c.w.bal += d.amt; c.w.adv_oct += d.amt;
    c.doc.addLoan(d.k, 1, d.amt, d.charges, c.now());
    c.doc.addTxn({ who: LENDER, what: `Advance · ${d.id}`, amt: d.amt, ini: 'KF' });
    c.log(d, `${R(d.amt)} paid by ${LENDER} to ${MERCHANT.bank}. Charges ${R(d.charges)}${d.t2Pending ? `. ${R(d.t2)} more when QC clears` : ''}`);
    c.notify({ phone: 'p', app: 'bank', title: `${R(d.amt)} credited`, text: `${MERCHANT.bank} · ${LENDER} via Razorpay Capital · ${d.id}`, action: null }, 400);
  }

  async skipAdvance(ws: string, k: Key) {
    await this.act(ws, c => {
      const d = c.D[k];
      if (d.status !== 'proof') fail('Nothing to skip');
      if (!d.newB) c.later(3200, { kind: 'book', k }); // their accounts team replies with a GRN
    });
  }

  /* ---------- the buyer (simulated: they reply to the email) ---------- */
  private bookCore(c: Ctx, k: Key) {
    const d = c.D[k];
    if (d.booked || ORD[d.status] < 3) fail('Nothing to book');
    d.booked = true; c.tick(3); d.bookedAt = c.ap();
    c.log(d, `${d.sh}'s accounts replied: QC cleared, booked under GRN ${d.grn}`);
    let t2txt = '';
    if (d.t2Pending) {
      const f = feeOf(d, d.t2);
      d.amt += d.t2; d.charges += f; d.t2Pending = false; c.w.bal += d.t2; c.w.adv_oct += d.t2;
      c.doc.addLoan(k, 2, d.t2, f, c.now());
      c.doc.addTxn({ who: LENDER, what: `Advance, second part · ${d.id}`, amt: d.t2, ini: 'KF' });
      c.log(d, `Second part ${R(d.t2)} paid by ${LENDER} after QC cleared`);
      t2txt = ` ${R(d.t2)} second part sent to ${MERCHANT.bank}.`;
    }
    c.notify({ phone: 'p', app: 'rzp', title: `${d.sh} booked ${invNo(d)}`, text: `QC cleared · GRN ${d.grn}.${t2txt}`, action: { view: 'dd', k } });
  }
  async bookAck(ws: string, k: Key) { await this.act(ws, c => this.bookCore(c, k)) }

  async buyerConfirms(ws: string, k: Key) {
    await this.act(ws, c => {
      const d = c.D[k]; if (d.status !== 'await') fail('Nothing to confirm');
      c.tick(40); d.booked = true; d.bookedAt = c.ap();
      c.log(d, `${d.sh}'s accounts confirmed receipt, booked under GRN ${d.grn} and approved account ••${last4(d.va)}`);
      d.vaNote = `Approved by ${d.sh}'s accounts on 12 Oct`;
      this.disburse(c, d);
    });
  }

  /** Jump to the due date: the buyer pays into the merchant's account and the standing instruction repays the lender. */
  async buyerPays(ws: string, k: Key) {
    await this.act(ws, c => {
      const d = c.D[k];
      if (!['proof', 'adv'].includes(d.status)) fail(`Send the proof to ${d.sh} first`);
      if (!d.booked) this.bookCore(c, k);
      c.w.date = d.due; c.w.min = 10 * 60 + 5; d.status = 'paid';
      const rel = relOf(c.full(k));
      c.w.bal += rel;
      c.doc.repayLoans(k, c.now());
      c.doc.addTxn({ who: d.buyer.replace(/ (Pvt )?Ltd$/, ''), what: `${d.amt ? 'Your share after repaying the advance' : 'Paid in full'} · ${d.id}`, amt: rel, ini: d.sh.split(' ').map(x => x[0]).join('').slice(0, 2) });
      c.log(d, `${d.sh} paid ${R(payable(d))} + GST by RTGS into ••${last4(d.va)}. Matched to ${invNo(d)}`);
      if (d.amt) c.log(d, `Your bank sent ${R(d.amt + d.charges)} to ${LENDER}. ${R(rel)} + GST stays with you`);
      c.notify({ phone: 'p', app: 'rzp', title: `${d.sh} paid ${R(payable(d))} + GST`, text: d.amt ? `${R(d.amt + d.charges)} repaid to ${LENDER}. ${R(rel)} + GST is yours.` : `All of it is yours. Matched to ${invNo(d)}.`, action: { view: 'dd', k } }, 400);
    });
  }

  async loans(ws: string) {
    const got = (await this.repo.load(ws)) ?? fail('Unknown workspace', 404);
    return got.doc.loans;
  }
  async latestLink(ws: string, k: Key) {
    const got = (await this.repo.load(ws)) ?? fail('Unknown workspace', 404);
    return new WsDoc(got.doc).latestLink(k);
  }
  async photoFor(ws: string, id: string) {
    const got = await this.repo.load(ws);
    if (!got || !new WsDoc(got.doc).photo(id)) return null;
    return this.repo.getPhoto(id);
  }
}
