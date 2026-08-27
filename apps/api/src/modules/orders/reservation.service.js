import { MAX_INVENTORY_QUANTITY } from "../catalog/catalog.constants.js";
import {
  INVENTORY_RESERVATION_STATUSES,
  ORDER_EVENT_SOURCES,
  ORDER_STATUSES,
} from "../commerce/commerce.constants.js";
import {
  commerceError,
  commerceVersionConflict,
  isPrismaWriteConflict,
} from "../commerce/commerce.errors.js";

export async function releaseReservations(
  transaction,
  order,
  { actorUserId = null, requestId = null, now = new Date() } = {},
) {
  const reservations = await transaction.inventoryReservation.findMany({
    where: {
      orderId: order.id,
      status: {
        in: [INVENTORY_RESERVATION_STATUSES.ACTIVE, INVENTORY_RESERVATION_STATUSES.CONSUMED],
      },
    },
    orderBy: { id: "asc" },
  });

  for (const reservation of reservations) {
    const balance = await transaction.inventoryBalance.findUnique({
      where: { productId: reservation.productId },
    });
    if (!balance) {
      throw commerceError(500, "INVENTORY_STATE_INVALID", "Inventory state is invalid");
    }

    const quantityAfter = balance.onHand + reservation.quantity;
    if (!Number.isSafeInteger(quantityAfter) || quantityAfter > MAX_INVENTORY_QUANTITY) {
      throw commerceError(409, "INVENTORY_LIMIT_EXCEEDED", "Inventory quantity is too large");
    }

    const inventoryUpdate = await transaction.inventoryBalance.updateMany({
      where: { productId: reservation.productId, version: balance.version },
      data: { onHand: quantityAfter, version: { increment: 1 } },
    });
    if (inventoryUpdate.count !== 1) throw commerceVersionConflict();

    const reservationUpdate = await transaction.inventoryReservation.updateMany({
      where: {
        id: reservation.id,
        version: reservation.version,
        status: reservation.status,
      },
      data: {
        status: INVENTORY_RESERVATION_STATUSES.RELEASED,
        releasedAt: now,
        consumedAt: null,
        version: { increment: 1 },
      },
    });
    if (reservationUpdate.count !== 1) throw commerceVersionConflict();

    await transaction.inventoryAdjustment.create({
      data: {
        productId: reservation.productId,
        delta: reservation.quantity,
        quantityBefore: balance.onHand,
        quantityAfter,
        reason: "ORDER_RELEASE",
        note: `Order ${order.orderNumber}`,
        actorUserId,
        requestId,
      },
    });
  }

  return reservations.length;
}

export async function consumeReservations(transaction, orderId, now = new Date()) {
  const reservations = await transaction.inventoryReservation.findMany({
    where: { orderId },
    orderBy: { id: "asc" },
  });
  if (reservations.length === 0) {
    throw commerceError(500, "RESERVATION_STATE_INVALID", "Reservation state is invalid");
  }

  for (const reservation of reservations) {
    if (reservation.status === INVENTORY_RESERVATION_STATUSES.CONSUMED) continue;
    if (reservation.status !== INVENTORY_RESERVATION_STATUSES.ACTIVE) {
      throw commerceError(409, "RESERVATION_NOT_ACTIVE", "Order stock is no longer reserved");
    }
    const update = await transaction.inventoryReservation.updateMany({
      where: {
        id: reservation.id,
        version: reservation.version,
        status: INVENTORY_RESERVATION_STATUSES.ACTIVE,
      },
      data: {
        status: INVENTORY_RESERVATION_STATUSES.CONSUMED,
        consumedAt: now,
        version: { increment: 1 },
      },
    });
    if (update.count !== 1) throw commerceVersionConflict();
  }
}

async function expireOrder(database, orderId, now) {
  try {
    return await database.$transaction(
      async (transaction) => {
        const order = await transaction.order.findUnique({ where: { id: orderId } });
        if (
          !order ||
          order.status !== ORDER_STATUSES.PENDING_PAYMENT ||
          order.reservationExpiresAt > now
        ) {
          return false;
        }

        await releaseReservations(transaction, order, { now });
        const update = await transaction.order.updateMany({
          where: { id: order.id, version: order.version, status: ORDER_STATUSES.PENDING_PAYMENT },
          data: {
            status: ORDER_STATUSES.EXPIRED,
            expiredAt: now,
            version: { increment: 1 },
          },
        });
        if (update.count !== 1) throw commerceVersionConflict();
        await transaction.orderStatusEvent.create({
          data: {
            orderId: order.id,
            fromStatus: ORDER_STATUSES.PENDING_PAYMENT,
            toStatus: ORDER_STATUSES.EXPIRED,
            source: ORDER_EVENT_SOURCES.SYSTEM,
            reasonCode: "RESERVATION_EXPIRED",
          },
        });
        return true;
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (isPrismaWriteConflict(error) || error?.code === "RESOURCE_VERSION_CONFLICT") return false;
    throw error;
  }
}

export async function expireDueOrders(database, { now = new Date(), limit = 25 } = {}) {
  const dueOrders = await database.order.findMany({
    where: {
      status: ORDER_STATUSES.PENDING_PAYMENT,
      reservationExpiresAt: { lte: now },
    },
    select: { id: true },
    orderBy: [{ reservationExpiresAt: "asc" }, { id: "asc" }],
    take: limit,
  });

  let expired = 0;
  for (const order of dueOrders) {
    if (await expireOrder(database, order.id, now)) expired += 1;
  }
  return expired;
}
