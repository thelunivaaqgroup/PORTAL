import { getFlag, type FeatureFlag } from "../config/flags";

export function useFlag(flag: FeatureFlag): boolean {
  return getFlag(flag);
}
