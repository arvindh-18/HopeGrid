import { describe, expect, it } from 'vitest';
import { assignmentMessage, waNumber, whatsappLink } from '../src/lib/whatsapp';

describe('WhatsApp assignment link (F14)', () => {
  it('normalises phone numbers for wa.me', () => {
    expect(waNumber('+91 98400 11111')).toBe('919840011111');
    expect(waNumber('9840011111')).toBe('919840011111'); // bare Indian mobile number
    expect(waNumber('09840011111')).toBe('919840011111');
    expect(waNumber(null)).toBeNull();
    expect(waNumber('12ab')).toBeNull();
  });
  it('builds a link with an encoded message and no victim details', () => {
    const msg = assignmentMessage({ typeLabel: 'Flood', priorityLabel: 'Critical', incidentCode: 'AB12C', area: 'Central Street', url: 'https://x.test/volunteer/assignments/1' });
    expect(msg).toContain('critical priority flood incident (#AB12C) near Central Street');
    const link = whatsappLink('+919840011111', msg)!;
    expect(link.startsWith('https://wa.me/919840011111?text=')).toBe(true);
    expect(decodeURIComponent(link.split('text=')[1])).toBe(msg);
    expect(whatsappLink(null, msg)).toBeNull();
  });
});
