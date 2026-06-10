export * as schema from "./schema.ts";
export { getDb, getClient, closeDb } from "./client.ts";

export { upsertPatient, patientMrNoSet } from "./repos/patients.ts";
export type { UpsertPatientInput } from "./repos/patients.ts";

export { upsertBill, getRecentBills, lastBillSyncTs } from "./repos/bills.ts";
export type { UpsertBillInput, RecentBillRow } from "./repos/bills.ts";

export {
  ensureAutomationRow,
  getAutomationRow,
  listAutomationRows,
  setAutomationEnabled,
  updateAutomationConfig,
} from "./repos/automations.ts";
export type { AutomationRow } from "./repos/automations.ts";

export {
  tryInsertScheduledJob,
  getScheduledJob,
  getScheduledJobByTarget,
  claimJob,
  completeJob,
  getUpcomingJobs,
  getRecentJobs,
} from "./repos/jobs.ts";
export type {
  JobStatus,
  ScheduledJobRow,
  UpsertScheduledJobInput,
  UpcomingJobRow,
} from "./repos/jobs.ts";

export { recordEvent, getRecentEvents } from "./repos/events.ts";
export type { EventRow, RecordEventInput } from "./repos/events.ts";

export {
  insertMessage,
  updateMessageStatusByWaMsgId,
  findRecentOutboundForPatient,
} from "./repos/messages.ts";
export type {
  MessageDirection,
  MessageChannel,
  MessageStatus,
  InsertMessageInput,
  OutboundMessageRow,
} from "./repos/messages.ts";

export {
  tryInsertRating,
  setRatingConcernArea,
  getRatingByBill,
  getRecentRatings,
  insertRatingTicket,
  listTicketsWithContext,
  getTicketDetail,
  countOpenTickets,
  getTicketReplies,
  claimTicket,
  startTicket,
  completeTicket,
  dismissTicket,
  findOpenTicketByBill,
  findOpenTicketForPatient,
  OPEN_TICKET_STATUSES,
} from "./repos/ratings.ts";
export type {
  RatingMode,
  ConcernArea,
  RatingRow,
  InsertRatingInput,
  TicketStatus,
  TicketRow,
  TicketWithContextRow,
  TicketReplyRow,
  OpenTicketForPatientRow,
} from "./repos/ratings.ts";
