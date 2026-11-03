# Styles and Projects Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. User requested implementation in the existing app; proceed inline.

**Goal:** Add per-rectangle border/text options and separate reusable editing files.
**Architecture:** Extend rectangle data; shared canvas painter; strict JSON sidecar module; browser SHA-256 of original bytes.
**Tech Stack:** Existing HTML/JS/PowerShell; existing Node/Edge tests.
**Spec:** ../specs/2026-11-03-styles-projects-design.md

## Global Constraints
Local only, no runtime dependencies added, no PDF or passwords in edit JSON, no build needed.

## Review Focus
Wrong PDF matching, malformed sidecars, resize dropping styles, Unicode/text overflow, unsaved edits after JPEG export.

### Task 1: Model and persistence
Files: web/project.mjs, web/model.mjs, tests/project.test.mjs.
Interfaces: createProject(meta, histories), parseProject(text, meta) -> Map(page, rectangles); normalizeRect; validatePageBounds(rects, viewport).
- [x] Write roundtrip/mismatch/schema/bounds/resize-preservation tests; verify RED.
- [x] Implement strict versioned schema, safe explicit property copy, geometry helper preserving metadata; verify GREEN.

### Task 2: Editor and rendering
Files: web/app.mjs, web/export.mjs, web/index.html, web/style.css, tests/styles.test.mjs.
- [x] Write browser tests for options/text, colored and absent borders, JPEG text, resize/undo, saving and restoring, malformed/mismatched files. Verify RED.
- [x] Implement inspector, shared text layout and painting, JSON import/export, SHA-256 document binding and edit-save dirty tracking. Verify GREEN.

### Task 3: Delivery
Files: README.md, release/PDF-Blank-Editor.zip.
- [x] Run complete tests and independent review, fix important findings with regressions.
- [x] Update guide, package and verify extracted runtime; record completion.

