"""Make a store notebook and its thumbnail from a PDF.

    py scripts/build-notebook-pdf.py <source.pdf> <name> [pages] [thumb-page]

Two kinds of source:

  * A ONE-PAGE sheet (the CER templates): the page is repeated <pages>
    times (default 50) and saved with garbage collection, so every page
    shares one copy of the drawing and the fonts -- 50 pages come out a
    few KB over the single sheet.
  * A READY-MADE notebook of several pages (the Chemistry Lab Notebook:
    cover, contents, guidelines, 36 entries): copied as it is, <pages>
    ignored. <thumb-page> (1-based, default 1) picks the page the store
    shows -- Entry 1 rather than the cover, say.

Writes, relative to the project root:

    public/notebooks/<name>-<pages>.pdf   the notebook
    public/notebooks/thumbs/<name>.png    the store picture, 480 wide like the paper thumbnails

Needs PyMuPDF (`py -m pip install pymupdf`). The one-page sources live in
scripts/notebooks/ so a template can be rebuilt (say, at another page
count) without hunting for the original; a ready-made notebook IS its
own source, so it is not kept twice.
"""
import os
import sys

try:
    import pymupdf
except ImportError:
    raise SystemExit("PyMuPDF is needed: py -m pip install pymupdf")

if len(sys.argv) < 3:
    raise SystemExit(__doc__)
src_path, name = sys.argv[1], sys.argv[2]
pages_arg = int(sys.argv[3]) if len(sys.argv) > 3 else 50
thumb_page = int(sys.argv[4]) if len(sys.argv) > 4 else 1
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

src = pymupdf.open(src_path)
ready_made = len(src) > 1
pages = len(src) if ready_made else pages_arg
if not 1 <= thumb_page <= len(src):
    raise SystemExit(f"thumb page {thumb_page} is outside 1..{len(src)}")

out_dir = os.path.join(root, "public", "notebooks")
os.makedirs(os.path.join(out_dir, "thumbs"), exist_ok=True)
thumb_path = os.path.join(out_dir, "thumbs", f"{name}.png")
notebook_path = os.path.join(out_dir, f"{name}-{pages}.pdf")

# 612pt wide letter page -> 480px, the size the paper thumbnails use.
page = src[thumb_page - 1]
scale = 480 / page.rect.width
page.get_pixmap(matrix=pymupdf.Matrix(scale, scale)).save(thumb_path)

notebook = pymupdf.open()
if ready_made:
    notebook.insert_pdf(src)
else:
    for _ in range(pages):
        notebook.insert_pdf(src, from_page=0, to_page=0)
notebook.set_metadata({"title": "Notebook", "producer": "Gil-Bilt Classroom"})
notebook.save(notebook_path, garbage=4, deflate=True)

kind = f"ready-made, {pages} pages, thumbnail from page {thumb_page}" if ready_made else f"one sheet x {pages}"
print(f"{kind}")
for p in (thumb_path, notebook_path):
    print(f"wrote {os.path.relpath(p, root)} ({os.path.getsize(p)} bytes)")
