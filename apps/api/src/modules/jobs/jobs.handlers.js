import { createAuditService } from "../audit/audit.service.js";
import { createAiWorkflowJobHandler } from "../ai/ai.workflow.jobs.js";
import { createDocumentJobHandler } from "../documents/document.jobs.js";
import { createNotificationMaterializer } from "../notifications/notifications.materializer.js";
import { expireDueOrders } from "../orders/reservation.service.js";
import { JOB_ERROR_CODES, JOB_TYPES } from "./jobs.constants.js";
import { JobExecutionError } from "./jobs.errors.js";

const notificationJobTypes = new Set([
  JOB_TYPES.NOTIFICATION_ORDER_PLACED,
  JOB_TYPES.NOTIFICATION_ORDER_STATUS_CHANGED,
  JOB_TYPES.NOTIFICATION_PAYMENT_STATUS_CHANGED,
  JOB_TYPES.NOTIFICATION_REFUND_STATUS_CHANGED,
  JOB_TYPES.NOTIFICATION_SUPPORT_TICKET_CREATED,
  JOB_TYPES.NOTIFICATION_SUPPORT_PUBLIC_REPLY_CREATED,
  JOB_TYPES.NOTIFICATION_SUPPORT_ASSIGNMENT_CHANGED,
  JOB_TYPES.NOTIFICATION_SUPPORT_STATUS_CHANGED,
  JOB_TYPES.NOTIFICATION_INVENTORY_LOW,
]);

export function createJobHandlers(database, config, dependencies = {}) {
  const notifications = createNotificationMaterializer(database);
  const audit = createAuditService(database, config);
  const documents = createDocumentJobHandler(database, config, dependencies);
  const workflows = createAiWorkflowJobHandler(database, config, dependencies);

  return Object.freeze({
    async execute(job) {
      if (notificationJobTypes.has(job.type)) return notifications.materialize(job);
      if (documents.handles(job.type)) return documents.execute(job);
      if (workflows.handles(job.type)) return workflows.execute(job);

      if (job.type === JOB_TYPES.ORDER_RESERVATION_EXPIRY_SWEEP) {
        let total = 0;
        let expired;
        do {
          expired = await expireDueOrders(database, { now: new Date(), limit: 25, config });
          total += expired;
        } while (expired === 25);
        return { expiredOrders: total };
      }

      if (job.type === JOB_TYPES.AUDIT_CHAIN_VERIFY) {
        const result = await audit.verifyChain();
        if (!result.valid) {
          throw new JobExecutionError(JOB_ERROR_CODES.AUDIT_INTEGRITY_INVALID, {
            terminal: true,
          });
        }
        return { checkedEvents: result.checkedEvents };
      }

      throw new JobExecutionError(JOB_ERROR_CODES.HANDLER_NOT_REGISTERED, { terminal: true });
    },
  });
}
