export function createCartController(cartService) {
  return {
    async get(request, response, next) {
      try {
        const cart = await cartService.get(request.auth.user.id);
        response.status(200).json({ success: true, data: { cart } });
      } catch (error) {
        next(error);
      }
    },

    async setItem(request, response, next) {
      try {
        const cart = await cartService.setItem({
          userId: request.auth.user.id,
          productId: request.validated.params.productId,
          input: request.validated.body,
        });
        response.status(200).json({ success: true, data: { cart } });
      } catch (error) {
        next(error);
      }
    },

    async removeItem(request, response, next) {
      try {
        const cart = await cartService.removeItem({
          userId: request.auth.user.id,
          productId: request.validated.params.productId,
          input: request.validated.body,
        });
        response.status(200).json({ success: true, data: { cart } });
      } catch (error) {
        next(error);
      }
    },

    async clear(request, response, next) {
      try {
        const cart = await cartService.clear({
          userId: request.auth.user.id,
          input: request.validated.body,
        });
        response.status(200).json({ success: true, data: { cart } });
      } catch (error) {
        next(error);
      }
    },
  };
}
