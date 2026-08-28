import { randomUUID } from "node:crypto";
import { AUDIT_ACTIONS, AUDIT_ACTOR_KINDS, AUDIT_TARGET_TYPES } from "../audit/audit.constants.js";
import { auditDescriptor } from "../audit/audit.descriptor.js";
import { createAuditService } from "../audit/audit.service.js";
import {
  ORDER_EVENT_SOURCES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  PRODUCT_STATUS_ACTIVE,
} from "../commerce/commerce.constants.js";
import {
  commerceError,
  commerceNotFound,
  commerceVersionConflict,
  idempotencyConflict,
  isPrismaUniqueViolation,
  isPrismaWriteConflict,
} from "../commerce/commerce.errors.js";
import {
  digestRequest,
  lineTotalSubunits,
  moneyToSubunits,
  presentMoney,
  subunitsToMoney,
  sumSubunits,
} from "../commerce/commerce.money.js";
import { expireDueOrders, releaseReservations } from "./reservation.service.js";
import {
  orderDetailInclude,
  orderSummaryInclude,
  presentOrder,
  presentOrderSummary,
} from "./orders.presenter.js";

function paginationMeta(page, limit, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

function orderNumberFromId(orderId) {
  return `OP-${orderId.replaceAll("-", "").slice(0, 18).toUpperCase()}`;
}

function providerReceiptFromId(orderId) {
  return `op_${orderId}`;
}

function providerTimestamp(value) {
  return Number.isSafeInteger(value) && value > 0 ? new Date(value * 1000) : null;
}

function providerOrderMatches(payment, providerOrder) {
  return (
    providerOrder &&
    typeof providerOrder.id === "string" &&
    /^order_[A-Za-z0-9_]{1,58}$/.test(providerOrder.id) &&
    Number.isSafeInteger(providerOrder.amount) &&
    providerOrder.amount === moneyToSubunits(payment.amount) &&
    providerOrder.currency === payment.currency &&
    providerOrder.receipt === payment.providerReceipt &&
    ["created", "attempted", "paid"].includes(providerOrder.status)
  );
}

function checkoutOptions(order, payment, paymentProvider, config) {
  if (!payment.providerOrderId || payment.status !== PAYMENT_STATUSES.OPEN) return null;
  return {
    orderId: order.id,
    paymentId: payment.id,
    provider: payment.provider,
    keyId: paymentProvider.keyId,
    providerOrderId: payment.providerOrderId,
    amountSubunits: moneyToSubunits(payment.amount),
    currency: payment.currency,
    timeoutSeconds: config.payments.reservationTtlMinutes * 60,
    scriptUrl: paymentProvider.checkoutScriptUrl,
  };
}

async function loadOrder(database, orderId, { userId, management = false } = {}) {
  const order = await database.order.findFirst({
    where: { id: orderId, ...(management ? {} : { userId }) },
    include: orderDetailInclude,
  });
  if (!order) throw commerceNotFound("ORDER");
  return order;
}

async function moveOrderToPaymentReview(database, paymentId, reasonCode, appendAudit, requestId) {
  await database.$transaction(
    async (transaction) => {
      const payment = await transaction.payment.findUnique({
        where: { id: paymentId },
        include: { order: true },
      });
      if (!payment) return;

      const paymentUpdate = await transaction.payment.updateMany({
        where: { id: payment.id, version: payment.version },
        data: { status: PAYMENT_STATUSES.REVIEW_REQUIRED, version: { increment: 1 } },
      });
      let changed = paymentUpdate.count === 1;
      if (payment.order.status !== ORDER_STATUSES.PAYMENT_REVIEW) {
        const update = await transaction.order.updateMany({
          where: { id: payment.order.id, version: payment.order.version },
          data: { status: ORDER_STATUSES.PAYMENT_REVIEW, version: { increment: 1 } },
        });
        if (update.count === 1) {
          changed = true;
          await transaction.orderStatusEvent.create({
            data: {
              orderId: payment.order.id,
              fromStatus: payment.order.status,
              toStatus: ORDER_STATUSES.PAYMENT_REVIEW,
              source: ORDER_EVENT_SOURCES.SYSTEM,
              reasonCode,
            },
          });
        }
      }
      if (changed) {
        await appendAudit(
          transaction,
          auditDescriptor({
            action: AUDIT_ACTIONS.PAYMENT_PROVIDER_STATE_APPLIED,
            actorKind: AUDIT_ACTOR_KINDS.PROVIDER,
            targetType: AUDIT_TARGET_TYPES.PAYMENT,
            targetId: payment.id,
            requestId,
            metadata: {
              source: "PROVIDER",
              paymentStatus: PAYMENT_STATUSES.REVIEW_REQUIRED,
              orderStatus: ORDER_STATUSES.PAYMENT_REVIEW,
            },
          }),
        );
      }
    },
    { isolationLevel: "Serializable" },
  );
}

async function prepareProviderOrder(
  database,
  config,
  paymentProvider,
  order,
  appendAudit,
  requestId,
) {
  let payment = order.payment;
  if (!payment) throw commerceError(500, "PAYMENT_STATE_INVALID", "Payment state is invalid");

  const existingCheckout = checkoutOptions(order, payment, paymentProvider, config);
  if (existingCheckout) return { checkout: existingCheckout, providerCode: null };
  if (payment.status !== PAYMENT_STATUSES.CREATING) {
    return { checkout: null, providerCode: "PAYMENT_NOT_OPEN" };
  }

  let providerOrder;
  let providerCode = null;
  try {
    providerOrder = await paymentProvider.createOrder({
      amountSubunits: moneyToSubunits(payment.amount),
      currency: payment.currency,
      receipt: payment.providerReceipt,
    });
  } catch (error) {
    providerCode = error?.code ?? "PAYMENT_PROVIDER_UNAVAILABLE";
    try {
      providerOrder = await paymentProvider.findOrderByReceipt(payment.providerReceipt);
    } catch {
      providerOrder = null;
    }
  }

  if (!providerOrder) return { checkout: null, providerCode };
  if (!providerOrderMatches(payment, providerOrder)) {
    await moveOrderToPaymentReview(
      database,
      payment.id,
      "PROVIDER_ORDER_MISMATCH",
      appendAudit,
      requestId,
    );
    return { checkout: null, providerCode: "PAYMENT_PROVIDER_STATE_MISMATCH" };
  }

  const nextPaymentStatus =
    providerOrder.status === "paid" ? PAYMENT_STATUSES.REVIEW_REQUIRED : PAYMENT_STATUSES.OPEN;
  const update = await database.$transaction(
    async (transaction) => {
      const result = await transaction.payment.updateMany({
        where: { id: payment.id, version: payment.version, providerOrderId: null },
        data: {
          providerOrderId: providerOrder.id,
          providerOrderStatus: providerOrder.status,
          status: nextPaymentStatus,
          lastProviderEventAt: providerTimestamp(providerOrder.created_at),
          version: { increment: 1 },
        },
      });
      if (result.count === 1) {
        await appendAudit(
          transaction,
          auditDescriptor({
            action: AUDIT_ACTIONS.PAYMENT_PROVIDER_ORDER_LINKED,
            actorKind: AUDIT_ACTOR_KINDS.PROVIDER,
            targetType: AUDIT_TARGET_TYPES.PAYMENT,
            targetId: payment.id,
            requestId,
            metadata: {
              paymentStatus: nextPaymentStatus,
              providerOrderStatus: providerOrder.status,
            },
          }),
        );
      }
      return result;
    },
    { isolationLevel: "Serializable" },
  );

  payment = await database.payment.findUnique({ where: { id: payment.id } });
  if (!payment) throw commerceError(500, "PAYMENT_STATE_INVALID", "Payment state is invalid");
  if (update.count === 0 && payment.providerOrderId !== providerOrder.id) {
    await moveOrderToPaymentReview(
      database,
      payment.id,
      "PROVIDER_ORDER_CONFLICT",
      appendAudit,
      requestId,
    );
    return { checkout: null, providerCode: "PAYMENT_PROVIDER_STATE_MISMATCH" };
  }
  if (nextPaymentStatus === PAYMENT_STATUSES.REVIEW_REQUIRED) {
    await moveOrderToPaymentReview(
      database,
      payment.id,
      "PROVIDER_ORDER_ALREADY_PAID",
      appendAudit,
      requestId,
    );
    return { checkout: null, providerCode: "PAYMENT_RECONCILIATION_REQUIRED" };
  }

  return { checkout: checkoutOptions(order, payment, paymentProvider, config), providerCode };
}

function mapOrderWriteError(error) {
  if (error?.isOperational) throw error;
  if (isPrismaWriteConflict(error)) {
    throw commerceError(
      409,
      "CHECKOUT_CONFLICT",
      "Checkout conflicted with another inventory or order update. Refresh and try again.",
    );
  }
  throw error;
}

export function createOrdersService(database, config, paymentProvider) {
  const appendAudit = createAuditService(database, config).append;
  async function findIdempotentOrder(userId, idempotencyKey, requestHash) {
    const order = await database.order.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: orderDetailInclude,
    });
    if (!order) return null;
    if (order.requestHash !== requestHash) throw idempotencyConflict();
    return order;
  }

  async function finishOrderResponse(order, requestId) {
    const setup = await prepareProviderOrder(
      database,
      config,
      paymentProvider,
      order,
      appendAudit,
      requestId,
    );
    const refreshed = await loadOrder(database, order.id, { userId: order.userId });
    return {
      order: presentOrder(refreshed),
      checkout: setup.checkout,
      paymentSetupPending: setup.checkout === null,
      providerCode: setup.providerCode,
    };
  }

  return {
    async create({ userId, input, idempotencyKey, requestId }) {
      if (!paymentProvider.enabled) {
        throw commerceError(
          503,
          "PAYMENT_PROVIDER_NOT_CONFIGURED",
          "Checkout is temporarily unavailable",
        );
      }

      const requestHash = digestRequest(input);
      const existing = await findIdempotentOrder(userId, idempotencyKey, requestHash);
      if (existing) return finishOrderResponse(existing, requestId);

      let created;
      try {
        created = await database.$transaction(
          async (transaction) => {
            const racedOrder = await transaction.order.findUnique({
              where: { userId_idempotencyKey: { userId, idempotencyKey } },
              include: orderDetailInclude,
            });
            if (racedOrder) {
              if (racedOrder.requestHash !== requestHash) throw idempotencyConflict();
              return racedOrder;
            }

            const cart = await transaction.cart.findUnique({
              where: { userId },
              include: {
                items: {
                  include: { product: { include: { inventoryBalance: true } } },
                  orderBy: [{ createdAt: "asc" }, { productId: "asc" }],
                },
              },
            });
            if (!cart || cart.items.length === 0) {
              throw commerceError(409, "CART_EMPTY", "The cart is empty");
            }
            if (cart.version !== input.cartVersion) throw commerceVersionConflict();

            const lines = cart.items.map((item) => {
              const product = item.product;
              if (product.status !== PRODUCT_STATUS_ACTIVE) {
                throw commerceError(
                  409,
                  "CART_PRODUCT_UNAVAILABLE",
                  "A cart product is no longer available",
                  [{ productId: product.id }],
                );
              }
              if (
                product.currency !== config.business.currency ||
                item.observedCurrency !== config.business.currency
              ) {
                throw commerceError(
                  409,
                  "CART_CURRENCY_CHANGED",
                  "A cart product currency changed",
                  [{ productId: product.id }],
                );
              }
              if (presentMoney(product.price) !== presentMoney(item.observedUnitPrice)) {
                throw commerceError(
                  409,
                  "CART_PRICE_CHANGED",
                  "A cart price changed. Review the cart before checkout.",
                  [
                    {
                      productId: product.id,
                      observedUnitPrice: presentMoney(item.observedUnitPrice),
                      currentUnitPrice: presentMoney(product.price),
                    },
                  ],
                );
              }
              if (!product.inventoryBalance || product.inventoryBalance.onHand < item.quantity) {
                throw commerceError(
                  409,
                  "CHECKOUT_STOCK_UNAVAILABLE",
                  "A cart quantity is no longer available",
                  [{ productId: product.id }],
                );
              }

              const lineSubunits = lineTotalSubunits(product.price, item.quantity);
              return {
                id: randomUUID(),
                product,
                quantity: item.quantity,
                lineSubunits,
              };
            });
            const subtotalSubunits = sumSubunits(lines.map((line) => line.lineSubunits));
            if (subtotalSubunits <= 0) {
              throw commerceError(409, "ORDER_TOTAL_INVALID", "The order total must be positive");
            }

            const orderId = randomUUID();
            const orderNumber = orderNumberFromId(orderId);
            const reservationExpiresAt = new Date(
              Date.now() + config.payments.reservationTtlMinutes * 60 * 1000,
            );
            const subtotal = subunitsToMoney(subtotalSubunits);
            const address = input.shippingAddress;

            for (const line of lines) {
              const balance = line.product.inventoryBalance;
              const quantityAfter = balance.onHand - line.quantity;
              const update = await transaction.inventoryBalance.updateMany({
                where: {
                  productId: line.product.id,
                  version: balance.version,
                  onHand: { gte: line.quantity },
                },
                data: { onHand: quantityAfter, version: { increment: 1 } },
              });
              if (update.count !== 1) {
                throw commerceError(
                  409,
                  "CHECKOUT_STOCK_UNAVAILABLE",
                  "A cart quantity is no longer available",
                  [{ productId: line.product.id }],
                );
              }
              await transaction.inventoryAdjustment.create({
                data: {
                  productId: line.product.id,
                  delta: -line.quantity,
                  quantityBefore: balance.onHand,
                  quantityAfter,
                  reason: "ORDER_RESERVATION",
                  note: `Order ${orderNumber}`,
                  actorUserId: userId,
                  requestId,
                },
              });
            }

            await transaction.order.create({
              data: {
                id: orderId,
                orderNumber,
                userId,
                subtotal,
                taxTotal: "0.00",
                discountTotal: "0.00",
                shippingTotal: "0.00",
                total: subtotal,
                currency: config.business.currency,
                recipientName: address.recipientName,
                phone: address.phone,
                addressLine1: address.addressLine1,
                addressLine2: address.addressLine2,
                city: address.city,
                state: address.state,
                postalCode: address.postalCode,
                countryCode: address.countryCode,
                reservationExpiresAt,
                idempotencyKey,
                requestHash,
                items: {
                  create: lines.map((line) => ({
                    id: line.id,
                    productId: line.product.id,
                    productSku: line.product.sku,
                    productName: line.product.name,
                    unitPrice: line.product.price,
                    quantity: line.quantity,
                    lineTotal: subunitsToMoney(line.lineSubunits),
                    currency: line.product.currency,
                  })),
                },
                reservations: {
                  create: lines.map((line) => ({
                    orderItemId: line.id,
                    productId: line.product.id,
                    quantity: line.quantity,
                    expiresAt: reservationExpiresAt,
                  })),
                },
                statusEvents: {
                  create: {
                    toStatus: ORDER_STATUSES.PENDING_PAYMENT,
                    source: ORDER_EVENT_SOURCES.CUSTOMER,
                    reasonCode: "CHECKOUT_CREATED",
                    actorUserId: userId,
                    requestId,
                  },
                },
                payment: {
                  create: {
                    amount: subtotal,
                    currency: config.business.currency,
                    providerReceipt: providerReceiptFromId(orderId),
                  },
                },
              },
            });

            await transaction.cartItem.deleteMany({ where: { cartId: cart.id } });
            const cartUpdate = await transaction.cart.updateMany({
              where: { id: cart.id, version: input.cartVersion },
              data: { version: { increment: 1 } },
            });
            if (cartUpdate.count !== 1) throw commerceVersionConflict();

            await appendAudit(
              transaction,
              auditDescriptor({
                action: AUDIT_ACTIONS.ORDER_CREATED,
                actorUserId: userId,
                targetType: AUDIT_TARGET_TYPES.ORDER,
                targetId: orderId,
                requestId,
                metadata: {
                  itemCount: lines.length,
                  totalQuantity: lines.reduce((total, line) => total + line.quantity, 0),
                  currency: config.business.currency,
                },
              }),
            );

            return transaction.order.findUnique({
              where: { id: orderId },
              include: orderDetailInclude,
            });
          },
          { isolationLevel: "Serializable" },
        );
      } catch (error) {
        if (isPrismaUniqueViolation(error)) {
          const raced = await findIdempotentOrder(userId, idempotencyKey, requestHash);
          if (raced) return finishOrderResponse(raced, requestId);
        }
        mapOrderWriteError(error);
      }

      return finishOrderResponse(created, requestId);
    },

    async list({ userId, query, management = false }) {
      await expireDueOrders(database);
      const where = {
        ...(management ? {} : { userId }),
        ...(query.status === "ALL" ? {} : { status: query.status }),
      };
      const [orders, total] = await database.$transaction([
        database.order.findMany({
          where,
          include: orderSummaryInclude,
          orderBy: [{ createdAt: query.direction }, { id: "asc" }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        database.order.count({ where }),
      ]);
      return {
        orders: orders.map((order) => presentOrderSummary(order, { management })),
        meta: paginationMeta(query.page, query.limit, total),
      };
    },

    async get({ userId, orderId, management = false }) {
      await expireDueOrders(database);
      return presentOrder(await loadOrder(database, orderId, { userId, management }), {
        management,
      });
    },

    async paymentSession({ userId, orderId, requestId }) {
      await expireDueOrders(database);
      const order = await loadOrder(database, orderId, { userId });
      if (
        order.status !== ORDER_STATUSES.PENDING_PAYMENT ||
        order.reservationExpiresAt <= new Date()
      ) {
        throw commerceError(409, "ORDER_NOT_PAYABLE", "This order can no longer be paid");
      }
      return finishOrderResponse(order, requestId);
    },

    async cancelOwn({ userId, orderId, input, requestId }) {
      try {
        const order = await database.$transaction(
          async (transaction) => {
            const current = await transaction.order.findFirst({
              where: { id: orderId, userId },
              include: { payment: true },
            });
            if (!current) throw commerceNotFound("ORDER");
            if (current.version !== input.version) throw commerceVersionConflict();
            if (current.status !== ORDER_STATUSES.PENDING_PAYMENT) {
              throw commerceError(
                409,
                "ORDER_CANCELLATION_NOT_ALLOWED",
                "Only an unpaid pending order can be cancelled",
              );
            }
            if (current.payment?.status === PAYMENT_STATUSES.CAPTURED) {
              throw commerceError(
                409,
                "ORDER_CANCELLATION_NOT_ALLOWED",
                "Captured payment requires operator review",
              );
            }

            const now = new Date();
            await releaseReservations(transaction, current, {
              actorUserId: userId,
              requestId,
              now,
            });
            const update = await transaction.order.updateMany({
              where: {
                id: current.id,
                version: input.version,
                status: ORDER_STATUSES.PENDING_PAYMENT,
              },
              data: {
                status: ORDER_STATUSES.CANCELLED,
                cancelledAt: now,
                version: { increment: 1 },
              },
            });
            if (update.count !== 1) throw commerceVersionConflict();
            await transaction.orderStatusEvent.create({
              data: {
                orderId: current.id,
                fromStatus: ORDER_STATUSES.PENDING_PAYMENT,
                toStatus: ORDER_STATUSES.CANCELLED,
                source: ORDER_EVENT_SOURCES.CUSTOMER,
                reasonCode: "CUSTOMER_CANCELLED",
                actorUserId: userId,
                requestId,
              },
            });
            await appendAudit(
              transaction,
              auditDescriptor({
                action: AUDIT_ACTIONS.ORDER_CANCELLED,
                actorUserId: userId,
                targetType: AUDIT_TARGET_TYPES.ORDER,
                targetId: current.id,
                requestId,
                metadata: {
                  fromStatus: ORDER_STATUSES.PENDING_PAYMENT,
                  toStatus: ORDER_STATUSES.CANCELLED,
                  reasonCode: "CUSTOMER_CANCELLED",
                },
              }),
            );
            return transaction.order.findUnique({
              where: { id: current.id },
              include: orderDetailInclude,
            });
          },
          { isolationLevel: "Serializable" },
        );
        return presentOrder(order);
      } catch (error) {
        mapOrderWriteError(error);
      }
    },

    async updateStatus({ actorUserId, orderId, input, requestId }) {
      try {
        const order = await database.$transaction(
          async (transaction) => {
            const current = await transaction.order.findUnique({
              where: { id: orderId },
              include: { payment: true },
            });
            if (!current) throw commerceNotFound("ORDER");
            if (current.version !== input.version) throw commerceVersionConflict();
            if (current.status === input.status) {
              return transaction.order.findUnique({
                where: { id: current.id },
                include: orderDetailInclude,
              });
            }

            const allowed = {
              [ORDER_STATUSES.PENDING_PAYMENT]: [ORDER_STATUSES.CANCELLED],
              [ORDER_STATUSES.CONFIRMED]: [ORDER_STATUSES.PROCESSING, ORDER_STATUSES.CANCELLED],
              [ORDER_STATUSES.PROCESSING]: [ORDER_STATUSES.SHIPPED],
              [ORDER_STATUSES.SHIPPED]: [ORDER_STATUSES.DELIVERED],
              [ORDER_STATUSES.PAYMENT_REVIEW]: [ORDER_STATUSES.CANCELLED],
            };
            if (!allowed[current.status]?.includes(input.status)) {
              throw commerceError(
                409,
                "ORDER_STATUS_TRANSITION_INVALID",
                `Order cannot move from ${current.status} to ${input.status}`,
              );
            }

            const now = new Date();
            const data = { status: input.status, version: { increment: 1 } };
            let reasonCode = `OPERATOR_${input.status}`;

            if (input.status === ORDER_STATUSES.CANCELLED) {
              if (
                current.status === ORDER_STATUSES.PAYMENT_REVIEW &&
                current.payment?.status !== PAYMENT_STATUSES.REFUNDED
              ) {
                throw commerceError(
                  409,
                  "PAYMENT_REVIEW_UNRESOLVED",
                  "The reviewed payment must be refunded before cancellation",
                );
              }
              await releaseReservations(transaction, current, {
                actorUserId,
                requestId,
                now,
              });
              data.cancelledAt = now;
              if (current.status === ORDER_STATUSES.CONFIRMED) {
                const paymentUpdate = await transaction.payment.updateMany({
                  where: {
                    id: current.payment?.id ?? "",
                    status: PAYMENT_STATUSES.CAPTURED,
                  },
                  data: { status: PAYMENT_STATUSES.REFUND_PENDING, version: { increment: 1 } },
                });
                if (paymentUpdate.count !== 1) {
                  throw commerceError(
                    409,
                    "PAYMENT_REFUND_STATE_INVALID",
                    "Captured payment is not ready for refund",
                  );
                }
                reasonCode = "OPERATOR_CANCELLED_REFUND_REQUIRED";
              }
            } else if (input.status === ORDER_STATUSES.PROCESSING) {
              data.processingAt = now;
            } else if (input.status === ORDER_STATUSES.SHIPPED) {
              data.shippedAt = now;
              data.carrierName = input.carrierName;
              data.trackingNumber = input.trackingNumber;
            } else if (input.status === ORDER_STATUSES.DELIVERED) {
              data.deliveredAt = now;
            }

            const update = await transaction.order.updateMany({
              where: { id: current.id, version: input.version, status: current.status },
              data,
            });
            if (update.count !== 1) throw commerceVersionConflict();
            await transaction.orderStatusEvent.create({
              data: {
                orderId: current.id,
                fromStatus: current.status,
                toStatus: input.status,
                source: ORDER_EVENT_SOURCES.OPERATOR,
                reasonCode,
                actorUserId,
                requestId,
              },
            });
            await appendAudit(
              transaction,
              auditDescriptor({
                action: AUDIT_ACTIONS.ORDER_STATUS_CHANGED,
                actorUserId,
                targetType: AUDIT_TARGET_TYPES.ORDER,
                targetId: current.id,
                requestId,
                metadata: {
                  fromStatus: current.status,
                  toStatus: input.status,
                  reasonCode,
                },
              }),
            );
            return transaction.order.findUnique({
              where: { id: current.id },
              include: orderDetailInclude,
            });
          },
          { isolationLevel: "Serializable" },
        );
        return presentOrder(order, { management: true });
      } catch (error) {
        mapOrderWriteError(error);
      }
    },
  };
}
