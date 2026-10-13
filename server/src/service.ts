import { randomBytes, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  CLERK, LENDER, MERCHANT, ORD, R, cn, feeOf, inr, invNo, last4, nowCap, offerOptions, payable, relOf, t2For, apr,
  type Dispatch, type Email, type Key, type Notice, type Offer, type Phone, type Snapshot,
} from '@cc/shared';
import { START, seedChats, seedDispatches, seedLogs, seedTxns } from './seed.js';
import type { Store, StoredDispatch, WsRow } from './store.js';
import { claudeEnabled, claudeRead, scriptedRead, type ReadResult } from './reader.js';

export class HttpError extends Error { constructor(public status: number, message: string) { super(message) } }
const fail = (msg: string, status = 409): never => { throw new HttpError(status, msg) };

export type BusEvent = { type: 'state' } | { type: 'notice'; notice: Notice };

export interface ServiceOptions {
  /** Multiplier for simulated delays (driver replies, clerk, buyer). 0 in tests. */
  delayScale?: number;
  read?: (d: Dispatch, image: Buffer, mime: string) => Promise<ReadResult>;
  loadPhoto?: (file: string) => Buffer;
}

/** Sim clock helpers. The demo runs on its own clock so the story fits in a few minutes. */
const clock = (min: number) => { const h = Math.floor(min / 60) % 24, m = min % 60; return `${h % 12 || 12}:${String(m).padStart(2, '0')}` };
const clockAP = (min: number) => clock(min) + ' ' + (Math.floor(min / 60) % 24 < 12 ? 'AM' : 'PM');

/** Holds one workspace's state for the length of one action. */
class Ctx {
  D: Record<Key, StoredDispatch>;
  constructor(public svc: Service, public w: WsRow) {
    this.D = Object.fromEntries(svc.store.dispatches(w.id).map(d => [d.k, d])) as Record<Key, StoredDispatch>;
  }
  get id() { return this.w.id }
  tick(n = 1) { this.w.min += n }
  now() { return `${this.w.date}, ${clockAP(this.w.min)}` }
  ap() { return clockAP(this.w.min) }
  hm() { return clock(this.w.min) }
  log(d: StoredDispatch, text: string) { this.svc.store.log(this.id, d.k, this.now(), text) }
  full(k: Key): Dispatch { return this.svc.hydrate(this.id, this.D[k]) }
  notify(n: Omit<Notice, 'id'>, ms = 0) {
    const send = () => this.svc.emit(this.id, { type: 'notice', notice: this.svc.store.addNotice(this.id, n) });
    if (ms) this.svc.later(ms, send); else send();
  }
  save() {
    this.svc.store.saveWs(this.w);
    for (const d of Object.values(this.D)) this.svc.store.putDispatch(this.id, d);
  }
}

export class Service {
  bus = new EventEmitter();
  constructor(public store: Store, private opts: ServiceOptions = {}) { this.bus.setMaxListeners(0) }

  emit(ws: string, e: BusEvent) { this.bus.emit(ws, e) }
  later(ms: number, fn: () => void) { setTimeout(fn, ms * (this.opts.delayScale ?? 1)) }

  /** Runs one action in a transaction, then tells connected phones to refresh. */
  act<T>(ws: string, fn: (c: Ctx) => T): T {
    const w = this.store.ws(ws) ?? fail('Unknown workspace', 404);
    const r = this.store.tx(() => { const c = new Ctx(this, w); const out = fn(c); c.save(); return out });
    this.emit(ws, { type: 'state' });
    return r;
  }

  /* ---------- workspaces ---------- */
  create(path: Key = 'a', unlocked = false): string {
    const id = randomUUID();
    this.store.tx(() => {
      this.store.insertWs({ id, path, date: START.date, min: START.min, bal: START.bal, adv_oct: 0, unlocked: unlocked ? 1 : 0, t0: null });
      for (const d of Object.values(seedDispatches())) {
        this.store.putDispatch(id, d);
        for (const [at, t] of seedLogs[d.k]) this.store.log(id, d.k, at, t);
      }
      for (const t of seedTxns) this.store.addTxn(id, t);
      for (const chat of ['r', 'a'] as const) for (const [f, t, at] of seedChats[chat]) this.store.addMessage(id, chat, f, t, at);
    });
    return id;
  }
  exists(ws: string) { return !!this.store.ws(ws) }
  unlock(ws: string) { this.act(ws, c => { c.w.unlocked = 1 }) }

  hydrate(ws: string, d: StoredDispatch): Dispatch {
    const p = this.store.latestPhoto(ws, d.k);
    return { ...d, log: this.store.logs(ws, d.k), photo: p ? { url: p.file ? `/api/photos/${p.id}` : null, simulated: !!p.simulated, place: p.place } : null };
  }

  snapshot(ws: string): Snapshot {
    const w = this.store.ws(ws) ?? fail('Unknown workspace', 404);
    const D = Object.fromEntries(this.store.dispatches(ws).map(d => [d.k, this.hydrate(ws, d)])) as Record<Key, Dispatch>;
    return {
      workspace: ws, path: w.path, date: w.date, clock: clock(w.min), clockAP: clockAP(w.min), bal: w.bal, advOct: w.adv_oct,
      unlocked: !!w.unlocked, dispatches: D, pays: this.store.txns(ws),
      chats: { r: this.store.messages(ws, 'r'), a: this.store.messages(ws, 'a') },
      engine: claudeEnabled() ? 'claude' : 'scripted',
    };
  }

  /* ---------- ask the driver ---------- */
  requestPhoto(ws: string, k: Key, origin: string) {
    return this.act(ws, c => {
      const d = c.D[k];
      if (d.status !== 'transit') fail('Photo already asked for');
      if (d.newB) fail('First delivery: you are at the dock. Take the photo yourself');
      const token = randomBytes(6).toString('base64url');
      const chat = k === 'a' ? 'r' : 'a';
      const where = k === 'a' ? 'Endurance, Chakan Plant' : 'Pune Precision, Pimpri';
      this.store.addLink(token, ws, k, d.drv);
      c.tick();
      this.store.addMessage(ws, chat, 'p', `${d.drv}, please send a photo of ${d.sh}'s stamped challan using this link. No login needed.\n${origin.replace(/^https?:\/\//, '')}/c/${token}`, c.hm(),
        { title: `Challan photo · ${MERCHANT.short}`, sub: `${d.id} · ${where}`, token });
      d.status = 'asked'; d.askedAt = c.ap();
      c.log(d, `Photo link sent to ${d.drv} on WhatsApp`);
      if (k === 'a') c.notify({ phone: 'r', app: 'wa', title: MERCHANT.owner, text: `Ramesh, please send a photo of Endurance's stamped challan using this link.`, action: { view: 'wa' } }, 600);
      else this.later(3200, () => this.simulateAnil(ws, token));
      return { token };
    });
  }

  remind(ws: string, k: Key) {
    return this.act(ws, c => {
      const d = c.D[k]; if (d.status !== 'asked') fail('Nothing to remind about');
      c.tick();
      this.store.addMessage(ws, k === 'a' ? 'r' : 'a', 'p', `Reminder: please send the stamped challan photo from the link above.`, c.hm());
      if (k === 'a') c.notify({ phone: 'r', app: 'wa', title: MERCHANT.owner, text: 'Reminder: please send the stamped challan photo from the link above.', action: { view: 'wa' } });
    });
  }

  /** Anil is a scripted driver who replies from his depot. */
  private simulateAnil(ws: string, token: string) {
    const l = this.store.link(token); if (!l || l.used_at) return;
    this.capture(token, { simulated: true }).catch(() => {});
  }

  /* ---------- capture (driver's link or owner's camera) ---------- */
  captureInfo(token: string) {
    const l = this.store.link(token) ?? fail('This link is not valid', 404);
    const d = this.store.dispatches(l.ws).find(x => x.k === l.k) ?? fail('Not found', 404);
    return { dispatch: { id: d.id, buyer: d.buyer, sh: d.sh, site: d.site, qty: d.qty, unit: d.unit, veh: d.veh }, merchant: MERCHANT.name, driver: l.driver, used: !!l.used_at };
  }

  async capture(token: string, photo: { simulated: true } | { simulated: false; file: string; mime: string }) {
    const l = this.store.link(token) ?? fail('This link is not valid', 404);
    const cur = this.store.dispatches(l.ws).find(x => x.k === l.k);
    if (cur?.status !== 'asked') fail('This challan already has its photo', 410);
    if (!this.store.useLink(token)) fail('This link has been used. It worked once, for this challan only.', 410);
    const k = l.k;
    const place = k === 'a' ? 'near Endurance gate 3' : k === 'c' ? "Anil's depot, Chakan" : 'Sundaram, Bhosari';
    this.act(l.ws, c => {
      const d = c.D[k]; c.tick(k === 'c' ? 2 : 1);
      this.photoIn(c, d, photo, 'driver', place);
      d.status = 'photo'; d.shotAt = c.ap(); c.w.t0 = Date.now();
      this.store.markLinksUsed(l.ws, k === 'a' ? 'r' : 'a');
      if (k === 'a') {
        this.store.addMessage(l.ws, 'r', 'r', 'Sent the photo.', c.hm());
        c.log(d, 'Ramesh sent the stamped challan photo from Endurance gate 3');
        c.notify({ phone: 'p', app: 'rzp', title: 'Ramesh sent the stamped challan', text: photo.simulated ? `${d.id} · Endurance. Razorpay read it: 960 of 1,000 received, subject to QC.` : `${d.id} · Endurance. Razorpay is reading the photo.`, action: { view: 'chk', k } }, 500);
      } else {
        this.store.addMessage(l.ws, 'a', 'r', 'Sent the photo. The challan was still in the truck.', c.hm());
        c.log(d, `${d.drv} sent the stamped challan photo. Stamp dated 9 Oct`);
        c.notify({ phone: 'p', app: 'rzp', title: `${d.drv} sent the stamped challan`, text: `${d.id} · ${d.sh}. Razorpay read it: all ${inr(d.qty)} received, stamped 9 Oct.`, action: { view: 'chk', k } });
      }
    });
    await this.read(l.ws, k);
  }

  async selfPhoto(ws: string, k: Key, photo: { simulated: true } | { simulated: false; file: string; mime: string }) {
    this.act(ws, c => {
      const d = c.D[k];
      if (!['transit', 'asked', 'photo'].includes(d.status)) fail('The proof has already gone to the buyer');
      c.tick();
      this.photoIn(c, d, photo, 'owner', k === 'b' ? 'Sundaram, Bhosari' : `${d.sh}'s dock`);
      d.status = 'photo'; d.selfShot = true; d.shotAt = c.ap(); c.w.t0 = Date.now();
      c.log(d, `You photographed the stamped challan at ${d.sh}'s dock`);
    });
    await this.read(ws, k);
  }

  private photoIn(c: Ctx, d: StoredDispatch, photo: { simulated: true } | { simulated: false; file: string; mime: string }, source: string, place: string) {
    this.store.addPhoto({ id: randomUUID(), ws: c.id, k: d.k, source, simulated: photo.simulated ? 1 : 0, mime: photo.simulated ? null : photo.mime, file: photo.simulated ? null : photo.file, place });
    this.store.putReadings(c.id, d.k, 'scripted', 'pending', null);
  }

  /** AI read. Simulated shots use the scripted reader; real photos use Claude when configured. */
  private async read(ws: string, k: Key) {
    const p = this.store.latestPhoto(ws, k)!;
    const d = this.hydrate(ws, this.store.dispatches(ws).find(x => x.k === k)!);
    let res: ReadResult, engine = 'scripted';
    try {
      if (!p.simulated && p.file && this.opts.read && this.opts.loadPhoto) { engine = 'claude'; res = await this.opts.read(d, this.opts.loadPhoto(p.file), p.mime ?? 'image/jpeg') }
      else res = scriptedRead(d);
    } catch (e) {
      engine = 'scripted'; res = scriptedRead(d);
      console.warn('[reader] falling back to scripted reading:', (e as Error).message);
    }
    this.act(ws, c => {
      const x = c.D[k];
      if (res.recd && x.status === 'photo') x.recd = res.recd;
      this.store.putReadings(ws, k, engine, 'done', res.readings);
    });
  }

  readings(ws: string, k: Key) { return this.store.readings(ws, k) ?? { engine: 'scripted', status: 'none', data: null } }

  setReceived(ws: string, k: Key, qty: number) {
    return this.act(ws, c => {
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

  sendProof(ws: string, k: Key) {
    return this.act(ws, c => {
      const d = c.D[k];
      if (d.status !== 'photo') fail('Nothing to send yet');
      if (this.store.readings(ws, k)?.status !== 'done') fail('Razorpay is still reading the challan');
      c.tick(); d.status = 'proof'; d.proofAt = c.ap();
      const e = this.emailFor(c.full(k)); e.sentAt = c.now();
      this.store.addEmail(ws, k, e);
      c.log(d, `Proof emailed to ${d.email}: stamped challan, invoice${d.newB ? ', account letter' : ''}. Booking unconfirmed`);
      if (cn(d)) {
        c.log(d, `Draft credit note for ${inr(d.qty - d.recd)} ${d.unit} sent to ${CLERK} to post in Tally`);
        this.later(2600, () => this.clerkPostsCN(ws, k));
      }
    });
  }

  /** Meena, the clerk, posts the credit note in Tally. */
  private clerkPostsCN(ws: string, k: Key) {
    this.act(ws, c => {
      const d = c.D[k]; if (d.cnPosted) return;
      d.cnPosted = true; c.tick();
      const n = d.id.slice(3);
      c.log(d, `${CLERK} posted CN/${n} in Tally. Sent to ${d.sh}'s accounts`);
      this.store.addEmail(ws, k, { to: d.email, subject: `Credit note CN/${n} for ${invNo(d)}`, body: `Credit note for ${inr(d.qty - d.recd)} ${d.unit} damaged, ${R(cn(d))} + GST.`, attachments: [`CN-${n.replace('/', '-')}.pdf`], sentAt: c.now() });
      c.notify({ phone: 'p', app: 'rzp', title: `${CLERK} posted the credit note in Tally`, text: `CN/${n} for ${R(cn(d))} sent to ${d.sh}'s accounts.`, action: null });
    });
  }

  emailView(ws: string, k: Key): Email {
    const sent = this.store.emails(ws, k)[0];
    if (sent) return sent;
    const d = this.hydrate(ws, this.store.dispatches(ws).find(x => x.k === k) ?? fail('Not found', 404));
    return this.emailFor(d);
  }

  /* ---------- advance from the lender ---------- */
  offer(ws: string, k: Key, amount?: number): Offer {
    const d = this.store.dispatches(ws).find(x => x.k === k) ?? fail('Not found', 404);
    const cap = nowCap(d), options = offerOptions(d), a = amount && options.includes(amount) ? amount : cap, t2 = t2For(d, a);
    const charges = feeOf(d, a) + feeOf(d, t2);
    return { k, nowCap: cap, options, amount: a, t2, charges, apr: apr(d), repay: a + t2 + charges, yours: payable(d) - a - t2 - charges };
  }

  takeAdvance(ws: string, k: Key, amount: number) {
    return this.act(ws, c => {
      const d = c.D[k];
      if (d.status !== 'proof') fail('The advance is available after the proof is sent');
      const o = this.offer(ws, k, amount);
      if (o.amount !== amount) fail('Pick one of the offered amounts', 400);
      const outstanding = this.store.loans(ws).filter(l => l.status === 'disbursed').reduce((s, l) => s + l.amount, 0);
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
    this.store.addLoan(c.id, d.k, 1, d.amt, d.charges, c.now());
    this.store.addTxn(c.id, { who: LENDER, what: `Advance · ${d.id}`, amt: d.amt, ini: 'KF' });
    c.log(d, `${R(d.amt)} paid by ${LENDER} to ${MERCHANT.bank}. Charges ${R(d.charges)}${d.t2Pending ? `. ${R(d.t2)} more when QC clears` : ''}`);
    c.notify({ phone: 'p', app: 'bank', title: `${R(d.amt)} credited`, text: `${MERCHANT.bank} · ${LENDER} via Razorpay Capital · ${d.id}`, action: null }, 400);
  }

  skipAdvance(ws: string, k: Key) {
    const d = this.store.dispatches(ws).find(x => x.k === k) ?? fail('Not found', 404);
    if (d.status !== 'proof') fail('Nothing to skip');
    if (!d.newB) this.later(3200, () => { try { this.bookAck(ws, k) } catch { /* already booked */ } });
  }

  /* ---------- the buyer (simulated: they reply to the email) ---------- */
  bookAck(ws: string, k: Key) {
    return this.act(ws, c => {
      const d = c.D[k];
      if (d.booked || ORD[d.status] < 3) fail('Nothing to book');
      d.booked = true; c.tick(3); d.bookedAt = c.ap();
      c.log(d, `${d.sh}'s accounts replied: QC cleared, booked under GRN ${d.grn}`);
      let t2txt = '';
      if (d.t2Pending) {
        const f = feeOf(d, d.t2);
        d.amt += d.t2; d.charges += f; d.t2Pending = false; c.w.bal += d.t2; c.w.adv_oct += d.t2;
        this.store.addLoan(ws, k, 2, d.t2, f, c.now());
        this.store.addTxn(ws, { who: LENDER, what: `Advance, second part · ${d.id}`, amt: d.t2, ini: 'KF' });
        c.log(d, `Second part ${R(d.t2)} paid by ${LENDER} after QC cleared`);
        t2txt = ` ${R(d.t2)} second part sent to ${MERCHANT.bank}.`;
      }
      c.notify({ phone: 'p', app: 'rzp', title: `${d.sh} booked ${invNo(d)}`, text: `QC cleared · GRN ${d.grn}.${t2txt}`, action: { view: 'dd', k } });
    });
  }

  buyerConfirms(ws: string, k: Key) {
    return this.act(ws, c => {
      const d = c.D[k]; if (d.status !== 'await') fail('Nothing to confirm');
      c.tick(40); d.booked = true; d.bookedAt = c.ap();
      c.log(d, `${d.sh}'s accounts confirmed receipt, booked under GRN ${d.grn} and approved account ••${last4(d.va)}`);
      d.vaNote = `Approved by ${d.sh}'s accounts on 12 Oct`;
      this.disburse(c, d);
    });
  }

  /** Jump to the due date: the buyer pays into the merchant's account and the standing instruction repays the lender. */
  buyerPays(ws: string, k: Key) {
    const d0 = this.store.dispatches(ws).find(x => x.k === k) ?? fail('Not found', 404);
    if (!['proof', 'adv'].includes(d0.status)) fail(`Send the proof to ${d0.sh} first`);
    if (!d0.booked) this.bookAck(ws, k);
    return this.act(ws, c => {
      const d = c.D[k];
      c.w.date = d.due; c.w.min = 10 * 60 + 5; d.status = 'paid';
      const rel = relOf(c.full(k));
      c.w.bal += rel;
      this.store.repayLoans(ws, k, c.now());
      this.store.addTxn(ws, { who: d.buyer.replace(/ (Pvt )?Ltd$/, ''), what: `${d.amt ? 'Your share after repaying the advance' : 'Paid in full'} · ${d.id}`, amt: rel, ini: d.sh.split(' ').map(x => x[0]).join('').slice(0, 2) });
      c.log(d, `${d.sh} paid ${R(payable(d))} + GST by RTGS into ••${last4(d.va)}. Matched to ${invNo(d)}`);
      if (d.amt) c.log(d, `Your bank sent ${R(d.amt + d.charges)} to ${LENDER}. ${R(rel)} + GST stays with you`);
      c.notify({ phone: 'p', app: 'rzp', title: `${d.sh} paid ${R(payable(d))} + GST`, text: d.amt ? `${R(d.amt + d.charges)} repaid to ${LENDER}. ${R(rel)} + GST is yours.` : `All of it is yours. Matched to ${invNo(d)}.`, action: { view: 'dd', k } }, 400);
    });
  }

  loans(ws: string) { return this.store.loans(ws) }
}

export type { Phone };
