import { SYSTEM_ROLES } from "../auth/auth.constants.js";
import {
  ORDER_STATUSES,
  PAYMENT_ATTEMPT_STATUSES,
  REFUND_STATUSES,
} from "../commerce/commerce.constants.js";
import { moneyToSubunitsBigInt } from "../commerce/commerce.money.js";
import { PRODUCT_STATUSES } from "../catalog/catalog.constants.js";
import { SUPPORT_PRIORITIES, SUPPORT_STATUSES } from "../support/support.constants.js";

function zeroBreakdown(values) {
  return Object.fromEntries(values.map((value) => [value, 0]));
}

function applyGroups(values, groups) {
  const result = zeroBreakdown(values);
  for (const group of groups) result[group.status ?? group.priority] = group._count._all;
  return result;
}

function sumMoney(aggregate) {
  const value = aggregate._sum.amount;
  return value === null ? 0n : moneyToSubunitsBigInt(value);
}

function sumMoneyRows(rows) {
  const value = rows[0]?.amount;
  return value === null || value === undefined ? 0n : moneyToSubunitsBigInt(value);
}

function presentSignedSubunits(value) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const money = `${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
  return negative ? `-${money}` : money;
}

function integerValue(value) {
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value.toNumber === "function") return value.toNumber();
  return Number(value ?? 0);
}

export function createReportsService(database, config, { now = () => new Date() } = {}) {
  return {
    async overview(query) {
      const range = { gte: query.from, lt: query.to };
      const currency = config.business.currency;
      const [
        orderCount,
        orderGroups,
        capturedAggregate,
        refundRows,
        customerCount,
        inventoryRows,
        ticketCount,
        ticketStatusGroups,
        ticketPriorityGroups,
      ] = await Promise.all([
        database.order.count({ where: { createdAt: range } }),
        database.order.groupBy({
          by: ["status"],
          where: { createdAt: range },
          _count: { _all: true },
        }),
        database.paymentAttempt.aggregate({
          where: {
            status: PAYMENT_ATTEMPT_STATUSES.CAPTURED,
            currency,
            createdAt: range,
          },
          _sum: { amount: true },
        }),
        database.$queryRaw`
          SELECT COALESCE(SUM(r.amount), 0) AS amount
          FROM refunds r FORCE INDEX (refunds_status_currency_updated_at_amount_idx)
          WHERE r.status = ${REFUND_STATUSES.PROCESSED}
            AND r.currency = ${currency}
            AND r.updated_at >= ${query.from}
            AND r.updated_at < ${query.to}
        `,
        database.user.count({
          where: {
            createdAt: range,
            roles: { some: { role: { code: SYSTEM_ROLES.CUSTOMER } } },
          },
        }),
        database.$queryRaw`
          SELECT
            COALESCE(SUM(CASE WHEN ib.on_hand = 0 THEN 1 ELSE 0 END), 0) AS out_of_stock,
            COALESCE(SUM(CASE WHEN ib.on_hand > 0 AND ib.on_hand <= ib.low_stock_threshold THEN 1 ELSE 0 END), 0) AS low_stock
          FROM inventory_balances ib
          INNER JOIN products p ON p.id = ib.product_id
          WHERE p.status = ${PRODUCT_STATUSES.ACTIVE}
        `,
        database.supportTicket.count({ where: { createdAt: range } }),
        database.supportTicket.groupBy({
          by: ["status"],
          where: { createdAt: range },
          _count: { _all: true },
        }),
        database.supportTicket.groupBy({
          by: ["priority"],
          where: { createdAt: range },
          _count: { _all: true },
        }),
      ]);

      const capturedSubunits = sumMoney(capturedAggregate);
      const refundSubunits = sumMoneyRows(refundRows);
      const statusBreakdown = applyGroups(Object.values(SUPPORT_STATUSES), ticketStatusGroups);
      const openStateBreakdown = Object.fromEntries(
        Object.entries(statusBreakdown).filter(([status]) => status !== SUPPORT_STATUSES.CLOSED),
      );
      const inventory = inventoryRows[0] ?? {};

      return {
        asOf: now().toISOString(),
        from: query.from.toISOString(),
        to: query.to.toISOString(),
        timeZone: "UTC",
        currency,
        orders: {
          createdCount: orderCount,
          currentStatusBreakdown: applyGroups(Object.values(ORDER_STATUSES), orderGroups),
        },
        paymentFlow: {
          capturedAmount: presentSignedSubunits(capturedSubunits),
          processedRefundAmount: presentSignedSubunits(refundSubunits),
          netAmount: presentSignedSubunits(capturedSubunits - refundSubunits),
        },
        customers: { newAccountCount: customerCount },
        inventory: {
          lowStockProductCount: integerValue(inventory.low_stock),
          outOfStockProductCount: integerValue(inventory.out_of_stock),
        },
        tickets: {
          createdCount: ticketCount,
          currentOpenCount: Object.values(openStateBreakdown).reduce(
            (total, count) => total + count,
            0,
          ),
          currentOpenStateBreakdown: openStateBreakdown,
          currentStatusBreakdown: statusBreakdown,
          currentPriorityBreakdown: applyGroups(
            Object.values(SUPPORT_PRIORITIES),
            ticketPriorityGroups,
          ),
        },
      };
    },
  };
}
