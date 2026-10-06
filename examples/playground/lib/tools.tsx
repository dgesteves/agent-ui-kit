import { inferLanguage, Markdown, type ToolMeta } from '@dgesteves/agent-ui-kit';
import type { SVGProps } from 'react';

const Icon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  />
);

export const SearchIcon = () => (
  <Icon>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Icon>
);
export const FileIcon = () => (
  <Icon>
    <path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8L14 3.5Z" />
    <path d="M14 3.5V8h4.5" />
  </Icon>
);
export const GlobeIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5S9.7 5.9 12 3.5Z" />
  </Icon>
);
export const TerminalIcon = () => (
  <Icon>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <path d="M7.5 9.5 10.5 12l-3 2.5M12.5 15h4" />
  </Icon>
);
export const DiffIcon = () => (
  <Icon>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="M6 8.5V15a3 3 0 0 0 3 3h6.5M18 15.5V9a3 3 0 0 0-3-3H8.5" />
  </Icon>
);

const field = (key: string) => (input: unknown) =>
  input && typeof input === 'object' && key in input ? String((input as Record<string, unknown>)[key]) : undefined;

interface FileOutput {
  path: string;
  content: string;
}

export const toolMeta: Record<string, ToolMeta> = {
  search_code: {
    label: 'Search code',
    icon: <SearchIcon />,
    summary: (input) => {
      const q = field('query')(input);
      return q ? `“${q}”` : undefined;
    },
  },
  read_file: {
    label: 'Read file',
    icon: <FileIcon />,
    summary: field('path'),
    renderOutput: (output) => {
      const file = output as FileOutput;
      return <Markdown>{'```' + inferLanguage(file.path) + '\n' + file.content.trimEnd() + '\n```'}</Markdown>;
    },
  },
  web_search: {
    label: 'Web search',
    icon: <GlobeIcon />,
    summary: (input) => {
      const q = field('query')(input);
      return q ? `“${q}”` : undefined;
    },
  },
  run_command: {
    label: 'Run command',
    icon: <TerminalIcon />,
    summary: field('command'),
    risk: 'high',
  },
  review_changes: {
    label: 'Propose changes',
    icon: <DiffIcon />,
  },
};
