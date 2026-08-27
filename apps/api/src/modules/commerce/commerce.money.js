import { createHash } from "node:crypto";
import { commerceError } from "./commerce.errors.js";
import { MAX_ORDER_TOTAL_SUBUNITS } from "./commerce.constants.js";

const moneyPattern = /^(0|[1-9]\d*)\.(\d{2})$/;

export function presentMoney(value) {
  if (value && typeof value.toFixed === "function") return value.toFixed(2);
  if (typeof value === "number") return value.toFixed(2);

  const text = String(value);
  if (/^(0|[1-9]\d*)$/.test(text)) return `${text}.00`;
  if (/^(0|[1-9]\d*)\.\d$/.test(text)) return `${text}0`;
  if (moneyPattern.test(text)) return text;
  throw commerceError(500, "MONEY_STATE_INVALID", "Stored money state is invalid");
}

export function moneyToSubunits(value) {
  const text = presentMoney(value);
  const subunits = moneyToSubunitsBigInt(text);

  if (subunits > BigInt(MAX_ORDER_TOTAL_SUBUNITS)) {
    throw commerceError(
      422,
      "ORDER_TOTAL_OUT_OF_RANGE",
      "The order total is outside the supported payment range",
    );
  }

  return Number(subunits);
}

export function moneyToSubunitsBigInt(value) {
  const text = presentMoney(value);
  const match = moneyPattern.exec(text);
  return BigInt(match[1]) * 100n + BigInt(match[2]);
}

export function subunitsToMoney(subunits) {
  if (!Number.isSafeInteger(subunits) || subunits < 0) {
    throw commerceError(500, "MONEY_STATE_INVALID", "Stored money state is invalid");
  }
  const whole = Math.floor(subunits / 100);
  const fraction = String(subunits % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function bigSubunitsToMoney(subunits) {
  if (typeof subunits !== "bigint" || subunits < 0n) {
    throw commerceError(500, "MONEY_STATE_INVALID", "Stored money state is invalid");
  }
  return `${subunits / 100n}.${String(subunits % 100n).padStart(2, "0")}`;
}

export function lineTotalSubunits(unitPrice, quantity) {
  const unitSubunits = moneyToSubunits(unitPrice);
  const total = unitSubunits * quantity;
  if (!Number.isSafeInteger(total) || total > MAX_ORDER_TOTAL_SUBUNITS) {
    throw commerceError(
      422,
      "ORDER_TOTAL_OUT_OF_RANGE",
      "The order total is outside the supported payment range",
    );
  }
  return total;
}

export function sumSubunits(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total) || total > MAX_ORDER_TOTAL_SUBUNITS) {
    throw commerceError(
      422,
      "ORDER_TOTAL_OUT_OF_RANGE",
      "The order total is outside the supported payment range",
    );
  }
  return total;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function digestRequest(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}
