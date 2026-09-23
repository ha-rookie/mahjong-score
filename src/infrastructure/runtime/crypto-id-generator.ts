import type { IdGenerator } from "../../application/ports";

export class CryptoIdGenerator implements IdGenerator {
  generate(): string {
    return globalThis.crypto.randomUUID();
  }
}
