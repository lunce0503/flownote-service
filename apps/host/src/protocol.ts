import { z } from "zod";
import { MAX_INPUT_BYTES, PROTOCOL_VERSION } from "./constants.js";

const requestId = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const sessionId = z.string().uuid();
const terminalSize = {
  cols: z.number().int().min(20).max(300),
  rows: z.number().int().min(5).max(200),
};

const envelope = {
  version: z.literal(PROTOCOL_VERSION),
  requestId,
};

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ ...envelope, type: z.literal("hello"), payload: z.object({ clientName: z.string().min(1).max(80) }).strict() }).strict(),
  z.object({ ...envelope, type: z.literal("terminal.create"), payload: z.object(terminalSize).strict() }).strict(),
  z.object({ ...envelope, type: z.literal("terminal.input"), payload: z.object({ sessionId, data: z.string().refine((value) => Buffer.byteLength(value, "utf8") <= MAX_INPUT_BYTES, "input exceeds 16 KiB") }).strict() }).strict(),
  z.object({ ...envelope, type: z.literal("terminal.resize"), payload: z.object({ sessionId, ...terminalSize }).strict() }).strict(),
  z.object({ ...envelope, type: z.literal("terminal.attach"), payload: z.object({ sessionId, lastSeq: z.number().int().min(0) }).strict() }).strict(),
  z.object({ ...envelope, type: z.literal("terminal.close"), payload: z.object({ sessionId }).strict() }).strict(),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ErrorCode =
  | "AUTH_FAILED"
  | "BAD_MESSAGE"
  | "CLIENT_CONFLICT"
  | "INTERNAL_ERROR"
  | "REPLAY_UNAVAILABLE"
  | "SESSION_CONFLICT"
  | "SESSION_NOT_FOUND"
  | "SESSION_OWNERSHIP";

export type ServerMessage = {
  version: 1;
  type: string;
  requestId?: string;
  payload: Record<string, unknown>;
};

export const response = (type: string, requestId: string, payload: Record<string, unknown>): ServerMessage => ({
  version: PROTOCOL_VERSION,
  type,
  requestId,
  payload,
});

export const errorResponse = (requestId: string | undefined, code: ErrorCode, message: string): ServerMessage => ({
  version: PROTOCOL_VERSION,
  type: "error",
  ...(requestId ? { requestId } : {}),
  payload: { code, message },
});
