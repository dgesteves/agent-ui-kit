import { describe, expectTypeOf, it } from 'vitest';
import type { AgentState, ToolPhase } from '../src/lib/ai';
import type { FileStatus, HunkDecision } from '../src/lib/diff';
import type { CommentLabel, RuleLabel, SignoffLabels } from '../src/lib/labels';
import type { ApprovalDecision, ApprovalRule } from '../src/lib/policy';
import type { DiffReviewComment, LineRange } from '../src/lib/review';
import type { RangeLabel } from '../src/lib/labels';

// lib/labels.ts spells these unions out, to import nothing but the formatters; `pnpm typecheck` fails if they drift.
describe('the labels name every state there is', () => {
  it('has the same unions as the components', () => {
    expectTypeOf<keyof SignoffLabels['agentStatus']['states']>().toEqualTypeOf<AgentState>();
    expectTypeOf<keyof SignoffLabels['toolCallTimeline']['phases']>().toEqualTypeOf<ToolPhase>();
    expectTypeOf<keyof SignoffLabels['diffReview']['status']>().toEqualTypeOf<FileStatus>();
    expectTypeOf<keyof SignoffLabels['approvalCard']['resolved']>().toEqualTypeOf<ApprovalDecision>();
    expectTypeOf<Parameters<SignoffLabels['diffReview']['hunk']>[5]>().toEqualTypeOf<HunkDecision>();
    expectTypeOf<keyof SignoffLabels['diffReview']['badge']>().toEqualTypeOf<Exclude<HunkDecision, 'pending'>>();
  });

  it('takes the rules, comments and ranges the components pass', () => {
    expectTypeOf<ApprovalRule>().toExtend<RuleLabel>();
    expectTypeOf<DiffReviewComment>().toExtend<CommentLabel>();
    expectTypeOf<LineRange>().toEqualTypeOf<RangeLabel>();
    expectTypeOf<CommentLabel['target']>().toEqualTypeOf<DiffReviewComment['target']>();
  });
});
