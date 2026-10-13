import { create } from 'zustand';
import { ORD, type Dispatch, type Key, type Notice, type Phone, type Snapshot } from '@cc/shared';
import { api } from './api';

export type View = 'home' | 'tx' | 'prod' | 'store' | 'disp' | 'dd' | 'chk' | 'adv' | 'cam' | 'wa' | 'alist' | 'web';
export type SheetKind = 'notOnBooks' | 'advOct' | 'total' | 'step' | 'msme' | 'acct' | 'mail' | 'record' | 'photo' | 'qty' | 'kfs' | 'bio' | 'help' | 'link';
export interface Compose { chat: 'r' | 'a'; k: Key; text: string; link: { title: string; sub: string } }
interface Snack { text: string; act: (() => void) | null; label: string; id: number }

export interface UI {
  snap: Snapshot | null;
  phone: Phone;
  scr: Record<Phone, View>;
  k: Key;
  compose: Compose | null;
  waWith: 'r' | 'a';
  ret: View;
  rp: 'intro' | 'shot' | 'sent';
  driverFile: File | null;
  camFor: Key;
  revealed: Partial<Record<Key, boolean>>;
  offer: Partial<Record<Key, number>>;
  sheet: { kind: SheetKind; arg?: string } | null;
  dialog: { title: string; body: string; acts: [string, () => void][] } | null;
  snack: Snack | null;
  hun: Notice | null;
  queue: Record<Phone, Notice[]>;
  rOpened: boolean;
  swp: number;
  flash: number;
  launching: boolean;
  busy: boolean;
}

export const useUI = create<UI>(() => ({
  snap: null, phone: 'p', scr: { p: 'home', r: 'alist' }, k: 'a', compose: null, waWith: 'r', ret: 'dd', rp: 'intro', driverFile: null,
  camFor: 'a', revealed: {}, offer: {}, sheet: null, dialog: null, snack: null, hun: null, queue: { p: [], r: [] }, rOpened: false,
  swp: 0, flash: 0, launching: false, busy: false,
}));

const get = useUI.getState, set = useUI.setState;
export const S = () => get().snap!;
export const D = (k?: Key): Dispatch => S().dispatches[k ?? get().k];
export const cur = (): View => get().scr[get().phone];
export const ord = (d: Dispatch) => ORD[d.status];
export const notOnBooks = () => Object.values(S().dispatches).filter(d => ord(d) < 3);

/* ---------- sync with the server ---------- */
// The app polls for changes: Netlify Functions cannot hold a live connection open.
const seen = new Set<number>();
function take(snap: Snapshot, show: boolean) {
  for (const n of snap.notices) if (!seen.has(n.id)) { seen.add(n.id); if (show) hun(n) }
  const cur = get().snap;
  if (!cur || cur.version !== snap.version || cur.workspace !== snap.workspace) set({ snap });
}
let refreshing: Promise<void> | null = null, again = false;
export async function refresh() {
  if (refreshing) { again = true; return refreshing }
  refreshing = (async () => {
    do { again = false; take(await api.state(), true) } while (again);
  })().finally(() => { refreshing = null });
  return refreshing;
}
let pollT: ReturnType<typeof setTimeout>;
function poll() {
  clearTimeout(pollT);
  const fast = get().snap?.pending, hidden = document.visibilityState === 'hidden';
  pollT = setTimeout(() => { refresh().catch(() => {}).finally(poll) }, hidden ? 5000 : fast ? 700 : 1500);
}
export async function boot() {
  take(await api.state(), false);
  poll();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void refresh() });
}

/** Runs a server action, refreshes state, and shows any error as a snackbar. */
export async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
  set({ busy: true });
  try { const r = await fn(); await refresh(); return r }
  catch (e) { snack((e as Error).message); return undefined }
  finally { set({ busy: false }) }
}

/* ---------- navigation ---------- */
export function go(v: View) {
  const { phone, scr } = get();
  set({ scr: { ...scr, [phone]: v } });
  requestAnimationFrame(() => {
    const b = document.querySelector(`#v-${v} .pbody, #v-${v} .scroll`); if (b) b.scrollTop = 0;
  });
}
export function switchPhone(p?: Phone) {
  const { phone, queue } = get();
  p = p ?? (phone === 'p' ? 'r' : 'p'); if (p === phone) return;
  set({ sheet: null, dialog: null, hun: null, phone: p, swp: get().swp + 1 });
  const q = queue[p];
  if (q.length) { const o = q[q.length - 1]; set({ queue: { ...get().queue, [p]: [] } }); setTimeout(() => showHun(o), 420) }
}
export async function restart(path: Key = 'a') {
  const snap = await api.reset(path, path !== 'a');
  for (const n of snap.notices) seen.add(n.id);
  set({
    snap, phone: 'p', scr: { p: path === 'a' ? 'home' : 'dd', r: 'alist' }, k: path, compose: null, waWith: 'r', rp: 'intro', driverFile: null,
    revealed: {}, offer: {}, sheet: null, dialog: null, snack: null, hun: null, queue: { p: [], r: [] }, rOpened: false,
  });
}
export async function tryPath(k: Key) { await restart(k) }
export function openD(k: Key) {
  const s = S(), doneHere = s.path === 'a' ? s.dispatches.a.status === 'paid' : true;
  if (k !== 'a' && k !== s.path && doneHere) { void tryPath(k).then(() => snack(`Started ${s.dispatches[k].sh}'s case`)); return }
  set({ k }); go('dd');
}
export const outside = (n: string) => snack(`${n} is outside this prototype. Dispatches is the live part.`);

/* ---------- overlays ---------- */
let snackT: ReturnType<typeof setTimeout>;
export function snack(text: string, act: (() => void) | null = null, label = 'View') {
  clearTimeout(snackT);
  const id = Date.now();
  set({ snack: { text, act, label, id } });
  snackT = setTimeout(() => { if (get().snack?.id === id) set({ snack: null }) }, act ? 6000 : 4000);
}
export const openSheet = (kind: SheetKind, arg?: string) => set({ sheet: { kind, arg } });
export const closeSheet = () => set({ sheet: null });
export const dialog = (title: string, body: string, acts: [string, () => void][]) => set({ dialog: { title, body, acts } });
export const closeDlg = () => set({ dialog: null });

let hunT: ReturnType<typeof setTimeout>;
export function hun(n: Notice) {
  if (get().phone === n.phone) showHun(n);
  else set({ queue: { ...get().queue, [n.phone]: [...get().queue[n.phone], n] } });
}
function showHun(n: Notice) {
  clearTimeout(hunT);
  set({ hun: n });
  hunT = setTimeout(() => { if (get().hun?.id === n.id) set({ hun: null }) }, n.action ? 9000 : 4500);
}
export function hunTap() {
  clearTimeout(hunT);
  const n = get().hun; set({ hun: null });
  const a = n?.action; if (!a) return;
  if (a.view === 'wa') { set({ waWith: 'r', rOpened: true }); go('wa'); return }
  if (a.k) set({ k: a.k });
  go(a.view as View);
}

/* ---------- ask the driver on WhatsApp ---------- */
export function askDriver() {
  const d = D(), chat = d.k === 'a' ? 'r' : 'a';
  const where = d.k === 'a' ? 'Endurance, Chakan Plant' : 'Pune Precision, Pimpri';
  set({
    compose: { chat, k: d.k, text: `${d.drv}, please send a photo of ${d.sh}'s stamped challan using this link. No login needed.\n${location.host}/c/…`, link: { title: 'Challan photo · Shree Ganesh', sub: `${d.id} · ${where}` } },
    waWith: chat, ret: cur(),
  });
  go('wa');
}
export async function waSend() {
  const c = get().compose;
  if (get().phone !== 'p' || !c) { snack('Nothing to send'); return }
  set({ compose: null });
  const r = await run(() => api.requestPhoto(c.k));
  if (!r) return;
  if (c.chat === 'a') snack('Sent. Anil is at the depot and replies in a few seconds');
}
export function waBack() {
  if (get().phone === 'r') { go('alist'); return }
  const r = get().ret; go(r && r !== 'wa' ? r : 'dd');
}
export function tapLink(token: string, used: boolean) {
  if (get().phone === 'p') { snack('This link opens the camera on the driver\'s phone'); return }
  const { rp } = get();
  if (used && rp !== 'sent') { go('web'); return }
  if (used) { snack('This link has been used. It worked once, for this challan only.'); return }
  set({ rp: 'intro', driverFile: null }); go('web');
}
export async function remind() {
  const d = D(); if (await run(() => api.remind(d.k)) !== undefined) snack(`Reminder sent to ${d.drv} on WhatsApp`);
}
export const latestToken = (chat: 'r' | 'a') => [...S().chats[chat]].reverse().find(m => m.link)?.link?.token ?? null;

/* ---------- camera ---------- */
export function openCam(who: Phone) { set({ camFor: who === 'r' ? 'a' : get().k }); go('cam') }
export const selfPhoto = () => openCam('p');
export const camClose = () => go(get().phone === 'r' ? 'web' : 'dd');
export function shoot() {
  set({ flash: get().flash + 1 });
  setTimeout(() => {
    if (get().phone === 'r') { set({ rp: 'shot', driverFile: null }); go('web'); return }
    void ownerPhoto();
  }, 280);
}
export async function ownerPhoto(file?: File) {
  const k = get().camFor;
  if (await run(() => api.selfPhoto(k, file)) === undefined) return;
  set({ k, revealed: { ...get().revealed, [k]: false } }); go('chk');
}
/** A real photo picked from the gallery or a real camera. */
export function pickedFile(file: File) {
  if (get().phone === 'r') { set({ rp: 'shot', driverFile: file }); go('web'); return }
  void ownerPhoto(file);
}
export async function rSend() {
  const token = latestToken('r'); if (!token) return;
  const f = get().driverFile;
  if (await run(() => api.capturePhoto(token, f ?? undefined)) === undefined) return;
  set({ rp: 'sent' });
}

/* ---------- check, proof, advance ---------- */
export async function setQty(q: number) {
  const d = D();
  if (q === 0) { closeSheet(); snack('Rejected loads keep the proof and the dispute record. No advance against rejected goods.'); return false }
  if (!q || q < 1 || q > d.qty) return false;
  closeSheet();
  if (await run(() => api.setReceived(d.k, q)) === undefined) return true;
  snack(q === d.qty ? 'No credit note. Full invoice payable' : `Credit note updated to ${(d.qty - q).toLocaleString('en-IN')} ${d.unit}`);
  return true;
}
export function retake() {
  const d = D();
  if (d.selfShot) { openCam('p'); return }
  dialog(`Ask ${d.drv} again?`, 'He gets a new link. This photo is kept in the record.', [['Cancel', closeDlg], ['Ask again', () => { closeDlg(); snack('For this demo, the photo is fine. Send it.') }]]);
}
export async function sendProof() {
  const d = D();
  if (await run(() => api.sendProof(d.k)) === undefined) return;
  go('adv'); snack(`Sent. Booking unconfirmed until ${d.sh}'s accounts acknowledge`);
}
export async function skipAdv() {
  const d = D();
  if (await run(() => api.skipAdvance(d.k)) === undefined) return;
  go('dd'); snack(`Proof is with ${d.sh}. The offer stays open until ${d.due}`);
}
export function takeAdv() { openSheet('bio') }
export async function bioOk(amount: number) {
  const d = D();
  await new Promise(r => setTimeout(r, 650));
  closeSheet();
  if (await run(() => api.advance(d.k, amount)) === undefined) return;
  go('dd');
  if (d.newB) snack(`Approved. Paid when ${d.sh} confirms`);
}
export async function buyerConfirms() { const d = D(); await run(() => api.confirm(d.k)) }
export async function bookAck(k: Key) { await run(() => api.booked(k)) }
export async function jump(k?: Key) {
  k = k ?? S().path; const d = S().dispatches[k];
  if (!['proof', 'adv'].includes(d.status)) { snack(`Send the proof to ${d.sh} first`); return }
  if (await run(() => api.pay(k)) === undefined) return;
  set({ k }); if (get().phone !== 'p') switchPhone('p'); go('dd');
}
export function markRevealed(k: Key) { set({ revealed: { ...get().revealed, [k]: true } }) }
export function setOffer(k: Key, a: number) { set({ offer: { ...get().offer, [k]: a } }) }
