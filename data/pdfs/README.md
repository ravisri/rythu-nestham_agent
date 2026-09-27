# Put ANGRAU/ICAR files here as data/pdfs/<crop>/<file>.pdf (or .txt/.md), then run: npm run ingest

Crop folder names must be slugs from `lib/crops.ts` (e.g. `paddy`, `cotton`). Use `general/` for
books that cover many crops, and add a manifest `<file name>.json` next to the PDF that maps each
chapter to a crop and topic (see `general/Vyavasaya Panchangam 2022-2023.json`):

- `pages` = printed page numbers from the book's contents page; `pageOffset` = PDF page − printed page.
- `pdfPages` = raw PDF page numbers (for Roman-numbered front pages).
- `"skip": true` keeps a chapter listed but does not ingest it.

Run one crop at a time with `npm run ingest -- --crop paddy`. OCR text is cached in `data/ocr/`,
so an interrupted run (e.g. free-tier daily limit) continues where it stopped.

Re-running `npm run ingest` skips sections that are already stored; add `-- --force` to redo them
(e.g. after changing page numbers in a manifest).
