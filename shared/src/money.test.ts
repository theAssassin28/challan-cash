import { describe, expect, it } from 'vitest';
import { apr, cn, feeOf, maxAdv, nowCap, offerOptions, payable, t2For } from './index';

const endurance = { qty: 1000, recd: 960, rate: 250, pct: 0.8, newB: false, fee: 0.02, tenor: 45 };
const sundaram = { qty: 2400, recd: 2400, rate: 50, pct: 0.5, newB: true, fee: 0.025, tenor: 45 };

describe('advance rules', () => {
  it('pays 50% now and the rest up to 80% when QC clears', () => {
    expect(payable(endurance)).toBe(240000);
    expect(cn(endurance)).toBe(10000);
    expect(nowCap(endurance)).toBe(120000);
    expect(t2For(endurance, 120000)).toBe(72000);
    expect(maxAdv(endurance)).toBe(192000);
    expect(feeOf(endurance, 120000) + feeOf(endurance, 72000)).toBe(3840);
    expect(apr(endurance)).toBe('16.2');
  });
  it('caps a new buyer at one part of 50%', () => {
    expect(nowCap(sundaram)).toBe(60000);
    expect(t2For(sundaram, 60000)).toBe(0);
    expect(offerOptions(sundaram)).toEqual([30000, 45000, 60000]);
  });
});
