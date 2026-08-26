export function createCatalogController(catalogService) {
  return {
    async listProducts(request, response, next) {
      try {
        const result = await catalogService.listProducts(request.validated.query);
        response.status(200).json({
          success: true,
          data: { products: result.products },
          meta: result.meta,
        });
      } catch (error) {
        next(error);
      }
    },

    async getProduct(request, response, next) {
      try {
        const product = await catalogService.getPublicProduct(request.validated.params.productId);
        response.status(200).json({ success: true, data: { product } });
      } catch (error) {
        next(error);
      }
    },

    async createProduct(request, response, next) {
      try {
        const product = await catalogService.createProduct({
          actor: request.auth.user,
          input: request.validated.body,
          requestId: request.id,
        });
        response.status(201).json({ success: true, data: { product } });
      } catch (error) {
        next(error);
      }
    },

    async updateProduct(request, response, next) {
      try {
        const product = await catalogService.updateProduct({
          productId: request.validated.params.productId,
          input: request.validated.body,
        });
        response.status(200).json({ success: true, data: { product } });
      } catch (error) {
        next(error);
      }
    },

    async updateProductStatus(request, response, next) {
      try {
        const product = await catalogService.updateProductStatus({
          productId: request.validated.params.productId,
          input: request.validated.body,
        });
        response.status(200).json({ success: true, data: { product } });
      } catch (error) {
        next(error);
      }
    },

    async listCategories(request, response, next) {
      try {
        const result = await catalogService.listCategories(request.validated.query);
        response.status(200).json({
          success: true,
          data: { categories: result.categories },
          meta: result.meta,
        });
      } catch (error) {
        next(error);
      }
    },

    async createCategory(request, response, next) {
      try {
        const category = await catalogService.createCategory(request.validated.body);
        response.status(201).json({ success: true, data: { category } });
      } catch (error) {
        next(error);
      }
    },

    async updateCategory(request, response, next) {
      try {
        const category = await catalogService.updateCategory({
          categoryId: request.validated.params.categoryId,
          input: request.validated.body,
        });
        response.status(200).json({ success: true, data: { category } });
      } catch (error) {
        next(error);
      }
    },

    async updateCategoryStatus(request, response, next) {
      try {
        const category = await catalogService.updateCategoryStatus({
          categoryId: request.validated.params.categoryId,
          input: request.validated.body,
        });
        response.status(200).json({ success: true, data: { category } });
      } catch (error) {
        next(error);
      }
    },
  };
}
