import type { Capture, Email, Key, Notice, Offer, Reading, Snapshot } from '@cc/shared';

export class ApiError extends Error { constructor(public status: number, message: string) { super(message) } }

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin' };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) { init.body = JSON.stringify(body); init.headers = { 'Content-Type': 'application/json' } }
  const res = await fetch(url, init);
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  return data as T;
}
const photoBody = (file?: File) => { if (!file) return undefined; const f = new FormData(); f.append('photo', file); return f };

export const api = {
  state: () => call<Snapshot>('GET', '/api/state'),
  reset: (path: Key = 'a', unlocked = false) => call<Snapshot>('POST', '/api/demo/reset', { path, unlocked }),
  unlock: () => call('POST', '/api/demo/unlock'),
  requestPhoto: (k: Key) => call<{ token: string; url: string }>('POST', `/api/dispatches/${k}/request-photo`),
  remind: (k: Key) => call('POST', `/api/dispatches/${k}/remind`),
  link: (k: Key) => call<{ token: string; url: string; used: boolean } | null>('GET', `/api/dispatches/${k}/link`),
  selfPhoto: (k: Key, file?: File) => call('POST', `/api/dispatches/${k}/photo`, photoBody(file)),
  readings: (k: Key) => call<{ engine: string; status: string; data: Reading[] | null }>('GET', `/api/dispatches/${k}/readings`),
  setReceived: (k: Key, qty: number) => call('PATCH', `/api/dispatches/${k}/received`, { qty }),
  sendProof: (k: Key) => call('POST', `/api/dispatches/${k}/proof`),
  email: (k: Key) => call<Email>('GET', `/api/dispatches/${k}/email`),
  offer: (k: Key, amount?: number) => call<Offer>('GET', `/api/dispatches/${k}/offer${amount ? `?amount=${amount}` : ''}`),
  advance: (k: Key, amount: number) => call('POST', `/api/dispatches/${k}/advance`, { amount }),
  skipAdvance: (k: Key) => call('POST', `/api/dispatches/${k}/skip-advance`),
  booked: (k: Key) => call('POST', `/api/sim/${k}/booked`),
  confirm: (k: Key) => call('POST', `/api/sim/${k}/confirm`),
  pay: (k: Key) => call('POST', `/api/sim/${k}/pay`),
  capture: (token: string) => call<Capture>('GET', `/api/capture/${token}`),
  capturePhoto: (token: string, file?: File) => call('POST', `/api/capture/${token}/photo`, photoBody(file)),
};

/** Live updates for this workspace: state changes and phone notifications. */
export function subscribe(on: { state: () => void; notice: (n: Notice) => void }) {
  let es: EventSource | null = null, stop = false, retry: ReturnType<typeof setTimeout>;
  const open = () => {
    es = new EventSource('/api/events');
    es.addEventListener('state', () => on.state());
    es.addEventListener('notice', e => on.notice(JSON.parse((e as MessageEvent).data).notice));
    es.onerror = () => { es?.close(); if (!stop) retry = setTimeout(open, 1500) };
  };
  open();
  return { close: () => { stop = true; clearTimeout(retry); es?.close() }, reopen: () => { es?.close(); open() } };
}
