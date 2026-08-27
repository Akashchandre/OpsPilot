import { PERMISSIONS } from "../auth/auth.constants.js";
import { REFUND_STATUSES } from "../commerce/commerce.constants.js";

export function createPaymentsController(paymentsService) {
  return {
    async confirm(request, response, next) {
      try {
        const result = await paymentsService.confirm({
          userId: request.auth.user.id,
          input: request.validated.body,
          requestId: request.id,
        });
        response.status(result.confirmationPending ? 202 : 200).json({
          success: true,
          data: result,
        });
      } catch (error) {
        next(error);
      }
    },

    async get(request, response, next) {
      try {
        const payment = await paymentsService.get({
          userId: request.auth.user.id,
          paymentId: request.validated.params.paymentId,
          canReadAll: request.auth.permissions.has(PERMISSIONS.PAYMENTS_READ),
        });
        response.status(200).json({ success: true, data: { payment } });
      } catch (error) {
        next(error);
      }
    },

    async refund(request, response, next) {
      try {
        const result = await paymentsService.refund({
          actorUserId: request.auth.user.id,
          paymentId: request.validated.params.paymentId,
          idempotencyKey: request.idempotencyKey,
          requestId: request.id,
        });
        response
          .status(result.refund.status === REFUND_STATUSES.PENDING ? 202 : 200)
          .json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    },

    async reconcile(request, response, next) {
      try {
        const payment = await paymentsService.reconcile({
          paymentId: request.validated.params.paymentId,
          requestId: request.id,
        });
        response.status(200).json({ success: true, data: { payment } });
      } catch (error) {
        next(error);
      }
    },
  };
}

export function createRazorpayWebhookController(webhookService) {
  return async function razorpayWebhook(request, response, next) {
    try {
      const result = await webhookService.handle({
        rawBody: request.body,
        signature: request.get("X-Razorpay-Signature"),
        providerEventId: request.get("X-Razorpay-Event-Id"),
        requestId: request.id,
      });
      response.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };
}
