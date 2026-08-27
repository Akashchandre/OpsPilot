export function createOrdersController(ordersService) {
  return {
    async create(request, response, next) {
      try {
        const result = await ordersService.create({
          userId: request.auth.user.id,
          input: request.validated.body,
          idempotencyKey: request.idempotencyKey,
          requestId: request.id,
        });
        response.status(result.paymentSetupPending ? 202 : 201).json({
          success: true,
          data: result,
        });
      } catch (error) {
        next(error);
      }
    },

    async list(request, response, next) {
      try {
        const management = request.validated.query.view === "management";
        const result = await ordersService.list({
          userId: request.auth.user.id,
          query: request.validated.query,
          management,
        });
        response.status(200).json({
          success: true,
          data: { orders: result.orders },
          meta: result.meta,
        });
      } catch (error) {
        next(error);
      }
    },

    async get(request, response, next) {
      try {
        const management = request.validated.query.view === "management";
        const order = await ordersService.get({
          userId: request.auth.user.id,
          orderId: request.validated.params.orderId,
          management,
        });
        response.status(200).json({ success: true, data: { order } });
      } catch (error) {
        next(error);
      }
    },

    async paymentSession(request, response, next) {
      try {
        const result = await ordersService.paymentSession({
          userId: request.auth.user.id,
          orderId: request.validated.params.orderId,
        });
        response.status(result.paymentSetupPending ? 202 : 200).json({
          success: true,
          data: result,
        });
      } catch (error) {
        next(error);
      }
    },

    async cancelOwn(request, response, next) {
      try {
        const order = await ordersService.cancelOwn({
          userId: request.auth.user.id,
          orderId: request.validated.params.orderId,
          input: request.validated.body,
          requestId: request.id,
        });
        response.status(200).json({ success: true, data: { order } });
      } catch (error) {
        next(error);
      }
    },

    async updateStatus(request, response, next) {
      try {
        const order = await ordersService.updateStatus({
          actorUserId: request.auth.user.id,
          orderId: request.validated.params.orderId,
          input: request.validated.body,
          requestId: request.id,
        });
        response.status(200).json({ success: true, data: { order } });
      } catch (error) {
        next(error);
      }
    },
  };
}
