# Security

Report a vulnerability privately, through [GitHub's private vulnerability reporting](https://github.com/dgesteves/signoff-ui/security/advisories/new), not in a public issue. Include the version of `signoff-ui` (or the registry item), the component, and a reproduction.

Fixes ship in the latest release only. The components render model output, so these count as vulnerabilities:

- content from a message (text, reasoning, tool input or output, sources, files) that runs script, renders raw HTML or follows a `javascript:` or `data:` URL;
- an image that loads from a host `allowedImageHosts` does not allow, since the request alone can leak data;
- an approval or a diff decision that is sent without the user's action, or sent twice.
