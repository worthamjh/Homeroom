"""Repeat a one-page PDF into an N-page notebook, sharing the page drawing.

    python scripts/build-notebook-pdf.py <one-page.pdf> <out.pdf> <pages>

Expects the layout ReportLab writes for a single page: fonts in objects
1-4, one page whose /Contents is a single stream object. Every output page
points at that same stream and resource dictionary, so 25 pages is ~10KB.
"""
import re, sys

src_path, out_path, pages = sys.argv[1], sys.argv[2], int(sys.argv[3])
src = open(src_path, "rb").read()

def obj(n):
    m = re.search(rb"(?<![0-9])%d 0 obj\s*(.*?)\s*endobj" % n, src, re.S)
    if not m: raise SystemExit(f"object {n} not found")
    return m.group(1)

page = re.search(rb"/Contents (\d+) 0 R", src)
if not page: raise SystemExit("no page /Contents found")
content_num = int(page.group(1))
# ReportLab's single-page layout: the font dictionary is object 1.
resources = b"<< /Font 1 0 R /ProcSet [ /PDF /Text /ImageB /ImageC /ImageI ] >>"

objs = {n: obj(n) for n in (1, 2, 3, 4)}
objs[content_num] = obj(content_num)
first_page = max(objs) + 1 if max(objs) >= 9 else 10
page_nums = list(range(first_page, first_page + pages))
pages_num, catalog_num, info_num = first_page + pages, first_page + pages + 1, first_page + pages + 2
kids = b" ".join(b"%d 0 R" % n for n in page_nums)
objs[pages_num] = b"<< /Count %d /Kids [ %s ] /Type /Pages >>" % (pages, kids)
for n in page_nums:
    objs[n] = (b"<< /Contents %d 0 R /MediaBox [ 0 0 612 792 ] /Parent %d 0 R /Resources %s /Type /Page >>"
               % (content_num, pages_num, resources))
objs[catalog_num] = b"<< /PageMode /UseNone /Pages %d 0 R /Type /Catalog >>" % pages_num
objs[info_num] = b"<< /Title (Notebook) /Producer (Gil-Bilt Classroom) >>"

out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
offsets = {}
for n in sorted(objs):
    offsets[n] = len(out)
    out += b"%d 0 obj\n" % n + objs[n] + b"\nendobj\n"
xref = len(out)
maxn = max(objs)
out += b"xref\n0 %d\n0000000000 65535 f \n" % (maxn + 1)
for n in range(1, maxn + 1):
    out += (b"%010d 00000 n \n" % offsets[n]) if n in offsets else b"0000000000 65535 f \n"
out += b"trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (maxn + 1, catalog_num, info_num, xref)
open(out_path, "wb").write(out)
print(f"wrote {out_path}: {pages} pages, {len(out)} bytes")
