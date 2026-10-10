import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
} from '@assistant-ui/react';
import { useApprovalPolicy } from 'signoff-ui';
import { SignoffToolsProvider, signoffTools } from 'signoff-ui/assistant-ui';
import { mockModel } from './mock-model';

// review_changes calls get a DiffReview; any call with an approval gate gets the approval card.
const tools = signoffTools({ review: ['review_changes'] });

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="message assistant">
      <MessagePrimitive.Parts components={{ tools }} />
    </MessagePrimitive.Root>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="message user">
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  );
}

export function App() {
  // A scripted model in the page: no API key, no network.
  const runtime = useLocalRuntime(mockModel);
  // Once, this session or always: a rule you add answers the next matching call by itself.
  const policy = useApprovalPolicy();
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <SignoffToolsProvider
        policy={policy}
        tools={{ run_command: { risk: 'high' } }}
        // Under the page's h1.
        review={{ headingLevel: 2 }}
        approval={{ headingLevel: 2 }}
      >
        <main className="page">
          <h1>Coding agent</h1>
          <ThreadPrimitive.Root className="thread">
            <ThreadPrimitive.Viewport className="viewport">
              <ThreadPrimitive.Messages>
                {({ message }) => (message.role === 'user' ? <UserMessage /> : <AssistantMessage />)}
              </ThreadPrimitive.Messages>
            </ThreadPrimitive.Viewport>
            <ComposerPrimitive.Root className="composer">
              <ComposerPrimitive.Input aria-label="Message the agent" placeholder="Ask the agent to change something" />
              <ComposerPrimitive.Send>Send</ComposerPrimitive.Send>
            </ComposerPrimitive.Root>
          </ThreadPrimitive.Root>
        </main>
      </SignoffToolsProvider>
    </AssistantRuntimeProvider>
  );
}
