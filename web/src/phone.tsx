import { useEffect, useMemo, useRef } from 'react';
import { inr, type Capture } from '@cc/shared';
import { Bd, Challan, Html, Icon, Sec } from './bits';
import { D, S, camClose, go, openCam, pickedFile, rSend, shoot, tapLink, useUI, waBack, waSend } from './state';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------- camera (Prakash at Sundaram's dock, or Ramesh at Endurance) ---------- */
export function Camera() {
  const phone = useUI(u => u.phone), camFor = useUI(u => u.camFor), d = D(camFor);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <section className="view on" id="v-cam">
      <div className="cam">
        <div className="top"><button onClick={camClose} aria-label="Close" style={{ width: 30, height: 30, display: 'grid', placeItems: 'center' }}><svg width="14" height="14" viewBox="0 0 14 14"><path d="M1 1l12 12M13 1 1 13" stroke="#fff" strokeWidth="2" /></svg></button><span>{d.id}</span><span>Flash auto</span></div>
        <div className="vf"><i className="corner c1" /><i className="corner c2" /><i className="corner c3" /><i className="corner c4" /><div style={{ width: '100%' }}><Challan d={d} /></div></div>
        <div className="tip">{phone === 'r' ? 'Fit the whole copy in the frame' : 'Fit the stamped copy in the frame'}<small>Include the stamp, signature and anything written by hand</small></div>
        <div className="cb">
          <button className="upl" onClick={() => ref.current?.click()} aria-label="Upload a photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 16l5-5 4 4 3-3 6 6" /><circle cx="15.5" cy="9" r="1.5" /></svg>Upload</button>
          <button className="shutter" id="shutter" onClick={shoot} aria-label="Take photo" />
          <span />
        </div>
        <input ref={ref} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pickedFile(f) }} />
      </div>
    </section>
  );
}

/* ---------- WhatsApp chat, on both phones ---------- */
export function WhatsApp() {
  const phone = useUI(u => u.phone), waWith = useUI(u => u.waWith), compose = useUI(u => u.compose);
  const with_ = phone === 'r' ? 'r' : waWith, c = S().chats[with_], me = phone;
  const n = phone === 'r' ? 'Prakash Patil' : with_ === 'r' ? 'Ramesh (Driver)' : 'Anil (Driver)';
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => { if (body.current) body.current.scrollTop = body.current.scrollHeight }, [c.length, phone]);
  return (
    <section className="view wa on" id="v-wa">
      <div className="wa-h"><button className="bk2" onClick={waBack} aria-label="Back"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M15 8H2M7.5 2.5 2 8l5.5 5.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
        <div className="av">{n[0]}</div><div style={{ minWidth: 0 }}><b>{n}</b><small>online</small></div></div>
      <div className="wa-b" id="wa-b" ref={body}>
        <div className="wa-day">TODAY</div>
        {c.map(m => {
          const out = m.f === me;
          return (
            <div key={m.id} className={`bub ${out ? 'out' : 'in'}`}>
              {m.link ? <button className={`lp${m.used ? ' used' : ''}`} onClick={() => tapLink(m.link!.token, m.used)}><em>rzp.io</em><b>{m.link.title}</b><span>{m.link.sub}</span></button> : null}
              <Html html={esc(m.t).replace(/(\S+\/c\/\S+)/, '<u>$1</u>')} />
              <div className="tm">{m.at}{out ? <> <svg width="16" height="10" viewBox="0 0 16 10"><path d="M1 5l3 3 6-7M6 8l1 1 7-8" fill="none" stroke="#53bdeb" strokeWidth="1.4" /></svg></> : null}</div>
            </div>
          );
        })}
      </div>
      <div className="wa-f"><div className="tx" id="wa-tx">{phone === 'p' && compose ? compose.text : ''}</div>
        <button className="snd" id="wa-snd" onClick={waSend} aria-label="Send"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" fill="#fff" /></svg></button></div>
    </section>
  );
}

/* ---------- Ramesh: chat list ---------- */
export function AList() {
  const rOpened = useUI(u => u.rOpened), c = S().chats.r, last = c[c.length - 1];
  const unread = S().dispatches.a.status === 'asked' && !rOpened;
  return (
    <section className="view on" id="v-alist">
      <div className="wa-h" style={{ paddingLeft: 14 }}><b style={{ fontSize: 19, fontWeight: 500 }}>WhatsApp</b></div>
      <div className="scroll wa-list" id="al-body" style={{ background: '#fff' }}>
        <button className={`row${unread ? ' hot' : ''}`} onClick={() => { useUI.setState({ rOpened: true, waWith: 'r' }); go('wa') }}><div className="av">P</div><div className="m"><b>Prakash Patil<small>{last.at}</small></b><p><span>{last.t.split('\n')[0]}</span>{unread ? <i>1</i> : null}</p></div></button>
        <div className="row" style={{ cursor: 'default' }}><div className="av">T</div><div className="m"><b>Chakan Tempo Union<small>10:12</small></b><p><span>Talegaon road closed tomorrow</span></p></div></div>
        <div className="row" style={{ cursor: 'default' }}><div className="av">G</div><div className="m"><b>Home<small>8:05</small></b><p><span>Did you eat?</span></p></div></div>
      </div>
    </section>
  );
}

/* ---------- the driver's capture page ---------- */
interface CaptureProps {
  info: Capture['dispatch'];
  merchant: string;
  driverName: string;
  step: 'intro' | 'shot' | 'sent';
  file: File | null;
  shot?: React.ReactNode;
  onCamera: () => void;
  onFile: (f: File) => void;
  onSend: () => void;
  onRetake: () => void;
  onDone?: () => void;
  busy?: boolean;
  /** On a real phone the camera button opens the phone camera directly. */
  nativeCamera?: boolean;
}
export function CaptureBody(p: CaptureProps) {
  const cam = useRef<HTMLInputElement>(null), gal = useRef<HTMLInputElement>(null);
  const url = useMemo(() => (p.file ? URL.createObjectURL(p.file) : null), [p.file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url]);
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) p.onFile(f) };
  const head = (
    <div className="rph"><small><Icon id="i-rzp" w={14} h={14} />Razorpay · for {p.merchant}</small><b>Photo of the stamped challan</b><span>For {p.info.buyer}, {p.info.site.split(',')[0]}</span></div>
  );
  const inputs = <><input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={pick} /><input ref={gal} type="file" accept="image/*" hidden onChange={pick} /></>;
  if (p.step === 'intro') return <>{head}<Sec>
    <Bd h={`${p.info.id} · ${p.info.sh}, ${p.info.site.split(',')[0]}`} p={`${inr(p.info.qty)} ${p.info.unit} · ${p.info.veh}`} />
    <div className="hi"><i>1</i><div>Keep the stamped, signed copy flat</div></div>
    <div className="hi"><i>2</i><div>Fit the whole page in the frame<small>Include anything written by hand</small></div></div>
    <div className="hi"><i>3</i><div>Still bring the original back to the factory</div></div>
    <button className="pbtn" data-act="cam" onClick={() => (p.nativeCamera ? cam.current?.click() : p.onCamera())}>Open camera</button>
    <button className="pbtn sec" onClick={() => gal.current?.click()}>Upload a photo</button>
    <div className="secure">No login. This link works once, only for this challan.</div>{inputs}
  </Sec></>;
  if (p.step === 'shot') return <>{head}<Sec>
    <div className="photo" style={{ cursor: 'default' }}>{url ? <img className="realphoto" src={url} alt="Your photo of the challan" /> : p.shot}</div>
    <div style={{ marginTop: 12 }}>{(url ? ['Photo ready', 'Razorpay reads the stamp, signature and any pen note'] : ['Whole page in the frame', 'Stamp is readable', 'Signature found', 'Place: Endurance gate 3']).map(x => <div key={x} className="hi"><i className="ok">✓</i><div>{x}</div></div>)}</div>
    <button className="pbtn" data-act="rsend" disabled={p.busy} onClick={p.onSend}>Send to Prakash</button>
    <button className="pbtn sec" onClick={() => (p.nativeCamera ? cam.current?.click() : p.onRetake())}>Retake</button>{inputs}
  </Sec></>;
  return <>{head}<Sec>
    <div className="okbig"><svg width="30" height="30" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
    <div style={{ textAlign: 'center', font: '700 16px Lato', color: 'var(--ink)' }}>Sent</div>
    <div style={{ textAlign: 'center', font: '400 12.5px/18px Lato', color: 'var(--mut)', marginTop: 6 }}>Prakash has the photo. Bring the original back too.</div>
    {p.onDone ? <button className="pbtn sec" onClick={p.onDone}>Back to WhatsApp</button> : null}
  </Sec></>;
}

/** Ramesh's browser, opened from the WhatsApp link inside the demo. */
export function Web() {
  const rp = useUI(u => u.rp), file = useUI(u => u.driverFile), busy = useUI(u => u.busy), d = S().dispatches.a;
  return (
    <section className="view on" id="v-web">
      <div className="brh"><button onClick={() => go('wa')} aria-label="Close" style={{ width: 28, height: 34, display: 'grid', placeItems: 'center' }}><svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1 1 11" stroke="#5f6368" strokeWidth="1.8" strokeLinecap="round" /></svg></button>
        <div className="url"><svg width="11" height="13" viewBox="0 0 11 13"><rect x="1" y="5.5" width="9" height="7" rx="1.3" fill="#5f6368" /><path d="M3 5.5V4a2.5 2.5 0 0 1 5 0v1.5" fill="none" stroke="#5f6368" strokeWidth="1.5" /></svg>rzp.io/c/{latest()}</div></div>
      <div className="scroll" id="web-body" style={{ background: 'var(--gap2)' }}>
        <CaptureBody info={d} merchant="Shree Ganesh Corrugators" driverName="Ramesh" step={rp} file={file} busy={busy}
          shot={<Challan d={d} />} onCamera={() => openCam('r')} onFile={pickedFile} onSend={rSend} onRetake={() => openCam('r')} onDone={() => go('wa')} />
      </div>
    </section>
  );
}
const latest = () => [...S().chats.r].reverse().find(m => m.link)?.link?.token ?? 'sg0418';
