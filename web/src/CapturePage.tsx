import { useEffect, useState } from 'react';
import type { Capture } from '@cc/shared';
import { api } from './api';
import { CaptureBody } from './phone';

/** The driver's one-time page, opened from the WhatsApp link on a real phone. No login. */
export function CapturePage({ token }: { token: string }) {
  const [info, setInfo] = useState<Capture | null>(null);
  const [err, setErr] = useState('');
  const [step, setStep] = useState<'intro' | 'shot' | 'sent'>('intro');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.capture(token).then(setInfo, e => setErr(e.message)) }, [token]);
  const send = async (sample = false) => {
    setBusy(true); setErr('');
    try { await api.capturePhoto(token, sample ? undefined : file ?? undefined); setStep('sent') }
    catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  };
  const used = info?.used && step !== 'sent';
  return (
    <div className="capture-page">
      {!info ? <div className="cp-msg">{err || 'Opening…'}</div>
        : used ? <div className="cp-msg"><b>This link has been used</b>It worked once, for this challan only. Ask the owner for a new link if the photo needs to change.</div>
          : <>
            <CaptureBody info={info.dispatch} merchant={info.merchant} driverName={info.driver} step={step} file={file} busy={busy} nativeCamera
              onCamera={() => {}} onFile={f => { setFile(f); setStep('shot') }} onSend={() => void send()} onRetake={() => setStep('intro')} />
            {err ? <div className="cp-err">{err}</div> : null}
            {step === 'intro' ? <button className="cp-sample" disabled={busy} onClick={() => void send(true)}>No challan handy? Send the sample photo</button> : null}
          </>}
    </div>
  );
}
