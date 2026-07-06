/** A stamp card earns its reward once the stamp count meets the program's requirement. */
export const rewardReady = (count: number, required: number): boolean =>
  count >= required;
