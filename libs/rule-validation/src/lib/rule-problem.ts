/** One reason a Rule fails Validation. */
export interface RuleProblem {
  /** Where in the Rule, as a JSON path: `$` is the whole Rule, `$.optOut[0].click` one field. */
  path: string;
  message: string;
}
