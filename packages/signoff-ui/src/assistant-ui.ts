/**
 * `signoff-ui/assistant-ui`: review and approve assistant-ui tool calls with these components.
 * `signoffTools()` goes in `MessagePrimitive.Parts`' `components.tools`. `@assistant-ui/react` is an
 * optional peer: only its types are used here.
 */
export {
  ApprovalToolUI,
  ReviewToolUI,
  SignoffToolsProvider,
  signoffTools,
  type SignoffToolsOptions,
  type SignoffToolsProviderProps,
} from './assistant-ui-tools';
