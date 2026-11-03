# PDF 빈칸 편집기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Build a local-only PDF rectangle editor exporting all pages as JPEG in ZIP.
**Architecture:** Static ES modules with local PDF.js and fflate. PowerShell serves only web/ on loopback; files stay in browser memory.
**Tech Stack:** HTML, CSS, JavaScript, Windows PowerShell/.NET; Node and Playwright for developer tests only.
**Spec:** ../specs/2026-11-03-pdf-blank-editor-design.md

## Global Constraints
No PDF uploads or external runtime assets. No user dependency installation or build. Korean UI. Edge/Chrome. White fill, black border. All pages exported. Original PDF unchanged.

## Review Focus
- Rotated and mixed-size pages retain alignment: browser export pixel assertions.
- Navigation and rendering races: rapid navigation test.
- Cancelled/failed imports preserve current work: browser invalid-file and password tests.
- Export cancellation restores controls: browser cancellation test.
- Network/privacy and server traversal: network allowlist and HTTP negative tests.

### Task 1: Local runtime
Files: start.cmd, server.ps1, web/index.html, tests/server.test.mjs.
Interface: GET/HEAD on http://127.0.0.1:8765 serves web/ only; -Port and -NoBrowser support testing.
- [x] Write HTTP tests for index, MIME, CSP, POST rejection, traversal and Host rejection.
- [x] Run tests; expect failure because server missing.
- [x] Implement server and launcher; vendor PDF.js and fflate with licenses and checksums.
- [x] Run server tests; expect all pass.

### Task 2: Editing
Files: web/model.mjs, web/app.mjs, web/style.css, tests/model.test.mjs, tests/app.test.mjs.
Interfaces: rectFromPoints(a,b,bounds), moveRect(rect,dx,dy,bounds), History with commit/undo/redo and current rectangles; page-space coordinates at viewport scale 1.
- [x] Write geometry/history tests and browser test opening generated mixed-page PDF, drawing, moving, resizing, undo, redo, zoom and navigation.
- [x] Run tests; expect missing behavior failures.
- [x] Implement Korean UI, canvas render cancellation, page histories, input locking and password dialog.
- [x] Run unit and browser editing tests; expect pass.

### Task 3: Export and delivery
Files: web/export.mjs, README.md, tests/app.test.mjs, release/PDF-Blank-Editor.zip.
Interface: exportPages(pdf, histories, {dpi,signal,onProgress}) returns ZIP Blob; cancellation throws AbortError.
- [x] Write export tests checking ZIP page count, JPEG dimensions and white interior/black border pixels, blank unedited pages, cancellation and failed import recovery.
- [x] Run tests; expect export missing failures.
- [x] Implement sequential rasterization and ZIP, progress and cancellation, memory size guards, dirty warning.
- [x] Run complete suite, inspect screenshot and request log, review code, package portable app and user guide.

## Execution notes
User approved implementation; execute inline without another approval loop. Folder is a new non-git project, so git worktree/commit helpers do not apply. Track test results in progress.md. Dependencies are downloaded during development only, never when user runs app.

