import type {
  Client,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
  ToolCallContent,
} from '@agentclientprotocol/sdk';
import { describe, expectTypeOf, it } from 'vitest';
import type {
  AcpRequestPermissionRequest,
  AcpRequestPermissionResponse,
  AcpSessionNotification,
  AcpToolCallContent,
} from '../src/acp';

/*
 * The ACP types here are structural copies of what is read, so the ACP SDK's objects pass straight
 * in and the responses go straight back. Checked by `tsc` (pnpm typecheck) against
 * @agentclientprotocol/sdk, a dev dependency only.
 */

describe('signoff-ui/acp and @agentclientprotocol/sdk', () => {
  it("takes the SDK's notifications, permission requests and diff content", () => {
    expectTypeOf<SessionNotification>().toExtend<AcpSessionNotification>();
    expectTypeOf<RequestPermissionRequest>().toExtend<AcpRequestPermissionRequest>();
    expectTypeOf<ToolCallContent>().toExtend<AcpToolCallContent>();
  });

  it("answers in the SDK's types, so a Client can return the response as it is", () => {
    expectTypeOf<AcpRequestPermissionResponse>().toExtend<RequestPermissionResponse>();
    expectTypeOf<AcpRequestPermissionResponse>().toExtend<Awaited<ReturnType<Client['requestPermission']>>>();
  });
});
