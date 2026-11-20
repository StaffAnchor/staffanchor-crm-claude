// How the firm bills, in one place. A fee is normally invoiced 30 to 45 days after the candidate joins, and the invoice is payable
// 15 days after it is raised, so the money arrives about 60 days after joining (up to 90). The "due date" stored on a fee is only the
// milestone when it becomes billable (usually the joining day), not a payment date, so lateness is worked out from these rules.

export const BILL_FROM_DAYS = 30;
export const BILL_BY_DAYS = 45;
export const PAYABLE_DAYS = 15;
export const PAY_TARGET_DAYS = BILL_BY_DAYS + PAYABLE_DAYS;
export const PAY_OUTER_DAYS = 90;

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * billBy: the latest day to raise the invoice (45 days after joining).
 * payBy: when the money should be in: 15 days after the invoice, or, if no invoice yet, 60 days after joining.
 */
export function feeDates(p: { joinedOn: string | null; invoicedOn: string | null }): { billBy: string | null; payBy: string | null } {
  return {
    billBy: p.joinedOn ? addDays(p.joinedOn, BILL_BY_DAYS) : null,
    payBy: p.invoicedOn ? addDays(p.invoicedOn, PAYABLE_DAYS) : p.joinedOn ? addDays(p.joinedOn, PAY_TARGET_DAYS) : null,
  };
}
