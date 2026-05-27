import { parseDateTimeValue } from ".";

export interface SystemMessage {
  systemMessageId: string;
  statusId: string;
  initDate?: string | number;
  lastUpdatedStamp?: string | number;
  processedDate?: string | number;
}

export const SYSTEM_MESSAGE_RECEIVED_STATUSES = ["smsgreceived", "received"];
export const SYSTEM_MESSAGE_SENT_STATUSES = ["smsgsent", "sent"];
export const SYSTEM_MESSAGE_PRODUCED_STATUSES = ["smsgproduced", "produced"];
export const SYSTEM_MESSAGE_CONSUMED_STATUSES = ["smsgconsumed", "consumed", "smsgconfirmed", "confirmed"];

export function normalizeStatusValue(statusId: string) {
  return String(statusId || "").toLowerCase().replace(/[_\-\s]/g, "");
}

export function hasSystemMessageStatus(systemMessage: SystemMessage, statuses: string[]) {
  return statuses.includes(normalizeStatusValue(systemMessage?.statusId));
}

export function getSystemMessageTime(systemMessage: SystemMessage) {
  const value = systemMessage?.initDate || systemMessage?.lastUpdatedStamp || systemMessage?.processedDate;
  if (!value) return 0;
  if (typeof value === "number") return value;
  const parsed = parseDateTimeValue(value);
  return parsed?.toMillis() || 0;
}

export function sortSystemMessagesOldestFirst(systemMessages: SystemMessage[]) {
  return [...systemMessages].sort((a, b) => getSystemMessageTime(a) - getSystemMessageTime(b));
}

export function sortSystemMessagesNewestFirst(systemMessages: SystemMessage[]) {
  return [...systemMessages].sort((a, b) => getSystemMessageTime(b) - getSystemMessageTime(a));
}

export function getOldestSystemMessageByStatus(systemMessages: SystemMessage[], statuses: string[]) {
  return sortSystemMessagesOldestFirst(systemMessages.filter((message) => hasSystemMessageStatus(message, statuses)))[0] || null;
}

/**
 * Original complex selection logic.
 * Finds the oldest pending message or the newest consumed message.
 */
export function selectTrackProgressSystemMessage(systemMessages: SystemMessage[]) {
  if (!systemMessages.length) return null;

  const consumedMessages = systemMessages.filter((message) => hasSystemMessageStatus(message, SYSTEM_MESSAGE_CONSUMED_STATUSES));

  return getOldestSystemMessageByStatus(systemMessages, SYSTEM_MESSAGE_RECEIVED_STATUSES) ||
    getOldestSystemMessageByStatus(systemMessages, SYSTEM_MESSAGE_SENT_STATUSES) ||
    getOldestSystemMessageByStatus(systemMessages, SYSTEM_MESSAGE_PRODUCED_STATUSES) ||
    sortSystemMessagesNewestFirst(consumedMessages)[0] ||
    null;
}

/**
 * Simplified selection logic as requested by the user.
 * Simply returns the most recent system message regardless of status.
 */
export function selectMostRecentSystemMessage(systemMessages: SystemMessage[]) {
  if (!systemMessages.length) return null;
  return sortSystemMessagesNewestFirst(systemMessages)[0] || null;
}
