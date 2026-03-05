import { runAlertsAndStageSweep } from "./alerts.service.js";
import { logger } from "../logger.js";

let pending = false;
let timer: ReturnType<typeof setTimeout> | null = null;

export function scheduleAlertsSweep(reason: string): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    if (pending) return;
    pending = true;
    try {
      logger.info({ msg: "ALERTS_SWEEP_START", reason });
      await runAlertsAndStageSweep();
      logger.info({ msg: "ALERTS_SWEEP_OK", reason });
    } catch (e) {
      logger.error({ msg: "ALERTS_SWEEP_FAILED", reason, error: String(e) });
    } finally {
      pending = false;
      timer = null;
    }
  }, 1000);
}
