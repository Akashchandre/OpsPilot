export function createInventoryController(inventoryService) {
  return {
    async list(request, response, next) {
      try {
        const result = await inventoryService.list(request.validated.query);
        response.status(200).json({
          success: true,
          data: { inventory: result.inventory },
          meta: result.meta,
        });
      } catch (error) {
        next(error);
      }
    },

    async get(request, response, next) {
      try {
        const inventory = await inventoryService.get(request.validated.params.productId);
        response.status(200).json({ success: true, data: { inventory } });
      } catch (error) {
        next(error);
      }
    },

    async listAdjustments(request, response, next) {
      try {
        const result = await inventoryService.listAdjustments(
          request.validated.params.productId,
          request.validated.query,
        );
        response.status(200).json({
          success: true,
          data: { adjustments: result.adjustments },
          meta: result.meta,
        });
      } catch (error) {
        next(error);
      }
    },

    async adjust(request, response, next) {
      try {
        const inventory = await inventoryService.adjust({
          actor: request.auth.user,
          productId: request.validated.params.productId,
          input: request.validated.body,
          requestId: request.id,
        });
        response.status(201).json({ success: true, data: { inventory } });
      } catch (error) {
        next(error);
      }
    },

    async updateThreshold(request, response, next) {
      try {
        const inventory = await inventoryService.updateThreshold({
          productId: request.validated.params.productId,
          input: request.validated.body,
        });
        response.status(200).json({ success: true, data: { inventory } });
      } catch (error) {
        next(error);
      }
    },
  };
}
