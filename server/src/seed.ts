import type { Key, Txn } from '@cc/shared';
import type { StoredDispatch } from './doc.js';

// Sample data from the product note. Prakash is a composite persona.
const blank = {
  status: 'transit' as const, askedAt: null, shotAt: null, selfShot: false, proofAt: null, booked: false, bookedAt: null,
  cnPosted: false, amt: 0, t2: 0, t2Pending: false, charges: 0, advAt: null, elapsed: null,
};

export function seedDispatches(): Record<Key, StoredDispatch> {
  return {
    a: {
      ...blank, k: 'a', id: 'DC/2610/0418', buyer: 'Endurance Technologies Ltd', sh: 'Endurance', site: 'Chakan Plant, Pune',
      item: '5-ply carton 600×400', unit: 'cartons', qty: 1000, recd: 960, rate: 250, terms: 45, tenor: 45, fee: 0.02, pct: 0.8,
      newB: false, va: '2223 3300 1007 4410', vaNote: "In Endurance's vendor records since Aug 2026", email: 'ap.chakan@endurance.example',
      hist: '14 deliveries, 13 paid on time', drv: 'Ramesh', veh: 'MH14 GU 2287', left: '7:40 AM',
      acc: '12 Oct', obj: '27 Oct', msme: '26 Nov', grn: '5000412233', due: '26 Nov', stampDate: null, note: 'Recd 960 pcs, 40 damaged', stale: false,
    },
    b: {
      ...blank, k: 'b', id: 'DC/2610/0421', buyer: 'Sundaram Auto Plast Pvt Ltd', sh: 'Sundaram', site: 'Bhosari MIDC, Pune',
      item: 'Mono carton 300×200', unit: 'cartons', qty: 2400, recd: 2400, rate: 50, terms: 45, tenor: 45, fee: 0.025, pct: 0.5,
      newB: true, va: '2223 3300 1015 2286', vaNote: 'New. Confirmation letter goes with this first proof', email: 'accounts@sundaramplast.example',
      hist: 'First delivery', drv: 'Sunil', veh: 'MH12 RT 0931', left: '9:15 AM',
      acc: '12 Oct', obj: '27 Oct', msme: '26 Nov', grn: '4900077120', due: '26 Nov', stampDate: null, note: null, stale: false,
    },
    c: {
      ...blank, k: 'c', id: 'DC/2610/0409', buyer: 'Pune Precision Components', sh: 'Pune Precision', site: 'Pimpri, Pune',
      item: 'RSC carton 800×600', unit: 'cartons', qty: 1000, recd: 1000, rate: 380, terms: 30, tenor: 27, fee: 0.014, pct: 0.8,
      newB: false, va: '2223 3300 1003 9921', vaNote: "In Pune Precision's vendor records since May 2026", email: 'payables@puneprecision.example',
      hist: '9 deliveries, all paid on time', drv: 'Anil', veh: 'MH14 HQ 7720', left: '8 Oct',
      acc: '9 Oct', obj: '24 Oct', msme: '23 Nov', grn: '7100039915', due: '8 Nov', stampDate: '9 OCT 2026', note: null, stale: true,
    },
  };
}

export const seedLogs: Record<Key, [string, string][]> = {
  a: [['12 Oct, 7:40 AM', 'Dispatched with Ramesh, MH14 GU 2287. Invoice INV/2610/0418 went with the goods']],
  b: [['12 Oct, 9:15 AM', 'Dispatched with Sunil, MH12 RT 0931. You went along for the first delivery']],
  c: [['8 Oct, 6:10 PM', 'Dispatched with Anil, MH14 HQ 7720'], ['9 Oct, 10:20 AM', 'Delivered at Pimpri. Stamped copy stayed with Anil']],
};

// Oldest first; the store lists newest first.
export const seedTxns: Txn[] = [
  { who: 'Kraft paper, Sai Mills', what: 'Supplier payout · 8 Oct', amt: -142500, ini: 'SM' },
  { who: 'Bharat Forge', what: 'Paid INV/2609/0377 · 9 Oct', amt: 186000, ini: 'BF' },
  { who: 'Settlement', what: 'HDFC ••4412 · 11 Oct', amt: 84210, ini: '₹' },
];

export const seedChats = {
  r: [['r', 'Left the factory. Reaching Endurance by 11.', '7:41'], ['r', 'Unloaded at Endurance. They stamped the challan and wrote 40 boxes damaged.', '11:44']],
  a: [['r', 'Pimpri delivery done. The challan is in the truck.', '9 Oct']],
} as const;

export const START = { date: '12 Oct', min: 11 * 60 + 46, bal: 318450 };
