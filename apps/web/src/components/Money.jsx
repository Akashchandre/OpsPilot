export function Money({ amount, currency }) {
  let value;
  try {
    value = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(Number(amount));
  } catch {
    value = `${currency} ${amount}`;
  }
  return <span>{value}</span>;
}
