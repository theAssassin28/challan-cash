import type { CSSProperties, ReactNode } from 'react';
import { inr, inv, type Dispatch } from '@cc/shared';

export const Icon = ({ id, w, h, style, className }: { id: string; w?: number | string; h?: number | string; style?: CSSProperties; className?: string }) => (
  <svg width={w} height={h} style={style} className={className}><use href={`#${id}`} /></svg>
);

interface KvProps {
  l: ReactNode; v?: ReactNode; sub?: ReactNode; on?: () => void; cls?: string; cls2?: string; id?: string; act?: string;
}
export function Kv({ l, v, sub, on, cls, cls2, id, act }: KvProps) {
  const inner = <><span className="l">{l}{sub ? <small>{sub}</small> : null}</span><span className={`v ${cls ?? ''}`}>{v}</span></>;
  const className = `kv${on ? ' tap' : ''}${cls2 ? ' ' + cls2 : ''}`;
  return on
    ? <button className={className} id={id} data-act={act} onClick={on}>{inner}</button>
    : <div className={className} id={id} data-act={act}>{inner}</div>;
}
export const Sec = ({ t, children, style }: { t?: ReactNode; children: ReactNode; style?: CSSProperties }) => (
  <div className="psec" style={style}>{t ? <div className="st">{t}</div> : null}{children}</div>
);
export const Bd = ({ h, p, style }: { h: ReactNode; p?: ReactNode; style?: CSSProperties }) => (
  <div className="bd" style={style}><h3>{h}</h3>{p ? <p>{p}</p> : null}</div>
);
export const Pill = ({ t, c = '' }: { t: string; c?: string }) => <span className={`pill ${c}`}>{t}</span>;
export const Info = ({ children }: { children: ReactNode }) => (
  <div className="infol"><Icon id="i-info" /><span>{children}</span></div>
);
export const Card = ({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) => <div className={`card ${className}`} style={style}>{children}</div>;
export const Html = ({ html, as: As = 'span', className }: { html: string; as?: 'span' | 'div' | 'p'; className?: string }) => <As className={className} dangerouslySetInnerHTML={{ __html: html }} />;

/** The receiver's copy of the delivery challan, drawn on paper. */
export function Challan({ d, hl }: { d: Dispatch; hl?: boolean }) {
  return (
    <div className="challan">
      <div className="h">
        <div><b>SHREE GANESH CORRUGATORS</b>B-14, Chakan MIDC Ph II, Pune<br />GSTIN 27ABKFS4471M1ZQ</div>
        <div className="tt">DELIVERY CHALLAN<br /><span style={{ fontWeight: 400 }}>Receiver's copy</span></div>
      </div>
      <div className="meta"><span>No. {d.id}</span><span>Inv. INV/{d.id.slice(3)}</span><span>Veh {d.veh}</span></div>
      <div>To: {d.buyer}, {d.site}</div>
      <table><tbody>
        <tr><th>Description</th><th className="n">Qty</th><th className="n">Rate</th><th className="n">Value</th></tr>
        <tr><td>{d.item}</td><td className="n">{inr(d.qty)}</td><td className="n">{d.rate}</td><td className="n">{inr(inv(d))}</td></tr>
      </tbody></table>
      <div className="sa">
        <div className={`stampbox${hl ? ' hl' : ''}`}><span className="b2">{d.sh.toUpperCase()}</span><br />{d.site.split(',')[0].toUpperCase()}<br />RECEIVED SUBJECT TO<br />COUNT &amp; QC · {d.stampDate || '12 OCT 2026'}</div>
        <svg className="sig" viewBox="0 0 140 44" fill="none" stroke="#1B3EA8" strokeWidth="1.8" strokeLinecap="round"><path d="M6 30 C 18 4, 26 42, 40 18 S 58 36, 70 14 S 92 34, 104 20 S 124 26, 134 12" /><path d="M30 38 L 120 34" /></svg>
        {d.note ? <div className={`pnote${hl ? ' hl' : ''}`}>Recd 960 pcs,<br />40 damaged</div> : null}
        {hl ? <><span className="hlt" style={{ left: 6, top: -9 }}>Stamp · GSTIN</span>{d.note ? <span className="hlt" style={{ right: 4, top: -7 }}>Pen note</span> : null}</> : null}
        <div className="fl">Receiver's sign &amp; stamp</div>
      </div>
    </div>
  );
}

/** The captured photo: a real upload when there is one, otherwise the drawn challan. */
export function Photo({ d, hl }: { d: Dispatch; hl?: boolean }) {
  if (d.photo?.url) return <img className="realphoto" src={d.photo.url} alt={`Stamped challan ${d.id}`} />;
  return <Challan d={d} hl={hl} />;
}
