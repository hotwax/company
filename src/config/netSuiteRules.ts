export const NETSUITE_RULE_OPERATOR_WORDS: Record<string, string> = {
  "equals": "is",
  "not-equals": "is not",
  "in": "is one of",
  "not-in": "is not one of",
  "is-null": "is empty",
  "is-not-null": "is set",
  "greater-than": "is after",
  "greater-than-equal-to": "is on or after",
  "less-than": "is before",
  "less-than-equal-to": "is on or before",
  "like": "is like",
};

export const NETSUITE_RULE_NUMBER_OPERATOR_WORDS: Record<string, string> = {
  "greater-than": "is more than",
  "greater-than-equal-to": "is at least",
  "less-than": "is less than",
  "less-than-equal-to": "is at most",
};

export const NETSUITE_RULE_DATE_FIELD_TYPES = ["date", "date-time", "time"];

export const NETSUITE_RULE_FILTER_OPERATORS = [
  "equals", "not-equals", "in", "not-in", "greater-than", "greater-than-equal-to", "less-than", "less-than-equal-to", "is-null", "is-not-null",
];

export const NETSUITE_RULE_VALUELESS_OPERATORS = ["is-null", "is-not-null"];

export interface NetSuiteRuleFilter {
  conditionSeqId?: string;
  fieldName: string;
  operator: string;
  fieldValue?: string;
}
