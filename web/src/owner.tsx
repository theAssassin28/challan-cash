import { useEffect, useRef, useState } from 'react';
import {
  CLERK, LENDER, R, apr, cn, feeOf, inr, inv, last4, maxAdv, nowCap, offerOptions, payable, pctLabel, relOf, t2For,
  type Dispatch, type Key, type Reading, type Txn,
} from '@cc/shared';
import { Bd, Card, Icon, Info, Kv, Photo, Pill, Sec } from './bits';
import {
  D, S, askDriver, ownerPhoto, bookAck, buyerConfirms, go, jump, markRevealed, notOnBooks, openD, openSheet, ord, outside, remind, retake,
  selfPhoto, sendProof, setOffer, skipAdv, takeAdv, tryPath, useUI, type View,
} from './state';
import { api } from './api';

const NAV: [View, string, string, string][] = [['home', 'Home', 'n-home', 'n-home-on'], ['tx', 'Transactions', 'n-tx', 'n-tx'], ['prod', 'Products', 'n-prod', 'n-prod-on'], ['store', 'Storefront', 'n-store', 'n-store']];
export const Nav = ({ on }: { on: View }) => (
  <nav className="nav">{NAV.map(([k, l, a, b]) => (
    <button key={k} className={on === k ? 'on' : ''} onClick={() => go(k)}><svg style={k === 'tx' ? { width: 13.5 } : undefined}><use href={`#${on === k ? b : a}`} /></svg><span>{l}</span></button>
  ))}</nav>
);
const Back = ({ to }: { to: View }) => <button className="bk" onClick={() => go(to)} aria-label="Back"><Icon id="i-back" w={7.5} h={12} /></button>;
const RecRow = ({ p }: { p: Txn }) => (
  <div className="hrow"><div className="avm">{p.ini}</div><div className="tx" style={{ marginLeft: 13 }}><h4>{p.who}</h4><p>{p.what}</p></div>
    <div className="amt" style={p.amt < 0 ? { color: 'var(--mut)' } : undefined}>{p.amt < 0 ? '−' : ''}{R(Math.abs(p.amt))}</div></div>
);
const dcRef = (d: Dispatch) => d.id.slice(3).replace('2610/', 'DC ');

/* ---------- home and other tabs ---------- */
export function Home() {
  const s = S(), L = notOnBooks(), tot = L.reduce((a, d) => a + inv(d), 0), ph = Object.values(s.dispatches).find(d => d.status === 'photo');
  return (
    <section className="view on" id="v-home">
      <div className="scroll">
        <div className="hhead">
          <div className="av">S</div>
          <div className="nm">Shree Ganesh</div>
          <div className="bl">Balance <span style={{ fontSize: 11 }}>₹</span> <b>{inr(s.bal)}</b><small>.00</small></div>
          <button className="s" onClick={() => outside('Search')} aria-label="Search"><Icon id="i-search" style={{ width: 19, height: 19 }} /></button>
          <button className="k" onClick={() => outside('Settings')} aria-label="Settings"><Icon id="i-kebab" style={{ width: 5.5, height: 20.5 }} /></button>
        </div>
        <button className="acard" onClick={() => go('disp')}>
          <h3>Dispatches</h3>
          <p>{ph ? `${ph.drv} sent the stamped challan for ${ph.sh}. Check it and send it to their accounts.`
            : L.length ? <><b>{R(tot)}</b> delivered, proof still on paper. {L.length} stamped challan{L.length > 1 ? 's are' : ' is'} with drivers.</>
              : `Every buyer has its proof. ${R(s.advOct)} advanced to you in October.`}</p>
          <div className="go"><span>{ph ? 'Review' : 'Open'}</span><Icon id="i-arrow" w={15} h={10} style={{ color: '#87b1ed' }} /></div>
          <svg className="doc"><use href="#i-doc" /></svg>
        </button>
        <div className="wgap" /><div className="ggap" />
        <div className="hsec" style={{ paddingBottom: 4 }}>
          <div className="lbl">ACCEPT PAYMENTS</div><div style={{ height: 11.8 }} />
          <button className="hrow" onClick={() => outside('Payment Link')}><div className="ic"><svg><use href="#i-link" /></svg></div><div className="tx"><h4>Payment Link</h4><p>Send links to your customers and get paid</p></div></button>
          <button className="hrow" onClick={() => outside('Payment Pages')}><div className="ic"><svg><use href="#i-pages" /></svg></div><div className="tx"><h4>Payment Pages</h4><p>Create your custom branded page</p></div></button>
          <button className="hrow" onClick={() => go('disp')}><div className="ic"><svg><use href="#i-truck" /></svg></div><div className="tx"><h4>Dispatches<span className="newp">NEW</span></h4><p>Photo of the stamped challan, paid the same day</p></div></button>
        </div>
        <div className="ggap" />
        <div className="hsec" style={{ paddingTop: 22, paddingBottom: 70 }}>
          <div className="lbl">RECENT TRANSACTIONS</div><div style={{ height: 12 }} />
          {s.pays.slice(0, 4).map((p, i) => <RecRow key={i} p={p} />)}
        </div>
      </div>
      <div className="help" onClick={() => openSheet('help')}><svg><use href="#i-help" /></svg>Help</div>
      <Nav on="home" />
    </section>
  );
}
export const Tx = () => (
  <section className="view on" id="v-tx"><div className="thead"><h2>Transactions</h2></div>
    <div className="scroll"><div className="txlist">{S().pays.map((p, i) => <RecRow key={i} p={p} />)}</div></div><Nav on="tx" /></section>
);
export const Prod = () => (
  <section className="view on" id="v-prod"><div className="thead"><h2>Products</h2></div>
    <div className="scroll" style={{ background: 'var(--gap)' }}><div className="hsec" style={{ paddingBottom: 10 }}>
      <div className="lbl" style={{ paddingTop: 6 }}>GET PAID</div><div style={{ height: 8 }} />
      <button className="hrow" onClick={() => outside('Payment Link')}><div className="ic"><svg><use href="#i-link" /></svg></div><div className="tx"><h4>Payment link</h4><p>One-time links for a specific customer</p></div></button>
      <button className="hrow" onClick={() => outside('Payment Pages')}><div className="ic"><svg><use href="#i-pages" /></svg></div><div className="tx"><h4>Payment Pages</h4><p>Your branded page for products and services</p></div></button>
      <button className="hrow" onClick={() => go('disp')}><div className="ic"><svg><use href="#i-truck" /></svg></div><div className="tx"><h4>Dispatches</h4><p>Stamped challan to buyer's accounts, and an advance</p></div></button>
    </div></div><Nav on="prod" /></section>
);
export const Store = () => (
  <section className="view on" id="v-store"><div className="thead"><h2>Storefront</h2></div>
    <div className="scroll"><div style={{ margin: 4, height: 140, background: '#f2f4f8', display: 'grid', placeItems: 'center', font: '700 15px Roboto', color: '#475672' }}>Create your first store</div></div><Nav on="store" /></section>
);

/* ---------- dispatch list ---------- */
export function phase(d: Dispatch): [string, string] {
  switch (d.status) {
    case 'transit': return d.stale ? ['Day 4 with ' + d.drv, 'r'] : ['With ' + d.drv, 'n'];
    case 'asked': return ['Photo asked', 'y'];
    case 'photo': return ['Photo to check', 'y'];
    case 'proof': return d.booked ? ['Booked by buyer', ''] : ['Proof sent', 'n'];
    case 'await': return ['Buyer to confirm', 'y'];
    case 'adv': return d.t2Pending ? ['50% advanced', 'g'] : ['Advance paid', 'g'];
    case 'paid': return ['Closed', 'g'];
  }
}
export function Disp() {
  const s = S(), all = Object.values(s.dispatches), L = notOnBooks(), tot = L.reduce((a, d) => a + inv(d), 0), on = all.filter(d => ord(d) >= 3);
  const row = (d: Dispatch) => { const p = phase(d); return <Kv key={d.k} l={<><b>{d.sh}</b><Pill t={p[0]} c={p[1]} /></>} v={R(ord(d) >= 2 ? payable(d) : inv(d))} sub={`${d.id} · ${inr(d.qty)} ${d.unit} · due ${d.due}`} on={() => openD(d.k)} act={'d-' + d.k} /> };
  return (
    <section className="view on" id="v-disp">
      <div className="phead"><Back to="home" /><h2>Dispatches</h2><span className="rt">{s.date.toUpperCase()}</span></div>
      <div className="pbody">
        <Sec t="Your dispatches">
          <button className="card balcard" onClick={() => openSheet('notOnBooks')}><div className="balbox"><svg><use href="#i-bal" /></svg></div><div className="t"><div className="lb">Delivered, proof still on paper</div><div className="am">₹ <b>{inr(tot)}</b><small>.00</small></div></div></button>
          <button className="card balcard" onClick={() => openSheet('advOct')}><div className="balbox"><svg><use href="#i-bal" /></svg></div><div className="t"><div className="lb">Advanced to you in October</div><div className="am">₹ <b>{inr(s.advOct)}</b><small>.00</small></div></div></button>
          <Info>Buyers book an invoice when their accounts team can match it to the stamped copy. Their payment run follows the booking.</Info>
        </Sec>
        {L.length ? <Sec t={`Waiting on paper (${L.length})`}><Card>{L.map(row)}</Card></Sec> : null}
        {on.length ? <Sec t={`Proof with buyers (${on.length})`}><Card>{on.map(row)}</Card></Sec> : null}
      </div>
    </section>
  );
}

/* ---------- one dispatch ---------- */
function Hero({ d }: { d: Dispatch }) {
  const s = ord(d), tot = s >= 2 ? payable(d) : inv(d), paid = s >= 5 ? (d.amt || 0) + relOf(d) : s >= 4 ? d.amt : 0, fee = s >= 5 ? (d.charges || 0) : 0;
  const books = s >= 3 ? tot - paid - fee : 0, nob = s < 3 ? tot : 0, w = (x: number) => (x / tot * 100).toFixed(1) + '%', p = phase(d);
  return (
    <div className="jhero">
      <div className="t"><span>{s >= 2 ? 'Buyer owes, before GST' : 'Invoice, before GST'} · {d.id}</span><Pill t={p[0]} c={p[1] || 'n'} /></div>
      <button className="a" onClick={() => openSheet('total')}>{R(tot)}{cn(d) && s >= 2 ? <small>after {R(cn(d))} shortage</small> : null}<Icon id="i-chev" w={7} h={12} style={{ color: '#fff', opacity: 0.6 }} /></button>
      <div className="bar"><i style={{ width: w(paid), background: '#4cc38a' }} /><i style={{ width: w(books), background: '#6ea1f5' }} /><i style={{ width: w(fee), background: '#8a91a3' }} /></div>
      <div className="lg">
        <button onClick={() => openSheet('total')}><span className="dot" style={{ background: '#4cc38a' }} />Paid to you <b>{R(paid)}</b></button>
        <button onClick={() => openSheet('total')}><span className="dot" style={{ background: '#6ea1f5' }} />With buyer <b>{R(books)}</b></button>
        <button onClick={() => openSheet('total')}><span className="dot" style={{ background: '#4a5470' }} />On paper <b>{R(nob)}</b></button>
      </div>
    </div>
  );
}

function DriverLink({ d }: { d: Dispatch }) {
  const [l, setL] = useState<{ token: string; url: string } | null>(null);
  useEffect(() => { void api.link(d.k).then(setL).catch(() => setL(null)) }, [d.k, d.status]);
  if (!l) return null;
  return <button className="lnk" onClick={() => openSheet('link', l.token)}>Open the driver's link on a real phone</button>;
}

function Action({ d }: { d: Dispatch }) {
  const f = d.sh, rel = relOf(d);
  const repay = `On ${d.due}, ${f} pays ${R(payable(d))} + GST into your account ••${last4(d.va)}. Your bank sends ${R(d.amt + d.charges)} to ${LENDER} under your repayment instruction. ${R(rel)} + GST stays with you.`;
  switch (d.status) {
    case 'transit':
      if (d.stale) return <div className="acta warn"><h3>Day 4: the stamped copy is still with {d.drv}</h3><p>Delivered 9 Oct, due 8 Nov. {f}'s accounts team cannot book {R(inv(d))} without the stamped copy, so their payment run is likely to miss the due date. At hundi rates the wait costs about {R(inv(d) * 0.025 / 30)} a day.</p><button className="btn pri" data-act="ask" onClick={askDriver}>Ask {d.drv} for the photo on WhatsApp</button></div>;
      if (d.newB) return <div className="acta"><h3>You are at {f}'s dock</h3><p>First delivery to {f}. Unloading is done and the gatekeeper has stamped the receiver's copy. Take the photo before {d.drv} leaves with it.</p><button className="btn pri" data-act="self" onClick={selfPhoto}>Take the photo</button><UploadBtn k={d.k} cls="btn">Upload a photo or scan</UploadBtn></div>;
      return <div className="acta"><h3>Unloaded at {f}, 11:44</h3><p>{d.drv} has the stamped copy. It usually takes 4 to 7 days to come back, and {f}'s accounts team waits for it before booking the invoice.</p><button className="btn pri" data-act="ask" onClick={askDriver}>Ask {d.drv} for the photo on WhatsApp</button><button className="lnk" onClick={selfPhoto}>I am at the dock. Take it myself</button><br /><UploadBtn k={d.k} cls="lnk">Upload a photo or scan instead</UploadBtn></div>;
    case 'asked': return <div className="acta"><h3>Waiting for {d.drv}'s photo</h3><p>Link sent on WhatsApp at {d.askedAt}. It opens his camera. No app or login.</p><button className="btn" onClick={remind}>Remind on WhatsApp</button><DriverLink d={d} /></div>;
    case 'photo': return <div className="acta okk"><h3>{d.selfShot ? 'Photo taken' : d.drv + ' sent the photo'} · {d.shotAt}</h3><p>Razorpay has read it. Check it before it goes to {f}'s accounts team.</p><button className="btn pri" data-act="review" onClick={() => go('chk')}>Check the challan</button></div>;
    case 'proof': {
      const nc = nowCap(d), t2 = t2For(d, nc);
      return <><div className="acta okk"><h3>Proof sent to {f}'s accounts</h3><p>Sent {d.proofAt} to {d.email}. {d.booked ? `Booked under GRN ${d.grn} at ${d.bookedAt}.` : 'Booking unconfirmed until their accounts team acknowledges.'}{cn(d) && !d.cnPosted ? ` Credit note waiting for ${CLERK} to post in Tally.` : ''}</p></div>
        <div className="acta"><h3>Get {R(nc)} now{t2 ? `, ${R(t2)} more when QC clears` : ''}</h3><p>{pctLabel(d)} flat. A loan from {LENDER} through Razorpay Capital, repaid from {f}'s payment into your account.</p><button className="btn pri" data-act="offer" onClick={() => go('adv')}>See the offer</button><button className="lnk mut" data-act="jumpo" onClick={() => jump(d.k)}>Optional: skip it. Demo: jump to {d.due}, {f} pays in full</button></div></>;
    }
    case 'await': return <div className="acta warn"><h3>Waiting for {f} to confirm</h3><p>{R(d.amt)} is approved by {LENDER}. It is paid the moment {f}'s accounts team confirms receipt and approves your payment account. Usually within a day.</p><button className="btn" onClick={() => openSheet('mail')}>See what they received</button><button className="lnk mut" data-act="confirm" onClick={buyerConfirms}>Demo: {f} confirms</button></div>;
    case 'adv': return <div className="acta okk"><h3>{R(d.amt)} in your bank</h3><p>{d.elapsed ? `Photo to money in ${d.elapsed}. ` : ''}{d.t2Pending ? `${R(d.t2)} more is paid when ${f}'s QC clears. ` : ''}{repay}</p>{d.t2Pending ? <><button className="lnk mut" data-act="qc" onClick={() => bookAck(d.k)}>Demo: {f}'s QC clears now</button><br /></> : null}<button className="lnk mut" data-act="jump" onClick={() => jump(d.k)}>Optional · Demo: jump to {d.due}, {f} pays</button></div>;
    case 'paid': return <div className="acta okk"><h3>Closed on {d.due}</h3><p>{f} paid {R(payable(d))} + GST into ••{last4(d.va)} on their payment run. {d.amt ? `Your bank sent ${R(d.amt + d.charges)} to ${LENDER}. ${R(rel)} + GST is yours.` : 'All of it is yours. No advance, no charges.'} Razorpay matched the payment to INV/{d.id.slice(3)} and never held the money.</p><button className="btn" onClick={() => openSheet('record')}>Download the record</button></div>;
  }
}

/** Upload a real photo, PDF scan or image from the phone. */
export function UploadBtn({ k, cls, children }: { k: Key; cls: string; children: React.ReactNode }) {
  const ref = useRef<HTMLInputElement>(null);
  return <><button className={cls} onClick={() => ref.current?.click()}>{children}</button>
    <input ref={ref} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { useUI.setState({ camFor: k }); void ownerPhoto(f) } }} /></>;
}

function Steps({ d }: { d: Dispatch }) {
  const s = ord(d);
  const Row = ({ cls, t, amt, p, on }: { cls: string; t: string; amt?: string; p: string; on: () => void }) => (
    <button className={`stp ${cls}`} onClick={on}><span className="c" /><h4><span>{t}</span><span>{amt || ''}</span></h4><p>{p}</p></button>
  );
  const noAdv = s >= 5 && !d.amt;
  return (
    <div className="card steps">
      <Row cls="ok" t="Dispatched" amt={R(inv(d))} p={`${d.left} with ${d.drv} · invoice went with the goods`} on={() => openSheet('step', 'disp')} />
      <Row cls={s >= 2 ? 'ok' : s === 1 || !d.stale ? 'act' : 'hold'} t="Stamped at the gate" amt={d.note ? '960 of 1,000' : ''} p={s >= 2 ? `Photo ${d.shotAt} · subject to count and QC` : d.stale ? `Copy with ${d.drv} since 9 Oct` : `Copy with ${d.drv} at the dock`} on={() => openSheet('step', 'stamp')} />
      <Row cls={s >= 3 ? 'ok' : s === 2 ? 'act' : 'off'} t="Proof sent to accounts" amt={s >= 2 ? R(payable(d)) : ''} p={s >= 3 ? `Emailed ${d.proofAt}` : 'Stamped copy, invoice, any credit note'} on={() => openSheet('step', 'proof')} />
      <Row cls={d.booked ? 'ok' : s >= 3 ? 'act' : 'off'} t="Booked by buyer" p={d.booked ? `GRN ${d.grn} · QC cleared` : s >= 3 ? 'Waiting for accounts to acknowledge' : 'Their payment run follows this'} on={() => openSheet('step', 'book')} />
      <Row cls={noAdv ? 'off' : s >= 4 ? 'ok' : d.status === 'await' ? 'hold' : s === 3 ? 'act' : 'off'} t="Advance · optional" amt={d.amt ? R(d.amt) : noAdv ? '' : `up to ${R(maxAdv(d))}`}
        p={noAdv ? 'Not taken' : d.t2Pending ? `${R(d.amt)} paid · ${R(d.t2)} when QC clears` : s >= 4 ? `Paid ${d.advAt}${d.t2 ? ' in two parts' : ''}` : d.status === 'await' ? 'Approved, waiting for buyer' : d.newB ? '50% for a first delivery' : '50% now, the rest when QC clears'} on={() => openSheet('step', 'adv')} />
      <Row cls={s >= 5 ? 'ok' : 'off'} t={`${d.sh} pays`} amt={s >= 2 ? R(payable(d)) + ' + GST' : ''} p={s >= 5 ? `Paid ${d.due} into ••${last4(d.va)}` : `Due ${d.due} · MSME limit ${d.msme}`} on={() => openSheet('msme')} />
      <Row cls={s >= 5 ? 'ok' : 'off'} t="Balance to you" amt={d.amt ? R(relOf(d)) : s >= 5 ? R(payable(d)) : ''} p={s >= 5 ? (d.amt ? `Kept after repaying ${LENDER}` : 'Full amount, no charges') : 'After any advance and charges'} on={() => openSheet('step', 'pay')} />
    </div>
  );
}

const CASES: Record<Key, string> = { a: 'Endurance: the main flow', b: 'Sundaram: a new buyer, you take the photo', c: 'Pune Precision: stuck with the driver' };
export function NextCases({ k }: { k: Key }) {
  return <div className="acta"><h3>Try another case</h3><p>Each one starts fresh.</p>{(Object.keys(CASES) as Key[]).filter(x => x !== k).map(x => <button key={x} className="btn" data-act={'case-' + x} onClick={() => tryPath(x)}>{CASES[x]}</button>)}</div>;
}
export { CASES };

export function DD() {
  const d = D(), newPending = d.newB && ord(d) < 4, log = [...d.log].reverse();
  return (
    <section className="view on" id="v-dd">
      <div className="phead"><Back to="disp" /><h2>{d.sh}</h2><span className="rt">{dcRef(d)}</span></div>
      <div className="pbody" id="dd-body" style={{ paddingTop: 0 }}>
        <Hero d={d} />
        <div className="psec" style={{ paddingTop: 12 }}><Action d={d} /></div>
        <Sec t="Steps"><Steps d={d} /></Sec>
        <Sec t="Buyer"><Card>
          <Kv l={<b>{d.buyer}</b>} v="" sub={`${d.site} · ${d.hist}`} />
          <Kv l="Payment due" v={d.due} cls="dk" sub={`${d.terms} days from acceptance on ${d.acc} · MSME limit ${d.msme}`} on={() => openSheet('msme')} />
          <Kv l="Pays into" v={<>••{last4(d.va)}<Pill t={newPending ? 'New' : 'Approved'} c={newPending ? 'y' : 'g'} /></>} sub={d.vaNote} on={() => openSheet('acct')} />
          <Kv l="Accounts email" v={d.email} on={() => openSheet('mail')} />
        </Card></Sec>
        <Sec t="Record"><Card>
          {log.slice(0, 4).map((l, i) => <Kv key={i} l={l.text} v="" sub={l.at} />)}
          {d.log.length > 4 ? <Kv l={<span style={{ color: 'var(--btnt)', fontWeight: 700 }}>View all {d.log.length} steps</span>} v="" on={() => openSheet('record')} /> : null}
        </Card><Info>Time-stamped and cannot be edited. Corrections are added as new entries.</Info></Sec>
      </div>
    </section>
  );
}

/* ---------- check what Razorpay read ---------- */
export function Chk() {
  const d = D(), revealed = useUI(u => !!u.revealed[d.k]);
  const [rd, setRd] = useState<{ status: string; engine: string; data: Reading[] | null } | null>(null);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let stop = false;
    const poll = () => api.readings(d.k).then(r => { if (stop) return; setRd(r); if (r.status === 'pending') setTimeout(poll, 800) }).catch(() => {});
    void poll();
    return () => { stop = true };
  }, [d.k, d.photo?.url, d.shotAt]);
  const rs = rd?.status === 'done' ? rd.data ?? [] : [];
  const placeholder = rs.length ? rs : PLACEHOLDER;
  useEffect(() => {
    if (revealed || !rs.length) return;
    if (shown >= rs.length) { markRevealed(d.k); return }
    const t = setTimeout(() => setShown(shown + 1), shown === 0 ? 700 : 520);
    return () => clearTimeout(t);
  }, [revealed, rs.length, shown, d.k]);
  const done = revealed;
  const [flash, setFlash] = useState(false);
  useEffect(() => { if (done && d.recd !== d.qty && shown) setFlash(true) }, [done]);
  return (
    <section className="view on" id="v-chk">
      <div className="phead"><Back to="dd" /><h2>Check challan</h2><span className="rt">{dcRef(d)}</span></div>
      <div className="pbody">
        <Sec style={{ paddingBottom: 14 }}><div className={`photo${done ? '' : ' scan'}`} onClick={() => openSheet('photo')}><Photo d={d} hl /><span className="zoom">Tap to zoom</span></div></Sec>
        <Sec t="What Razorpay read">
          {done ? null : <div className="reading"><span className="spin" style={{ display: 'inline-block', width: 13, height: 13, borderRadius: '50%', border: '2px solid #dbe2ee', borderTopColor: 'var(--link)', animation: 'sp .7s linear infinite' }} />{rd?.engine === 'claude' || (d.photo?.url && rd?.status === 'pending') ? 'Reading the photo with AI…' : 'Reading the challan…'}</div>}
          <div className="card rd">{placeholder.map((r, i) => {
            const on = done || i < shown;
            return <Kv key={i} id={'rd' + i} cls2={on ? '' : 'wait'} l={<>{r.label} · <b>{r.value}</b></>} v={on ? <Pill t={r.verdict} c={r.tone} /> : <span className="spin" />} sub={on ? r.detail : undefined} />;
          })}</div>
        </Sec>
        {done ? <>
          <Sec t={`Received at ${d.sh}`}><Card>
            <Kv l="Received" v={`${inr(d.recd)} of ${inr(d.qty)}`} on={() => openSheet('qty')} cls="dk" sub={d.recd !== d.qty ? 'From the pen note. Tap to change' : 'Tap to change'} id="k-qty" cls2={flash ? 'flash' : ''} />
            <Kv l={'Invoice INV/' + d.id.slice(3)} v={R(inv(d))} cls="dk" sub="Before GST" />
            {cn(d) ? <Kv l={`Draft credit note · ${inr(d.qty - d.recd)} damaged`} v={'−' + R(cn(d))} cls="dk" sub={`Goes to ${CLERK} to post in Tally before it is sent`} /> : null}
            <Kv l={<b>{d.sh} owes you</b>} v={R(payable(d))} cls="dk" sub={`+ GST · due ${d.due}`} />
          </Card></Sec>
          <Sec t={`Goes to ${d.sh}'s accounts`}>
            <Card>
              <Kv l="To" v={d.email} on={() => openSheet('mail')} sub={'Stamped challan, invoice' + (cn(d) ? ', credit note to follow' : '') + (d.newB ? ', account letter' : '')} />
              <Kv l="Pays into" v={`••${last4(d.va)}`} on={() => openSheet('acct')} sub={d.newB ? 'New account. Letter attached' : 'Already approved by ' + d.sh} />
            </Card>
            {d.status === 'photo' ? <><button className="btn pri" data-act="send" onClick={sendProof}>Send proof to {d.sh}</button><button className="btn" onClick={retake}>{d.selfShot ? 'Retake photo' : 'Ask ' + d.drv + ' to retake'}</button></> : null}
          </Sec>
        </> : null}
      </div>
    </section>
  );
}
const PLACEHOLDER: Reading[] = ['Stamp', 'Condition', 'Signature', 'Place', 'Pen note'].map(label => ({ label, value: '…', detail: '', verdict: '', tone: 'n' }));

/* ---------- the advance offer ---------- */
export function Adv() {
  const d = D(), sel = useUI(u => u.offer[d.k]), nc = nowCap(d), opts = offerOptions(d), a = sel && opts.includes(sel) ? sel : nc;
  const t2 = t2For(d, a), fee = feeOf(d, a) + feeOf(d, t2);
  return (
    <section className="view on" id="v-adv">
      <div className="phead"><Back to="dd" /><h2>Get paid now</h2><span className="rt">{dcRef(d)}</span></div>
      <div className="pbody" style={{ paddingTop: 0 }}>
        <div className="jhero"><div className="t"><span>{d.sh} owes you · due {d.due}</span><Pill t="Proof sent" c="g" /></div><div className="a" style={{ cursor: 'default' }}>{R(payable(d))}<small>+ GST</small></div>
          <div style={{ font: '400 12px/17px Lato', color: '#c1c4c9', marginTop: 4 }}>{d.newB ? `Up to 50% for a first delivery, once ${d.sh} confirms.` : `The gate receipt is subject to QC, so ${LENDER} pays 50% now and the rest when QC clears.`} Your approved limit: ₹6,00,000.</div></div>
        <Sec t="How much now">
          <div className="seg" style={{ marginTop: 0 }}>{opts.map(o => <button key={o} className={a === o ? 'on' : ''} onClick={() => setOffer(d.k, o)}>{R(o)}{o === nc ? ' · max' : ''}</button>)}</div>
          <Card style={{ marginTop: 12 }}>
            <Kv l={<b>You get now</b>} v={R(a)} cls="dk" sub="HDFC Bank ••4412 · usually within minutes" />
            {t2 ? <Kv l="When QC clears" v={R(t2)} cls="dk" sub="Paid automatically. No new request" /> : null}
            <Kv l="Charges, flat" v={R(fee)} cls="dk" sub={`${pctLabel(d)} on each part, plus tax`} />
            <Kv l="Yearly rate" v={`about ${apr(d)}%`} cls="dk" sub="Lender's exact APR is in the KFS. Hundi at 2.5% a month is about 30%" />
            <Kv l={`On ${d.due} your bank repays`} v={R(a + t2 + fee)} cls="dk" sub={`From ••${last4(d.va)} when ${d.sh} pays, by your instruction`} />
            <Kv l={`Yours on ${d.due}`} v={R(payable(d) - a - t2 - fee) + ' + GST'} cls="dk" />
            <Kv l="Key fact statement" v="" on={() => openSheet('kfs')} />
          </Card>
          <Info>This is a loan to you from {LENDER}. If {d.sh} pays less, late or to another account, you repay the gap.</Info>
          {d.status === 'proof' ? <><button className="btn pri" data-act="take" onClick={takeAdv}>Get {R(a)} now</button><button className="btn" onClick={skipAdv}>Not now. Keep the proof only</button></> : null}
        </Sec>
      </div>
    </section>
  );
}
