import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.css';
import './styles.css';
import './extra.css';
import icons from './assets/icons.svg?raw';
import { Shell } from './shell';
import { CapturePage } from './CapturePage';
import { boot, useUI } from './state';

document.body.insertAdjacentHTML('afterbegin', icons);

function Demo() {
  const snap = useUI(u => u.snap);
  const [err, setErr] = useState('');
  useEffect(() => { boot().catch(e => setErr(String(e.message ?? e))) }, []);
  if (err) return <div className="boot-err">Could not reach the Challan Cash API. Is the server running? ({err})</div>;
  return snap ? <Shell /> : null;
}

const m = /^\/c\/([\w-]+)\/?$/.exec(location.pathname);
if (m) document.body.classList.add('capture');
createRoot(document.getElementById('root')!).render(<StrictMode>{m ? <CapturePage token={m[1]} /> : <Demo />}</StrictMode>);
