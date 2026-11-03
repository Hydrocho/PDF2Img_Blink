# Progress — plan: 2026-11-03-styles-projects.md

- Task 1 complete: six project/model tests RED -> GREEN; nine unit tests pass.
- Task 2 complete: new Edge styles suite RED (no inspector) -> GREEN. Full suite 27/27.
- Inspector includes per-blank border/color, Korean multiline text, 8–72 point font size. Renderer wraps/shrinks and clips text. Resize preserves metadata.
- Sidecar stores only explicit metadata and rectangles, no original PDF/password. SHA-256 computed before PDF.js transfers bytes. Mismatched/malformed/out-of-bounds projects leave existing history unchanged.
- Ruling: separate JSON sidecar directly follows user request; original PDF must be opened first. Exact-byte hash rejects modified PDFs to prevent misplaced editing. Text is plain JSON; documentation explains it contains user-entered text.
- Ruling: JPEG download no longer clears project-dirty state; only sidecar save/load does. Existing password test now explicitly accepts the expected unsaved-edit confirmation.
- Ruling: 10MB / 10,000 rectangles / 2,000 text characters limits keep imported sidecars bounded. Oversized saves are rejected rather than producing unreadable files.
- Independent review and portable release validation pending.
Review: fixed shallow multiline clipping with whole-layout scaling; regression RED then GREEN. No other material findings. Native IME and arbitrary font fidelity not independently certified.
User startup issue: file:// module CORS reproduced. Added classic bootstrap and launcher guidance; file startup regression passes. Complete suite 29/29 passed with test-concurrency=1 (parallel Edge runs previously exceeded 8s download timeout).
Root entry follow-up: moved web/index.html to root index.html, assets under web/, server exposes only /index.html and /web/. Updated direct-file guidance, browser test imports and README. Full suite 29/29 passed. New clean root-layout release staging avoids stale HTML.
