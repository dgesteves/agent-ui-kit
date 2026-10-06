'use client';

import { useState } from 'react';

export function Composer({
  onSend,
  onStop,
  running,
  disabled,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  running: boolean;
  disabled: boolean;
}) {
  const [text, setText] = useState('');
  const submit = () => {
    const value = text.trim();
    if (!value || disabled) return;
    onSend(value);
    setText('');
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="border-line bg-raised/70 focus-within:border-cyan/40 rounded-xl border p-2"
    >
      <label htmlFor="prompt" className="sr-only">
        Message the agent
      </label>
      <textarea
        id="prompt"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Ask the agent to change something in the repo…"
        className="w-full resize-none bg-transparent px-2 py-1.5 text-[14px] text-[#e8eaed] placeholder:text-[#8b94a0] focus:outline-none"
      />
      <div className="flex justify-end">
        {running ? (
          <button
            type="button"
            onClick={onStop}
            className="border-line focus-visible:outline-cyan-soft h-8 cursor-pointer rounded-lg border px-3 text-[13px] text-[#e8eaed] focus-visible:outline-2"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={disabled || !text.trim()}
            className="bg-cyan text-ink focus-visible:outline-cyan-soft h-8 cursor-pointer rounded-lg px-3 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Send
          </button>
        )}
      </div>
    </form>
  );
}
