import { z } from "zod";
import { MAX_CART_QUANTITY, ORDER_STATUSES } from "./commerce.constants.js";

const paginationShape = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

const providerOrderIdSchema = z
  .string()
  .trim()
  .regex(/^order_[A-Za-z0-9_]{1,58}$/, "Enter a valid provider order ID");
const providerPaymentIdSchema = z
  .string()
  .trim()
  .regex(/^pay_[A-Za-z0-9_]{1,60}$/, "Enter a valid provider payment ID");

const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ""))
  .pipe(z.string().regex(/^\+?[0-9]{8,15}$/, "Enter a valid phone number"));

export const shippingAddressSchema = z.strictObject({
  recipientName: z.string().trim().min(2).max(100),
  phone: phoneSchema,
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: z.string().trim().min(1).max(200).optional(),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  postalCode: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, "Enter a 6-digit postal code"),
  countryCode: z.literal("IN").default("IN"),
});

export const productIdParamsSchema = z.strictObject({ productId: z.uuid() });
export const orderIdParamsSchema = z.strictObject({ orderId: z.uuid() });
export const paymentIdParamsSchema = z.strictObject({ paymentId: z.uuid() });

export const setCartItemSchema = z.strictObject({
  quantity: z.number().int().min(1).max(MAX_CART_QUANTITY),
  version: z.number().int().min(0),
});

export const cartVersionSchema = z.strictObject({
  version: z.number().int().min(0),
});

export const createOrderSchema = z.strictObject({
  cartVersion: z.number().int().min(0),
  shippingAddress: shippingAddressSchema,
});

export const orderListQuerySchema = z.strictObject({
  ...paginationShape,
  view: z.enum(["self", "management"]).default("self"),
  status: z.enum(["ALL", ...Object.values(ORDER_STATUSES)]).default("ALL"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});

export const orderDetailQuerySchema = z.strictObject({
  view: z.enum(["self", "management"]).default("self"),
});

export const cancelOrderSchema = z.strictObject({
  version: z.number().int().min(0),
});

export const updateOrderStatusSchema = z
  .strictObject({
    status: z.enum([
      ORDER_STATUSES.PROCESSING,
      ORDER_STATUSES.SHIPPED,
      ORDER_STATUSES.DELIVERED,
      ORDER_STATUSES.CANCELLED,
    ]),
    version: z.number().int().min(0),
    carrierName: z.string().trim().min(2).max(100).optional(),
    trackingNumber: z.string().trim().min(2).max(100).optional(),
  })
  .superRefine((body, context) => {
    if (body.status === ORDER_STATUSES.SHIPPED) {
      for (const field of ["carrierName", "trackingNumber"]) {
        if (!body[field]) {
          context.addIssue({
            code: "custom",
            path: [field],
            message: `${field} is required when an order is shipped`,
          });
        }
      }
    } else if (body.carrierName !== undefined || body.trackingNumber !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Carrier details may be supplied only for the shipped transition",
      });
    }
  });

export const confirmPaymentSchema = z.strictObject({
  orderId: z.uuid(),
  providerOrderId: providerOrderIdSchema,
  providerPaymentId: providerPaymentIdSchema,
  signature: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{64}$/i, "Enter a valid payment signature"),
});

export const emptyBodySchema = z.strictObject({});
