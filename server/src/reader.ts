import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { Dispatch, Reading } from '@cc/shared';
import { MERCHANT, inr } from '@cc/shared';

// Reads a photo of a stamped delivery challan and flags what it found.
// The scripted reader returns the sample readings used in the demo. When ANTHROPIC_API_KEY
// is set, real uploaded photos are read by Claude instead. Either way the owner confirms
// every value: a stamp match is evidence, not proof.

export interface ReadResult { readings: Reading[]; recd: number | null }

const cond: Reading = { label: 'Condition', value: '“Received subject to count & QC”', detail: 'Gate receipt only. Final acceptance comes after their QC', verdict: 'Provisional', tone: 'y' };

export function scriptedRead(d: Dispatch): ReadResult {
  const r = (label: string, value: string, detail: string, verdict: string, tone: Reading['tone']): Reading => ({ label, value, detail, verdict, tone });
  if (d.k === 'a') return { recd: 960, readings: [
    r('Stamp', 'Endurance Technologies, Chakan', 'Name and GSTIN match your buyer record', 'Match', 'g'), cond,
    r('Signature', 'Mark across the stamp', 'Present. Not checked against a named signatory', 'Present', 'g'),
    r('Place', '80 m from Endurance gate 3', 'Same spot as 14 past deliveries. Supporting context only', 'Context', 'g'),
    r('Pen note', '“Recd 960 pcs, 40 damaged”', 'Matched to line 1, unit cartons. Please check', 'Shortage', 'y'),
  ] };
  if (d.k === 'c') return { recd: null, readings: [
    r('Stamp', 'Pune Precision Components, Pimpri', 'Name and GSTIN match your buyer record', 'Match', 'g'), cond,
    r('Signature', 'Mark across the stamp', 'Present. Not checked against a named signatory', 'Present', 'g'),
    r('Place', "Anil's depot, Chakan", 'Not at the buyer. Location is context, not proof', 'Off-site', 'y'),
    r('Date', `Stamp 9 Oct · photo ${d.shotAt}`, 'Matches the delivery day in your records', 'Match', 'g'),
  ] };
  return { recd: null, readings: [
    r('Stamp', 'Sundaram Auto Plast, Bhosari', 'Name matches. GSTIN is active on the GST portal', 'Match', 'g'), cond,
    r('Signature', 'Mark across the stamp', 'Present. First delivery, nothing to compare', 'Present', 'g'),
    r('Place', 'Bhosari MIDC, 40 m from GST address', 'No past deliveries here to compare', 'New', 'y'),
    r('Pen note', 'Nothing written', `All ${inr(d.qty)} received`, 'Clean', 'g'),
  ] };
}

const ChallanRead = z.object({
  is_challan: z.boolean(),
  stamp_name: z.string().nullable(),
  stamp_gstin: z.string().nullable(),
  stamp_date: z.string().nullable(),
  condition_text: z.string().nullable(),
  signature_present: z.boolean(),
  handwritten_note: z.string().nullable(),
  received_qty: z.number().int().nullable(),
});
type ChallanRead = z.infer<typeof ChallanRead>;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_challan', 'stamp_name', 'stamp_gstin', 'stamp_date', 'condition_text', 'signature_present', 'handwritten_note', 'received_qty'],
  properties: {
    is_challan: { type: 'boolean', description: 'True if the photo shows a delivery challan or goods receipt' },
    stamp_name: { type: ['string', 'null'], description: "Company name on the receiver's rubber stamp" },
    stamp_gstin: { type: ['string', 'null'], description: 'GSTIN on the stamp, if readable' },
    stamp_date: { type: ['string', 'null'], description: 'Date on the stamp, as written' },
    condition_text: { type: ['string', 'null'], description: 'Any condition wording such as "received subject to count and QC"' },
    signature_present: { type: 'boolean' },
    handwritten_note: { type: ['string', 'null'], description: 'Any handwritten note, transcribed exactly' },
    received_qty: { type: ['integer', 'null'], description: 'Received quantity if a handwritten note states one' },
  },
};

export const claudeEnabled = () => !!process.env.ANTHROPIC_API_KEY;

export async function claudeRead(d: Dispatch, image: Buffer, mime: string): Promise<ReadResult> {
  const client = new Anthropic();
  const res = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mime as 'image/jpeg', data: image.toString('base64') } },
        { type: 'text', text: `This is a photo of the receiver's copy of a delivery challan from ${MERCHANT.name} to ${d.buyer}, for ${d.qty} ${d.unit} of ${d.item}. Read the receiver's stamp, signature, any condition wording and any handwritten note. Report only what you can see. Use null when something is missing or unreadable.` },
      ],
    }],
  } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming);
  if (res.stop_reason === 'refusal') throw new Error('reader declined the photo');
  const text = res.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('');
  return mapRead(d, ChallanRead.parse(JSON.parse(text)));
}

export function mapRead(d: Dispatch, c: ChallanRead): ReadResult {
  const buyerWord = d.buyer.split(' ')[0].toLowerCase();
  const nameOk = !!c.stamp_name && c.stamp_name.toLowerCase().includes(buyerWord);
  const recd = c.received_qty && c.received_qty > 0 && c.received_qty <= d.qty ? c.received_qty : null;
  const readings: Reading[] = [
    c.is_challan
      ? { label: 'Stamp', value: c.stamp_name ?? 'Not readable', detail: nameOk ? `Name matches your buyer record${c.stamp_gstin ? `. GSTIN ${c.stamp_gstin}` : ''}` : 'Does not match your buyer record. Please check', verdict: nameOk ? 'Match' : 'Check', tone: nameOk ? 'g' : 'r' }
      : { label: 'Photo', value: 'No challan found', detail: 'Retake with the whole stamped page in the frame', verdict: 'Retake', tone: 'r' },
    c.condition_text
      ? { label: 'Condition', value: `“${c.condition_text}”`, detail: /qc|subject/i.test(c.condition_text) ? 'Gate receipt only. Final acceptance comes after their QC' : 'Read from the stamp', verdict: /qc|subject/i.test(c.condition_text) ? 'Provisional' : 'Read', tone: 'y' }
      : { label: 'Condition', value: 'No condition written', detail: 'Treated as provisional until their QC', verdict: 'Provisional', tone: 'y' },
    { label: 'Signature', value: c.signature_present ? 'Present' : 'Not found', detail: c.signature_present ? 'Not checked against a named signatory' : 'Ask for a signed copy', verdict: c.signature_present ? 'Present' : 'Missing', tone: c.signature_present ? 'g' : 'r' },
    { label: 'Date', value: c.stamp_date ?? 'Not readable', detail: `Delivery day in your records is ${d.acc}`, verdict: c.stamp_date ? 'Read' : 'Check', tone: c.stamp_date ? 'g' : 'y' },
    c.handwritten_note
      ? { label: 'Pen note', value: `“${c.handwritten_note}”`, detail: recd ? `Read as ${inr(recd)} received. Please check` : 'Please check', verdict: recd && recd < d.qty ? 'Shortage' : 'Note', tone: 'y' }
      : { label: 'Pen note', value: 'Nothing written', detail: `All ${inr(d.qty)} received`, verdict: 'Clean', tone: 'g' },
  ];
  return { readings, recd: recd ?? (c.handwritten_note ? null : d.qty) };
}
