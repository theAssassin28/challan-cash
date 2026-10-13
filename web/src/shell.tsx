import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Key, Phone } from '@cc/shared';
import brandSvg from './assets/brand-splash.svg?raw';
import sysSvg from './assets/sys-splash.svg?raw';
import { Icon } from './bits';
import { Adv, CASES, Chk, DD, Disp, Home, Prod, Store, Tx } from './owner';
import { AList, Camera, Web, WhatsApp } from './phone';
import { SheetBody } from './sheets';
import {
  D, S, closeDlg, closeSheet, cur, go, hunTap, jump, ord, restart, snack, switchPhone, tryPath, useUI, type View,
} from './state';
import { api } from './api';

const MAIN_STEPS = [
  'Prakash: open the notification, then Dispatches',
  'Prakash: ask Ramesh for the stamped challan photo',
  "Ramesh: open the link at Endurance's dock and take the photo",
  'Prakash: check what Razorpay read, send the proof to Endurance',
  'Prakash: take the advance with a fingerprint (50% now, the rest when QC clears)',
  'Jump to 26 Nov: Endurance pays, the balance comes to Prakash',
];
const PATHS: Record<'b' | 'c', { at: number[]; steps: string[] }> = {
  b: { at: [2, 3, 3.5, 4, 5], steps: ["Prakash: take the photo at Sundaram's dock", 'Prakash: check what Razorpay read, send the proof', 'Prakash: take the advance, capped at 50%', 'Sundaram confirms receipt, the money arrives', 'Optional: jump to 26 Nov, Sundaram pays'] },
  c: { at: [1, 2, 3, 4, 5], steps: ['Prakash: ask Anil for the photo on WhatsApp', 'Anil sends the photo from his depot', 'Prakash: check what Razorpay read, send the proof', 'Prakash: take the advance, 50% now and the rest when QC clears', 'Optional: jump to 8 Nov, Pune Precision pays'] },
};

const lockOn = () => useUI.getState().phone === 'p' && !S().unlocked;

/* ---------- what to do next ---------- */
function nextHint(): [string, string] {
  const s = S(), u = useUI.getState(), a = s.dispatches.a, c = cur(), P = "Prakash's phone", Rm = "Ramesh's phone";
  if (s.path !== 'a') {
    const d = s.dispatches[s.path];
    if (u.compose) return [P, 'WhatsApp is open with the message ready. Tap the green send button.'];
    if (!['dd', 'chk', 'adv', 'cam', 'wa'].includes(c) && d.status !== 'asked') return [P, `Open Dispatches, then ${d.sh}.`];
    const m: Record<string, string> = {
      transit: d.k === 'b' ? 'You are at the dock. Tap Take the photo, then the shutter.' : 'Tap Ask Anil for the photo, then send the WhatsApp message.',
      asked: 'Anil replies in a few seconds. Tap the notification when it comes.',
      photo: `Check what Razorpay read, then send the proof to ${d.sh}.`,
      proof: `Pick an amount and take the advance. Confirm with the fingerprint. Optional: skip it and jump to ${d.due}.`,
      await: `Tap "Demo: ${d.sh} confirms" to see the money arrive.`,
      adv: d.t2Pending ? `Tap 'Demo: ${d.sh}'s QC clears now' to see the second part arrive.` : `Optional: jump to ${d.due} to see ${d.sh} pay and the loan repaid.`,
    };
    return [P, m[d.status] ?? ''];
  }
  if (!s.unlocked) return [P, 'Tap the Razorpay notification on the lock screen.'];
  if (a.status === 'transit') return u.compose ? [P, 'WhatsApp is open with the message ready. Tap the green send button.'] : [P, 'Open Dispatches, then Endurance. Ask Ramesh for the photo on WhatsApp.'];
  if (a.status === 'asked') return [Rm, 'Open WhatsApp, tap the link from Prakash, take the photo and send it.'];
  if (a.status === 'photo') return [P, 'Tap the notification. Check what Razorpay read, then send the proof to Endurance.'];
  if (a.status === 'proof') return [P, 'Pick an amount and take the advance. Confirm with the fingerprint. Optional: skip it and jump to 26 Nov.'];
  if (a.status === 'adv') return a.t2Pending ? [P, "₹1,20,000 is in the bank. When ready, tap 'Demo: Endurance's QC clears now' to see the second ₹72,000 arrive."] : [P, 'Optional: jump to 26 Nov to see Endurance pay and the loan repaid from that payment.'];
  return ['Done', 'Endurance is closed.'];
}
const nextPhone = (): Phone | null => { const h = nextHint()[0]; return /Ramesh/.test(h) ? 'r' : /Prakash/.test(h) ? 'p' : null };

function coachTarget(): [string | Element, string] | null {
  const u = useUI.getState(), s = S(), a = s.dispatches[s.path], d = D(), c = cur();
  if (u.dialog) return ['.dlg .a button:last-child', 'Tap to confirm'];
  if (u.sheet) return document.getElementById('bio-btn') ? ['#bio-btn', 'Touch the sensor'] : null;
  if (u.hun?.action) return ['#hun', 'Tap the notification'];
  if (u.phone === 'p') {
    if (lockOn()) return ['.lock .n.rz', 'Tap to open Razorpay'];
    if (c === 'home') return a.status === 'photo' ? ['.acard', `Check ${a.drv}'s photo`] : ['.acard', 'Open Dispatches'];
    if (c === 'wa') return u.compose ? ['#wa-snd', 'Tap send'] : ['.wa-h .bk2', 'Back to Razorpay'];
    if (c === 'disp') return a.status === 'paid' ? null : [`[data-act="d-${a.k}"]`, a.status === 'photo' ? `Check ${a.sh}'s challan` : `Open ${a.sh}`];
    if (c === 'dd') {
      if (d.k !== a.k) return ['#v-dd .bk', 'Back to your dispatches'];
      const m: Record<string, string> = { ask: `Ask ${d.drv} for the photo`, self: 'Take the photo', review: 'Check what Razorpay read', offer: 'See the offer', confirm: `Demo: ${d.sh} confirms`, jump: `Optional: jump to ${d.due}`, qc: 'Demo: QC clears, second part arrives', jumpo: 'Optional: skip the advance', 'case-a': 'Try another case', 'case-b': 'Try another case', 'case-c': 'Try another case' };
      const el = document.querySelector<HTMLElement>('#dd-body [data-act]');
      if (!el || a.status === 'asked') return null;
      return [el, m[el.dataset.act!] || 'Tap here next'];
    }
    if (c === 'chk') return u.revealed[d.k] ? ['[data-act="send"]', 'Looks right? Send it to ' + d.sh] : null;
    if (c === 'adv') return ['[data-act="take"]', 'Get the money now'];
    if (c === 'cam') return ['#shutter', 'Take the photo'];
    if (['tx', 'prod', 'store'].includes(c)) return ['.view.on .nav button', 'Back to Home'];
  } else {
    if (s.path !== 'a') return null;
    if (a.status !== 'asked' && !(a.status === 'photo' && c === 'web')) return null;
    if (c === 'alist') return ['#al-body .row', "Open Prakash's message"];
    if (c === 'wa') { const l = [...document.querySelectorAll('#wa-b .lp:not(.used)')]; return l.length ? [l[l.length - 1], 'Tap the link'] : null }
    if (c === 'web') return u.rp === 'intro' ? ['[data-act="cam"]', 'Open the camera'] : u.rp === 'shot' ? ['[data-act="rsend"]', 'Send it to Prakash'] : null;
    if (c === 'cam') return ['#shutter', 'Take the photo'];
  }
  return null;
}

function coach() {
  const c = document.getElementById('coach'), app = document.getElementById('app');
  if (!c || !app || !S()) return;
  document.querySelectorAll('.coach-t').forEach(e => e.classList.remove('coach-t'));
  let t: ReturnType<typeof coachTarget> = null; try { t = coachTarget() } catch { t = null }
  const el = t && (typeof t[0] === 'string' ? [...document.querySelectorAll<HTMLElement>(t[0])].find(e => e.offsetParent !== null || e.id === 'hun') : t[0] as HTMLElement);
  if (!t || !el || !el.getClientRects().length) { c.classList.remove('on'); return }
  el.classList.add('coach-t');
  const sr = app.getBoundingClientRect(), z = sr.width / app.offsetWidth || 1, r = el.getBoundingClientRect(), W = app.offsetWidth;
  const box = el.closest('.pbody,.scroll,.wa-b,.sheet'), br = box ? box.getBoundingClientRect() : sr;
  let txt = t[1], mode = '', top = 0; const cx = (r.left + r.width / 2 - sr.left) / z;
  if (r.top > br.bottom - 12) { txt = 'Scroll down ↓ · ' + t[1]; mode = 'up'; top = (br.bottom - sr.top) / z - 44 }
  else if (r.bottom < br.top + 12) { txt = 'Scroll up ↑ · ' + t[1]; mode = 'dn'; top = (br.top - sr.top) / z + 8 }
  c.querySelector('span')!.textContent = txt; c.classList.add('on');
  const cw = c.offsetWidth, ch = c.offsetHeight;
  if (!mode) { const above = (r.top - sr.top) / z, below = (sr.bottom - r.bottom) / z; if (above > ch + 60 || below < ch + 24) { mode = 'up'; top = above - ch - 11 } else { mode = 'dn'; top = (r.bottom - sr.top) / z + 11 } }
  const left = Math.max(8, Math.min(W - cw - 8, cx - cw / 2));
  c.style.left = left + 'px'; c.style.top = top + 'px';
  c.style.setProperty('--ax', Math.max(12, Math.min(cw - 12, cx - left)) + 'px');
  c.classList.remove('up', 'dn'); c.classList.add(mode);
}

let gT: ReturnType<typeof setTimeout>;
export function guideUI(ms = 40) { clearTimeout(gT); gT = setTimeout(coach, ms) }

/* ---------- the guide rail beside the phone ---------- */
function Guide() {
  useUI(u => u.snap); useUI(u => u.scr); useUI(u => u.compose); useUI(u => u.phone);
  const s = S(), P = s.path === 'a' ? null : PATHS[s.path], pd = s.dispatches[s.path], doneAll = pd.status === 'paid';
  const h = nextHint(), phone = useUI(u => u.phone);
  const flags = [s.unlocked, ord(s.dispatches.a) >= 1, ord(s.dispatches.a) >= 2, ord(s.dispatches.a) >= 3, ord(s.dispatches.a) >= 4, s.dispatches.a.status === 'paid'];
  const onMain = flags.findIndex(f => !f);
  const others = (Object.keys(CASES) as Key[]).filter(x => x !== s.path);
  return (
    <aside className="guide">
      <h1>Challan Cash: prototype</h1>
      <p><b>Prakash</b> owns Shree Ganesh Corrugators in Chakan and uses the Razorpay app. <b>Ramesh</b> drives his tempo and only uses WhatsApp. Sample data, {s.engine === 'claude' ? 'AI reads real photos' : 'scripted AI'}. Every step runs through the live API.</p>
      <div className="next">{doneAll
        ? <><b>DONE · {pd.sh.toUpperCase()}</b>{pd.sh} is closed. Try another case:<div className="np">{others.map(x => <button key={x} onClick={() => tryPath(x)}>{CASES[x]} &rarr;</button>)}</div></>
        : h[0] ? <><b>NEXT · {h[0].toUpperCase()}</b>{h[1]}</> : null}</div>
      <ol>{P
        ? P.steps.map((t, i) => { const o = ord(pd), on = P.at.findIndex(x => o < x); return <li key={i} className={o >= P.at[i] ? 'done' : i === on ? 'on' : ''}>{t}</li> })
        : MAIN_STEPS.map((t, i) => <li key={i} className={flags[i] ? 'done' : i === onMain ? 'on' : ''}>{t}</li>)}</ol>
      <div className="ctl">
        <button onClick={() => switchPhone()}>{phone === 'p' ? "Switch to Ramesh's phone" : "Switch to Prakash's phone"}</button>
        <button onClick={() => jump()} disabled={!['proof', 'adv'].includes(pd.status)}>Jump to {pd.due}, {pd.sh} pays</button>
        <button onClick={() => restart('a')}>Restart</button>
      </div>
      <div className={`alt${doneAll ? ' hot' : ''}`}><b>Other paths</b>
        <button onClick={() => tryPath('b')}>Sundaram: a new buyer. Prakash takes the photo himself, the advance is capped at 50%</button>
        <button onClick={() => tryPath('c')}>Pune Precision: the challan has been with the driver for 4 days</button>
      </div>
    </aside>
  );
}

/* ---------- lock screen and app launch ---------- */
const LAUNCH = { open: 200, sys: 430, brand: 1500, fade: 120 };
function Lock({ onOpen }: { onOpen: (el: HTMLElement) => void }) {
  const s = S();
  return (
    <div className="lock" id="lock">
      <div className="t">{s.clock}</div><div className="d">Mon, 12 Oct</div>
      <div className="ns">
        <div className="n" onClick={() => snack('Open the Razorpay notification below')}><div className="h"><i style={{ background: '#25d366' }}><Icon id="i-wa" w={10} h={10} /></i>WhatsApp · 2 min ago</div><b>Ramesh (Driver)</b><p>Unloaded at Endurance. They stamped the challan and wrote 40 boxes damaged.</p></div>
        <div className="n rz" onClick={e => onOpen(e.currentTarget)}><div className="h"><i><Icon id="i-rzp" w={18} h={18} /></i>Razorpay · now</div><b>₹7,50,000 delivered, not on buyers' books</b><p>3 stamped challans are still with drivers. Endurance's accounts team books the invoice only when they have the copy.</p></div>
      </div>
    </div>
  );
}

const VIEWS: Record<View, () => React.ReactElement> = { home: Home, tx: Tx, prod: Prod, store: Store, disp: Disp, dd: DD, chk: Chk, adv: Adv, cam: Camera, wa: WhatsApp, alist: AList, web: Web };

export function Shell() {
  const u = useUI();
  const s = u.snap!;
  const c = u.scr[u.phone];
  const screen = useRef<HTMLDivElement>(null), splash = useRef<HTMLDivElement>(null), device = useRef<HTMLDivElement>(null), flashEl = useRef<HTMLDivElement>(null);
  const [sbOver, setSbOver] = useState(false);
  const lock = u.phone === 'p' && !s.unlocked;

  // Hand-off card: the next step is on the other phone
  const np = nextPhone(), other = !!np && np !== u.phone && !u.sheet && !u.dialog && !lock;
  const hint = nextHint();

  useLayoutEffect(() => { guideUI(u.sheet ? 300 : 40) });
  useEffect(() => {
    const onScroll = () => requestAnimationFrame(coach);
    document.addEventListener('scroll', onScroll, true);
    const fit = () => { const d = device.current; if (!d) return; if (innerWidth <= 760) { d.style.zoom = ''; return } d.style.zoom = Math.min(1, (innerHeight - 64) / 775).toFixed(3); guideUI(50) };
    fit(); addEventListener('resize', fit);
    return () => { document.removeEventListener('scroll', onScroll, true); removeEventListener('resize', fit) };
  }, []);
  useEffect(() => { const sc = screen.current; if (!sc || !u.swp) return; sc.classList.remove('swp'); void sc.offsetWidth; sc.classList.add('swp') }, [u.swp]);
  useEffect(() => { const f = flashEl.current; if (!f || !u.flash) return; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go') }, [u.flash]);

  const unlock = (n: HTMLElement) => {
    if (u.launching) return;
    useUI.setState({ launching: true });
    const sp = splash.current!, sc = sp.parentElement!.getBoundingClientRect(), r = n.getBoundingClientRect();
    sp.style.setProperty('--t', r.top - sc.top + 'px'); sp.style.setProperty('--b', sc.bottom - r.bottom + 'px');
    sp.style.setProperty('--l', r.left - sc.left + 'px'); sp.style.setProperty('--r', sc.right - r.right + 'px');
    sp.style.setProperty('--open', LAUNCH.open + 'ms'); sp.style.setProperty('--fade', LAUNCH.fade + 'ms');
    sp.classList.remove('out', 'brand'); sp.classList.add('run');
    setTimeout(() => setSbOver(true), LAUNCH.open);
    setTimeout(() => {
      sp.classList.add('brand');
      useUI.setState({ snap: { ...S(), unlocked: true } }); void api.unlock();
      go('home');
    }, LAUNCH.open + LAUNCH.sys);
    setTimeout(() => { sp.classList.add('out'); setSbOver(false) }, LAUNCH.open + LAUNCH.sys + LAUNCH.brand);
    setTimeout(() => { sp.classList.remove('run', 'out', 'brand'); useUI.setState({ launching: false }) }, LAUNCH.open + LAUNCH.sys + LAUNCH.brand + LAUNCH.fade + 30);
  };

  const sbar = 'sbar' + (lock ? ' lockb' : c === 'home' ? '' : c === 'wa' || c === 'alist' ? ' wa' : c === 'cam' ? ' dark' : ' light') + (sbOver ? ' over' : '');
  const V = VIEWS[c];
  const hunIc = u.hun?.app === 'wa' ? <i style={{ background: '#25d366' }}><Icon id="i-wa" w={10} h={10} /></i>
    : u.hun?.app === 'bank' ? <i style={{ background: '#004c8f', color: '#fff', font: '700 8px Roboto' }}>H</i>
      : <i style={{ background: '#0c2451' }}><Icon id="i-rzp" w={16} h={16} /></i>;
  const dot = (x: Phone) => u.phone !== x && u.queue[x].length > 0;

  return (
    <>
      <Guide />
      <button className={`mswitch${other ? ' go' : ''}`} onClick={() => switchPhone()}>{u.phone === 'p' ? "Prakash's phone" : "Ramesh's phone"} · switch</button>
      <div className="stage">
        <div className="who"><span>Showing</span><div className="sw">
          <button className={`${u.phone === 'p' ? 'on' : ''}${dot('p') ? ' dot' : ''}${other && np === 'p' ? ' go' : ''}`} onClick={() => switchPhone('p')}>Prakash · owner<i /></button>
          <button className={`${u.phone === 'r' ? 'on' : ''}${dot('r') ? ' dot' : ''}${other && np === 'r' ? ' go' : ''}`} onClick={() => switchPhone('r')}>Ramesh · driver<i /></button>
        </div></div>
        <div className="device" ref={device}><div className={`screen${other ? ' ho' : ''}`} id="screen" ref={screen}>
          <div className={sbar}><span>{s.clock}</span><i>
            <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor"><path d="M0 11 15 0v11z" /></svg>
            <svg width="9" height="14" viewBox="0 0 9 14" fill="currentColor"><rect x="2.5" width="4" height="2" rx=".5" /><rect y="1.5" width="9" height="12.5" rx="1.5" /></svg></i></div>
          <div className="splash" ref={splash} aria-hidden="true">
            <div className="sp-sys" dangerouslySetInnerHTML={{ __html: sysSvg }} />
            <div className="sp-brand" dangerouslySetInnerHTML={{ __html: brandSvg }} />
          </div>
          <div className="app" id="app">
            {lock ? <Lock onOpen={unlock} /> : null}
            <V key={`${u.phone}-${c}`} />
            <div className={`scrim${u.dialog ? ' on' : ''}`}>{u.dialog ? <div className="dlg"><h3>{u.dialog.title}</h3><p>{u.dialog.body}</p><div className="a">{u.dialog.acts.map(([l, f]) => <button key={l} onClick={f}>{l}</button>)}</div></div> : null}</div>
            <div className={`snack${u.snack ? ' on' : ''}${other ? ' raise' : ''}${c === 'cam' ? ' cam' : ''}`}><span>{u.snack?.text}</span>
              <button style={{ display: u.snack?.act ? '' : 'none' }} onClick={() => { const f = u.snack?.act; useUI.setState({ snack: null }); f?.() }}>{u.snack?.label}</button></div>
            <div className={`shs${u.sheet ? ' on' : ''}`} onClick={closeSheet} />
            <div className={`sheet${u.sheet ? ' on' : ''}`}><div className="hd" />{u.sheet ? <SheetBody key={u.sheet.kind + (u.sheet.arg ?? '')} kind={u.sheet.kind} arg={u.sheet.arg} /> : null}</div>
            <div className={`hun${u.hun ? ' on' : ''}`} id="hun" onClick={hunTap}>{u.hun ? <><div className="h">{hunIc}{u.hun.app === 'wa' ? 'WhatsApp' : u.hun.app === 'bank' ? 'HDFC Bank' : 'Razorpay'} · now</div><b>{u.hun.title}</b>{u.hun.text ? <p>{u.hun.text}</p> : null}</> : null}</div>
            <div className="flash-w" ref={flashEl} />
            <div className="coach" id="coach"><span /></div>
            <div className={`handoff${other ? ' on' : ''}`} onClick={() => switchPhone()}><div className="t"><b>Next step is on {np === 'r' ? 'Ramesh' : 'Prakash'}'s phone</b><span>{hint[1].split('. ')[0].replace(/\.$/, '') + '.'}</span></div><span className="go">Switch &rarr;</span></div>
          </div>
        </div></div>
      </div>
    </>
  );
}

export { closeDlg };
