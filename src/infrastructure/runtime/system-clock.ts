import type { Clock } from "../../application/ports";

export class SystemClock implements Clock {
  now(): string {
    return new Date().toISOString();
  }
}
