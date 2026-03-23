export type TicketBackRuleInput = {
  minTicketCount: number;
  maxTicketCount: number | null;
  backUnitPrice: number;
};

export function calculateTicketBack(totalTickets: number, rules: TicketBackRuleInput[]): number {
  return rules.reduce((sum, rule) => {
    const max = rule.maxTicketCount ?? totalTickets;
    const applicable = Math.max(Math.min(totalTickets, max) - rule.minTicketCount + 1, 0);
    return sum + applicable * rule.backUnitPrice;
  }, 0);
}
