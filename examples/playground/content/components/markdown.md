Streaming-safe GitHub-flavored markdown: unterminated syntax is closed while the text streams, raw HTML is never rendered, and `javascript:` and `data:` URLs are stripped. `[n]` markers link to the message's sources, and a caret follows the text while it streams. It takes the same `allowedImageHosts` as `AgentMessage`.

The whole text is parsed again on every delta, which gets slow for very long streamed answers; [Performance and limits](/docs/limits) has the numbers.
