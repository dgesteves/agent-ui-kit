import { Playground } from '@/components/playground';

export default function Page() {
  // Live mode is offered only when the server has a key; the scripted mock is always the default.
  return <Playground liveAvailable={Boolean(process.env.OPENAI_API_KEY)} />;
}
