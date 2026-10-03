import { NodeAddress } from "./types";

export const nodeId = ({ host, port }: NodeAddress) => `${host}:${port}`;
