export type FeatureFlag = "demoModule";

const flags: Record<FeatureFlag, boolean> = {
  demoModule: true,
};

export function getFlag(flag: FeatureFlag): boolean {
  return flags[flag] ?? false;
}
