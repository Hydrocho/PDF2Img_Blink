# Image PDF export

The user confirmed that each finished page should be flattened: text, pictures and masks must not remain separate PDF objects. Page image extraction, screenshots and OCR cannot be prevented.

Keep JPEG ZIP export and add an image PDF button using the selected 150/200/300 DPI and existing 95% JPEG renderer. Preserve page order and displayed physical dimensions, including rotation. Build a new PDF exclusively from these JPEGs; never copy original pages, text, annotations, forms or attachments. Keep processing local, cancellation, progress and the 512 MB output guard.

Approaches: copying source pages would retain recoverable content and is unsuitable. A minimal custom PDF writer avoids a dependency but increases format maintenance. Vendor the already installed pdf-lib 1.17.1 browser module for a small, tested integration (implementation choice). Original JPEG ZIP behavior remains the default for existing callers.
