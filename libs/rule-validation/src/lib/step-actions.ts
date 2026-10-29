/**
 * What Validation knows about autoconsent's Step actions and modifiers (`lib/rules.ts`).
 * Recheck it on every autoconsent upgrade.
 */

// `eval` counts as an action here; it is rejected on its own as a rejected feature
export const ACTIONS: readonly string[] = [
  'exists',
  'visible',
  'eval',
  'waitFor',
  'waitForVisible',
  'click',
  'waitForThenClick',
  'wait',
  'hide',
  'cookieContains',
  'if',
  'any',
  'removeClass',
  'setStyle',
  'addStyle',
  'stylesheet',
];

// autoconsent runs these whenever they are present; every other action only when its value is truthy
export const PRESENCE_TESTED_ACTIONS: readonly string[] = [
  'removeClass',
  'setStyle',
  'addStyle',
  'stylesheet',
];

// Each modifier and the actions it belongs to; `optional`, `comment` and `negated` go on any Step
export const MODIFIER_ACTIONS: Readonly<Record<string, readonly string[]>> = {
  timeout: ['waitFor', 'waitForVisible', 'waitForThenClick'],
  all: ['click', 'waitForThenClick'],
  check: ['visible', 'waitForVisible'],
  method: ['hide'],
  retry: ['waitForThenClick'],
  retryInterval: ['waitForThenClick'],
  then: ['if'],
  else: ['if'],
  selector: ['removeClass', 'setStyle', 'addStyle'],
  stylesheetId: ['stylesheet'],
};

// Step fields holding an element selector, a string or an array that pierces shadow roots and iframes
export const SELECTOR_FIELDS: readonly string[] = [
  'exists',
  'visible',
  'waitFor',
  'waitForVisible',
  'click',
  'waitForThenClick',
  'selector',
  'hide',
];

// The autoconsent rule step version each newer action needs; every other action is version 1
export const ACTION_STEP_VERSIONS: Readonly<Record<string, number>> = {
  removeClass: 2,
  setStyle: 2,
  addStyle: 2,
  stylesheet: 3,
};
