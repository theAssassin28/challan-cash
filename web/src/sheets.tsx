import { useEffect, useState } from 'react';
import {
  CLERK, LENDER, R, apr, cn, feeOf, inr, inv, last4, nowCap, offerOptions, payable, pctLabel, relOf, t2For, type Email,
} from '@cc/shared';
import { Card, Html, Info, Kv, Photo } from './bits';
import { api } from './api';
import { D, S, bioOk, closeSheet, notOnBooks, openD, ord, setQty, snack, useUI } from './state';

export function SheetBody({ kind, arg }: { kind: string; arg?: string }) {
  switch (kind) {
    case 'notOnBooks': return <NotOnBooks />;
    case 'advOct': return <AdvOct />;
    case 'total': return <Total />;
    case 'step': return <Step w={arg!} />;
    case 'msme': return <Msme />;
    case 'acct': return <Acct />;
    case 'mail': return <Mail />;
    case 'record': return <Record />;
    case 'photo': return <PhotoSheet />;
    case 'qty': return <Qty />;
    case 'kfs': return <Kfs />;
    case 'bio': return <Bio />;
    case 'help': return <Help />;
    case 'link': return <LinkSheet token={arg!} />;
    default: return null;
  }
}

function NotOnBooks() {
  const L = notOnBooks();
  return <><h3>Proof still on paper</h3><div className="sub">Delivered, but the stamped copy has not reached the buyer's accounts team, so the invoice is not booked yet.</div>
    <Card>{L.length ? L.map(d => <Kv key={d.k} l={<b>{d.sh}</b>} v={R(inv(d))} sub={`${d.id} · copy with ${d.drv}`} on={() => { closeSheet(); openD(d.k) }} />) : <Kv l="Nothing waiting" v="" />}</Card>
    <Info>At 2.5% a month in hundi interest, ₹9 lakh waiting on paper costs about ₹22,500 a month</Info></>;
}
function AdvOct() {
  const L = Object.values(S().dispatches).filter(d => d.amt && ord(d) >= 4);
  return <><h3>Advanced in October</h3><div className="sub">Loans from {LENDER} through Razorpay Capital, against delivered goods</div>
    <Card>{L.length ? L.map(d => <Kv key={d.k} l={<b>{d.sh}</b>} v={R(d.amt)} sub={`${d.id} · charges ${R(d.charges)}`} on={() => { closeSheet(); openD(d.k) }} />) : <Kv l="No advances yet" v="" />}</Card></>;
}
function Total() {
  const d = D(), s = ord(d);
  return <><h3>{R(s >= 2 ? payable(d) : inv(d))} + GST</h3><div className="sub">{d.id} · {d.buyer}. Amounts before GST. GST is as on the invoice and is not advanced.</div>
    <Card>
      <Kv l={'Invoice INV/' + d.id.slice(3)} v={R(inv(d))} sub={`${inr(d.qty)} ${d.unit} × ₹${d.rate}`} />
      {s >= 2 && cn(d) ? <Kv l={'Credit note CN/' + d.id.slice(3)} v={'−' + R(cn(d))} sub={`${inr(d.qty - d.recd)} damaged · ${d.cnPosted ? 'posted in Tally by ' + CLERK : 'waiting for ' + CLERK + ' to post in Tally'}`} /> : null}
      {d.amt ? <Kv l={`Advance from ${LENDER}`} v={R(d.amt)} sub={d.t2Pending ? `${R(d.t2)} more when QC clears` : ''} /> : null}
      {d.amt ? <Kv l="Charges" v={R(d.charges)} sub={`${pctLabel(d)} flat on each part`} /> : null}
      <Kv l="Paid to you" v={R(s >= 5 ? (d.amt || 0) + relOf(d) : s >= 4 ? d.amt : 0)} cls="ok" />
      <Kv l={s < 3 ? 'On paper' : 'Still to come'} v={R(s < 3 ? inv(d) : s >= 5 ? 0 : payable(d) - (d.amt || 0))} cls="dk" sub={s >= 5 ? '' : '+ GST'} />
    </Card></>;
}
function Step({ w }: { w: string }) {
  const d = D(), s = ord(d);
  const T: Record<string, [string, string]> = {
    disp: [`Dispatched ${d.left}`, `${inr(d.qty)} ${d.unit} on ${d.veh} with ${d.drv}. The GST invoice went with the goods, as the law requires.`],
    stamp: ['Stamped at the gate', s >= 2 ? `The gatekeeper stamped "Received subject to count and QC" and signed. This is a provisional receipt. Final acceptance comes after their QC. ${d.note ? 'Their storekeeper wrote: “' + d.note + '”.' : 'No changes written.'}` : `What ${d.sh}'s accounts team needs to match the invoice to their goods receipt. Until they see it, the invoice is not booked.`],
    proof: ['Proof sent to accounts', s >= 3 ? `Emailed ${d.proofAt} to ${d.email}: stamped challan and invoice${cn(d) ? ', with the credit note once ' + CLERK + ' posts it in Tally' : ''}. Without this, the copy would reach them around 20 Oct.` : "Razorpay emails the stamped challan, the invoice and any approved credit note to the buyer's accounts team."],
    book: ['Booked by buyer', d.booked ? `${d.sh}'s accounts team acknowledged at ${d.bookedAt}: QC cleared, booked under GRN ${d.grn}. Recorded from their reply, not from the photo.` : `Shown only when ${d.sh}'s accounts team acknowledges, for example with a goods-receipt number. Until then the status is Booking unconfirmed.`],
    adv: ['Advance', `Optional loan from ${LENDER}, an NBFC, arranged through Razorpay Capital. ${d.newB ? 'Up to 50% for a first delivery.' : '50% while the gate receipt is provisional, the rest when QC clears.'} ${pctLabel(d)} flat on each part, about ${apr(d)}% a year. You repay it even if the buyer pays less, late or elsewhere.`],
    pay: ['Balance to you', `${d.sh} pays account ••${last4(d.va)}, which is in your name. On that day your bank sends any advance and charges to ${LENDER} under your instruction, and the rest stays with you. Razorpay matches the payment to the invoice and shows the split. It never holds the money.`],
  };
  const t = T[w];
  return <><h3>{t[0]}</h3><div className="sub">{t[1]}</div>{w === 'stamp' && s >= 2 ? <div className="photo" onClick={closeSheet}><Photo d={d} /></div> : null}</>;
}
function Msme() {
  const d = D();
  return <><h3>Due {d.due}. MSME limit {d.msme}</h3><div className="sub">Shree Ganesh is a Udyam-registered micro enterprise. Under the MSMED Act, {d.sh} must pay within 45 days of acceptance, and a longer agreed term cannot extend it. Acceptance is the delivery day unless they object within 15 days. Buyers who pay late also lose the tax deduction for it until they pay (Income Tax Act, section 43B(h)).</div>
    <Card>
      <Kv l="Delivered and stamped" v={d.acc} cls="dk" sub={ord(d) >= 2 ? `Photo at ${d.shotAt} is your dated record` : 'Photo of the stamped copy becomes your dated record'} />
      <Kv l="Objection window ends" v={d.obj} cls="dk" />
      <Kv l="Agreed terms" v={`${d.terms} days · ${d.due}`} cls="dk" />
      <Kv l="Latest by law" v={d.msme} cls="dk" />
    </Card><Info>If the due date passes, Dispatches flags it and drafts a reminder that cites the Act</Info></>;
}
function Acct() {
  const d = D(), pend = d.newB && ord(d) < 4;
  return <><h3>{d.sh} pays into</h3><div className="sub">One account for every invoice to {d.sh}, in your legal name, so the name {d.sh}'s bank shows matches your vendor record.</div>
    <Card>
      <Kv l="Beneficiary" v="Shree Ganesh Corrugators" cls="dk" />
      <Kv l="Account number" v={d.va} cls="dk" />
      <Kv l="IFSC" v="RAZR0000001" cls="dk" />
      <Kv l="Name shown to payer" v="SHREE GANESH CORRUGATORS" cls="ok" sub="Checked when the account was set up" />
      <Kv l="Status" v={pend ? 'Not approved yet' : 'Approved by ' + d.sh} sub={d.vaNote} cls={pend ? 'hold' : 'ok'} />
      <Kv l="Repayment" v="Your instruction to your bank" cls="dk" sub={`Advance and charges go to ${LENDER} on the due date. Razorpay never holds the money.`} />
    </Card>
    {d.newB ? <div className="mail" style={{ marginTop: 10 }}><div className="fr">Confirmation letter, signed by Razorpay and by you</div>Account {d.va}, IFSC RAZR0000001, belongs to Shree Ganesh Corrugators (GSTIN 27ABKFS4471M1ZQ) and receives payments for all its invoices to {d.buyer}. Please verify by calling Prakash Patil on the number already in your vendor records, not a number in this letter.</div> : null}</>;
}
function Mail() {
  const d = D(), [e, setE] = useState<Email | null>(null);
  useEffect(() => { void api.email(d.k).then(setE).catch(() => {}) }, [d.k, d.status, d.cnPosted, d.recd]);
  return <><h3>What {d.sh}'s accounts team gets</h3><div className="sub">{e?.sentAt ? `Sent ${e.sentAt}. Delivery is tracked.` : 'Sent only after you approve it. Delivery is tracked.'}</div>
    {e ? <div className="mail"><div className="fr">From: Shree Ganesh Corrugators via Razorpay<br />To: {e.to}<br />Subject: {e.subject}</div>
      <Html html={e.body} /><div className="att">{e.attachments.map(a => <span key={a}>{a}</span>)}</div></div> : null}</>;
}
function Record() {
  const d = D();
  return <><h3>Record · {d.id}</h3><div className="sub">Time-stamped and cannot be edited</div>
    <Card>{[...d.log].reverse().map((l, i) => <Kv key={i} l={l.text} v="" sub={l.at} />)}</Card>
    <button className="btn pri" onClick={() => { closeSheet(); window.open(`/api/dispatches/${d.k}/record`, '_blank'); snack(`Record opened for PDF: challan photo, invoice, ${cn(d) ? 'credit note, ' : ''}${d.log.length} steps`) }}>Download as PDF</button></>;
}
function PhotoSheet() {
  const d = D();
  return <><h3>{d.id}</h3><div className="sub">{d.selfShot ? 'Your photo' : d.drv + "'s photo"} · {d.shotAt} · {d.photo?.place ?? ''}</div><div className="photo" style={{ cursor: 'default' }}><Photo d={d} hl /></div></>;
}
function Qty() {
  const d = D(), [v, setV] = useState(''), [err, setErr] = useState('');
  const opts = [...new Set([d.k === 'a' ? 960 : d.qty, d.qty, d.qty - 100, 0])];
  const save = async (q: number) => { if (!(await setQty(q))) setErr(q === 0 ? '' : `Enter a number from 1 to ${inr(d.qty)}`) };
  return <><h3>Received quantity</h3><div className="sub">What {d.sh} will pay for. A credit note covers the rest once {CLERK} posts it.</div>
    <div className="seg">{opts.map(q => <button key={q} className={d.recd === q ? 'on' : ''} onClick={() => save(q)}>{q === 0 ? 'Whole load rejected' : inr(q)}</button>)}</div>
    <label>Other</label><input className="inp" inputMode="numeric" placeholder="e.g. 975" value={v} onChange={e => setV(e.target.value)} />
    <div className="err">{err}</div><button className="btn pri" onClick={() => save(+v)}>Save</button></>;
}
const offerAmt = () => { const d = D(), sel = useUI.getState().offer[d.k], o = offerOptions(d); return sel && o.includes(sel) ? sel : nowCap(d) };
function Kfs() {
  const d = D(), a = offerAmt(), t2 = t2For(d, a);
  return <><h3>Key fact statement</h3><div className="sub">Shown before you accept. Issued by the lender.</div>
    <Card>
      <Kv l="Lender" v={`${LENDER} Ltd (NBFC, sample)`} cls="dk" />
      <Kv l="Arranged by" v="Razorpay Capital" cls="dk" sub="Lending service provider" />
      <Kv l="Amount" v={t2 ? `${R(a)} + ${R(t2)}` : R(a)} cls="dk" sub={t2 ? 'Second part when QC clears' : ''} />
      <Kv l="Total charges" v={R(feeOf(d, a) + feeOf(d, t2))} cls="dk" sub="Plus applicable tax. No other charges" />
      <Kv l="APR" v={`${apr(d)}%`} cls="dk" sub="Calculated by the lender" />
      <Kv l="Repay by" v={d.due} cls="dk" />
      <Kv l="Repaid from" v={`Your account ••${last4(d.va)}`} cls="dk" sub={`Your standing instruction, when ${d.sh} pays`} />
      <Kv l="If the buyer pays less, late or elsewhere" v="You repay" cls="dk" sub="e-NACH on HDFC ••4412 for any gap" />
      <Kv l="Cooling-off" v="Set by lender" cls="dk" sub="Sample: 3 days, pay only for days used" />
      <Kv l="Grievance" v={`${LENDER} nodal officer`} cls="dk" />
    </Card></>;
}
function Bio() {
  const d = D(), a = offerAmt(), t2 = t2For(d, a), [ok, setOk] = useState(false);
  const touch = () => { if (ok) return; setOk(true); void bioOk(a) };
  return <div className={`bio${ok ? ' ok' : ''}`} id="bio"><h3>Confirm with fingerprint</h3><div className="sub" style={{ margin: 0 }}>{R(a)} now{t2 ? ` + ${R(t2)} when QC clears` : ''} · {d.id}</div>
    <button id="bio-btn" onClick={touch} aria-label="Touch the fingerprint sensor"><svg><use href="#i-finger" /></svg></button><p>{ok ? 'Confirmed' : 'Touch the sensor'}</p></div>;
}
function Help() {
  return <><h3>Dispatches</h3><div className="sub">Get the stamped challan to your buyer's accounts the same day, and get paid against it.</div>
    <Card>
      <Kv l={<b>Why the photo matters</b>} v="" sub="Big buyers book an invoice only when accounts can match it to the stamped copy. Their payment run follows the booking." />
      <Kv l={<b>Who takes it</b>} v="" sub="Your driver, from a WhatsApp link. No app or login." />
      <Kv l={<b>What it costs</b>} v="" sub="Sending the proof is free. An advance costs a flat fee, shown before you accept." />
    </Card></>;
}
function LinkSheet({ token }: { token: string }) {
  const url = `${location.origin}/c/${token}`;
  return <><h3>Driver's link</h3><div className="sub">Scan with a phone on the same network to take or upload a real challan photo. It works once, for this challan only.</div>
    <div style={{ display: 'grid', placeItems: 'center', margin: '6px 0 10px' }}><img src={`/api/capture/${token}/qr.svg`} alt="QR code for the driver's link" width={180} height={180} /></div>
    <Card><Kv l="Link" v="" sub={url} /></Card>
    <button className="btn" onClick={() => { void navigator.clipboard?.writeText(url); snack('Link copied') }}>Copy link</button></>;
}
