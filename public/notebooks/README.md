# Notebook PDFs

Each file here is one notebook template repeated for every page, with every
page sharing the same drawing and fonts, so the file stays close to the
size of the single sheet whatever the page count. `thumbs/` holds the store
picture for each, 480px wide like the paper thumbnails.

The three CER editions (rubric, notebook, chalkboard) are Jay's sheets
from 2026-09-04; the one-page sources are kept in `scripts/notebooks/`. To
add or rebuild one, run the script in `scripts/build-notebook-pdf.py`
(needs PyMuPDF: `py -m pip install pymupdf`):

    py scripts/build-notebook-pdf.py scripts/notebooks/cer-notebook.pdf cer-notebook 50

That writes `cer-notebook-50.pdf` and `thumbs/cer-notebook.png` here. Then list the
template in `src/lib/notebooks.js`.
