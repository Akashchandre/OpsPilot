import { PERMISSIONS } from "../auth/auth.constants.js";
import { SUPPORT_VIEWS } from "./support.constants.js";

function isManagementRequest(request) {
  return request.validated.query?.view === SUPPORT_VIEWS.MANAGEMENT;
}

function canManageSupport(request) {
  return request.auth.permissions.has(PERMISSIONS.SUPPORT_TICKETS_MANAGE);
}

export function createSupportController(service) {
  return {
    async create(request, response, next) {
      try {
        const result = await service.create({
          actor: request.auth.user,
          input: request.validated.body,
          idempotencyKey: request.idempotencyKey,
          requestId: request.id,
        });
        response.status(result.replayed ? 200 : 201).json({
          success: true,
          data: { ticket: result.ticket },
          meta: { idempotencyReplay: result.replayed },
        });
      } catch (error) {
        next(error);
      }
    },

    async list(request, response, next) {
      try {
        const result = await service.list({
          actorUserId: request.auth.user.id,
          query: request.validated.query,
          management: isManagementRequest(request),
        });
        response.status(200).json({
          success: true,
          data: { tickets: result.tickets },
          meta: result.meta,
        });
      } catch (error) {
        next(error);
      }
    },

    async get(request, response, next) {
      try {
        const ticket = await service.get({
          actorUserId: request.auth.user.id,
          ticketId: request.validated.params.ticketId,
          management: isManagementRequest(request),
        });
        response.status(200).json({ success: true, data: { ticket } });
      } catch (error) {
        next(error);
      }
    },

    async addMessage(request, response, next) {
      try {
        const result = await service.addMessage({
          actor: request.auth.user,
          ticketId: request.validated.params.ticketId,
          input: request.validated.body,
          idempotencyKey: request.idempotencyKey,
          requestId: request.id,
          management: canManageSupport(request),
        });
        response.status(result.replayed ? 200 : 201).json({
          success: true,
          data: { ticket: result.ticket },
          meta: { idempotencyReplay: result.replayed },
        });
      } catch (error) {
        next(error);
      }
    },

    async close(request, response, next) {
      try {
        const ticket = await service.closeOwn({
          actor: request.auth.user,
          ticketId: request.validated.params.ticketId,
          input: request.validated.body,
          requestId: request.id,
        });
        response.status(200).json({ success: true, data: { ticket } });
      } catch (error) {
        next(error);
      }
    },

    async update(request, response, next) {
      try {
        const ticket = await service.update({
          actor: request.auth.user,
          ticketId: request.validated.params.ticketId,
          input: request.validated.body,
          requestId: request.id,
        });
        response.status(200).json({ success: true, data: { ticket } });
      } catch (error) {
        next(error);
      }
    },
  };
}
