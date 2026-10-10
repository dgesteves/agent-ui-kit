/**
 * `signoff-ui/acp`: render Agent Client Protocol sessions with these components. Pure functions,
 * no React: fold a prompt turn's `session/update` notifications and permission requests into a
 * `UIMessage`, map a tool call's diff content to `DiffReview` files, and answer
 * `session/request_permission` from the approval card's decision.
 */
export {
  answerAcpPermission,
  createAcpTurn,
  endAcpTurn,
  fromAcpDiffs,
  reduceAcpTurn,
  requestAcpPermission,
  toAcpDiffs,
  toAcpMessage,
  type AcpContentBlock,
  type AcpPermission,
  type AcpSessionNotification,
  type AcpSessionUpdate,
  type AcpToolCall,
  type AcpToolCallContent,
  type AcpToolCallStatus,
  type AcpTurn,
  type AcpTurnItem,
} from './lib/acp';
export {
  acpToolName,
  decisionsFromAcpOptions,
  fromAcpPermissionRequest,
  fromAcpPermissionResponse,
  toAcpPermissionResponse,
  type AcpPermissionOption,
  type AcpPermissionOptionKind,
  type AcpRequestPermissionRequest,
  type AcpRequestPermissionResponse,
} from './lib/policy';
