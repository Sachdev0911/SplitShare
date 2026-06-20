import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: string = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
  }).format(amount);
}

export function calculateNetBalances(expenses: any[], payments: any[], members: string[]) {
  const balances: Record<string, number> = {};
  members.forEach(id => balances[id] = 0);

  // Process Expenses
  expenses.forEach(expense => {
    // Only include approved expenses in the balance calculation
    if (expense.status !== 'approved') return;

    const paidBy = expense.paidById;
    const amount = expense.totalAmount;
    
    // Payer gets back the total amount
    balances[paidBy] += amount;
    
    // Everyone pays their split
    Object.entries(expense.splits).forEach(([userId, splitAmount]) => {
      balances[userId] -= (splitAmount as number);
    });
  });

  // Process Payments (Settlements)
  payments.forEach(payment => {
    // Only include completed (cleared) payments
    if (payment.status !== 'completed') return;

    const fromUser = payment.fromUser;
    const toUser = payment.toUser;
    const amount = payment.amount;

    // The person who paid increases their balance (reduces debt)
    balances[fromUser] += amount;
    // The person who received decreases their balance (reduces credit)
    balances[toUser] -= amount;
  });

  return balances;
}

// Greedy algorithm to minimize transactions
export function settleDebts(balances: Record<string, number>) {
  const debtors: { id: string; amount: number }[] = [];
  const creditors: { id: string; amount: number }[] = [];

  Object.entries(balances).forEach(([id, amount]) => {
    if (amount < -0.01) debtors.push({ id, amount: Math.abs(amount) });
    else if (amount > 0.01) creditors.push({ id, amount });
  });

  const transactions: { from: string; to: string; amount: number }[] = [];

  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    transactions.push({ from: debtors[i].id, to: creditors[j].id, amount });

    debtors[i].amount -= amount;
    creditors[j].amount -= amount;

    if (debtors[i].amount < 0.01) i++;
    if (creditors[j].amount < 0.01) j++;
  }

  return transactions;
}
