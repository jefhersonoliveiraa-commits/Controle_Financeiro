export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`));
}
