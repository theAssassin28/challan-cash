import type { Capture, Email, Key, Offer, Reading, Snapshot } from '@cc/shared';

export type Readings = { engine: string; status: string; data: Reading[] | null; error?: string };

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
/** Phone photos can be 5 to 10 MB. Shrink to at most 1800 px so uploads stay small and fast. */
async function shrink(file: File): Promise<Blob> {
  if (file.size < 900_000) return file;
  try {
    const img = await createImageBitmap(file);
    const k = Math.min(1, 1800 / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise<Blob>((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('Could not read the photo'))), 'image/jpeg', 0.85));
  } catch { return file }
}
const photoBody = async (file?: File) => {
  if (!file) return undefined;
  const f = new FormData(); f.append('photo', await shrink(file), 'challan.jpg'); return f;
};

export const api = {
  state: () => call<Snapshot>('GET', '/api/state'),
  reset: (path: Key = 'a', unlocked = false) => call<Snapshot>('POST', '/api/demo/reset', { path, unlocked }),
  unlock: () => call('POST', '/api/demo/unlock'),
  requestPhoto: (k: Key) => call<{ token: string; url: string }>('POST', `/api/dispatches/${k}/request-photo`),
  remind: (k: Key) => call('POST', `/api/dispatches/${k}/remind`),
  link: (k: Key) => call<{ token: string; url: string; used: boolean } | null>('GET', `/api/dispatches/${k}/link`),
  selfPhoto: async (k: Key, file?: File) => call('POST', `/api/dispatches/${k}/photo`, await photoBody(file)),
  readings: (k: Key) => call<Readings>('GET', `/api/dispatches/${k}/readings`),
  /** Asks the server to read a real photo now. Safe to call repeatedly while it is pending. */
  read: (k: Key) => call<Readings>('POST', `/api/dispatches/${k}/read`),
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
  capturePhoto: async (token: string, file?: File) => call('POST', `/api/capture/${token}/photo`, await photoBody(file)),
};

