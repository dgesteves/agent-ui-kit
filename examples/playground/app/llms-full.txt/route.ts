import { llmsFullTxt } from '@/lib/llms';

// Built once, from the README, the docs pages and registry.json, when the playground builds.
export const dynamic = 'force-static';

export function GET() {
  return new Response(llmsFullTxt(), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
