import { parseDateTimeValue } from ".";

export function parseSystemMessageDateTime(value: any) {
  return parseDateTimeValue(value);
}

export function getSystemMessageTime(systemMessage: any) {
  const value = systemMessage?.initDate;
  const dateTime = parseSystemMessageDateTime(value);
  return dateTime?.toMillis() || 0;
}

export function shouldReadSystemMessagePagesBackwards(systemMessages: any[], totalCount: number, pageSize: number) {
  if (totalCount <= pageSize) return false;
  if (systemMessages.length < 2) return false;

  return getSystemMessageTime(systemMessages[0]) <= getSystemMessageTime(systemMessages[systemMessages.length - 1]);
}

export function sortSystemMessagesNewestFirst(systemMessages: any[]) {
  return [...systemMessages].sort((firstMessage: any, secondMessage: any) => {
    return getSystemMessageTime(secondMessage) - getSystemMessageTime(firstMessage);
  });
}

export function hasMoreForwardSystemMessagePages(systemMessages: any[], fetchedPageCount: number, totalCount: number, pageSize: number) {
  if (!systemMessages.length) return false;
  if (fetchedPageCount * pageSize < totalCount) return true;
  return systemMessages.length >= pageSize;
}
