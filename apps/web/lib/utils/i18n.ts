export function formatStatus(status: "PENDING" | "PAID" | "RECEIVED" | "CANCELED"): string {
  const map = {
    PENDING: "Pendente",
    PAID: "Pago",
    RECEIVED: "Recebido",
    CANCELED: "Cancelado"
  };
  return map[status];
}

export function formatBehavior(behavior: "FIXED" | "VARIABLE" | "PROVISION"): string {
  const map = {
    FIXED: "Fixo",
    VARIABLE: "Variável",
    PROVISION: "Provisão"
  };
  return map[behavior];
}

export function formatType(type: "INCOME" | "EXPENSE"): string {
  return type === "INCOME" ? "Entrada" : "Saída";
}

export function formatFrequency(frequency: "MONTHLY" | "BIWEEKLY" | "WEEKLY"): string {
  const map = {
    MONTHLY: "Mensal",
    BIWEEKLY: "Quinzenal",
    WEEKLY: "Semanal"
  };
  return map[frequency];
}

export function formatAccountType(type: string): string {
  if (type === "BANK_ACCOUNT") return "Conta bancária";
  if (type === "CASH") return "Dinheiro";
  if (type === "CREDIT_CARD") return "Cartão de crédito";
  return type;
}
