import { createHash } from "crypto";

export type HashFn = (value: string) => number;

/** Hashes a string onto the ring: first 4 bytes of its SHA-1 digest as a uint32. */
export const defaultHash: HashFn = (value) =>
  createHash("sha1").update(value).digest().readUInt32BE(0);
