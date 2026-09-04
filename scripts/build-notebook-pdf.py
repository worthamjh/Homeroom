"""Turn a one-page template PDF into an N-page notebook and its store thumbnail.

    py scripts/build-notebook-pdf.py <one-page.pdf> <name> [pages]

Writes, relative to the project root:

    public/notebooks/<name>-<pages>.pdf   the sheet repeated <pages> times (default 25)
    public/notebooks/thumbs/<name>.png    the store picture, 480 wide like the paper thumbnails

The notebook is the page inserted <pages> times and saved with garbage
collection, so every page shares one copy of the drawing and the fonts:
25 pages come out a few KB over the single sheet. Needs PyMuPDF
(`py -m pip install pymupdf`). Any one-page PDF will do; the earlier
version of this script only understood ReportLab's object layout.

The one-page sources live in scripts/notebooks/ so a template can be
rebuilt (say, at 50 pages) without hunting for the original.
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
pages = int(sys.argv[3]) if len(sys.argv) > 3 else 25
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

src = pymupdf.open(src_path)
if len(src) != 1:
    raise SystemExit(f"{src_path} has {len(src)} pages; expected one")

out_dir = os.path.join(root, "public", "notebooks")
os.makedirs(os.path.join(out_dir, "thumbs"), exist_ok=True)
thumb_path = os.path.join(out_dir, "thumbs", f"{name}.png")
notebook_path = os.path.join(out_dir, f"{name}-{pages}.pdf")

# 612pt wide letter page -> 480px, the size the paper thumbnails use.
scale = 480 / src[0].rect.width
src[0].get_pixmap(matrix=pymupdf.Matrix(scale, scale)).save(thumb_path)

notebook = pymupdf.open()
for _ in range(pages):
    notebook.insert_pdf(src, from_page=0, to_page=0)
notebook.set_metadata({"title": "Notebook", "producer": "Gil-Bilt Classroom"})
notebook.save(notebook_path, garbage=4, deflate=True)

for p in (thumb_path, notebook_path):
    print(f"wrote {os.path.relpath(p, root)} ({os.path.getsize(p)} bytes)")
