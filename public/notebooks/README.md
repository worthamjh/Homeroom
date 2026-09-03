# Notebook PDFs

Each file here is one notebook template repeated for every page. They are
built from a single-page template PDF by pointing every page object at the
same content stream, so the file stays tiny whatever the page count.

To rebuild `cer-25.pdf` from `CER_Template.pdf` (a one-page ReportLab PDF
with the drawing in object 9 and fonts in objects 1-4), run the script in
`scripts/build-notebook-pdf.py`:

    python scripts/build-notebook-pdf.py CER_Template.pdf public/notebooks/cer-25.pdf 25
