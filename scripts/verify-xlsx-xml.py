"""Validate generated XLSX packages independently of ExcelJS, using stdlib XML."""
import sys, zipfile, posixpath, re
import xml.etree.ElementTree as E
M="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
R="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
P="http://schemas.openxmlformats.org/package/2006/relationships"
with zipfile.ZipFile(sys.argv[1]) as z:
    assert z.testzip() is None, "ZIP CRC"
    files=set(z.namelist())
    xml={n:E.fromstring(z.read(n)) for n in files if n.endswith((".xml",".rels"))}
    for name,root in xml.items():
        if not name.endswith(".rels"): continue
        ids=set()
        base="" if name=="_rels/.rels" else posixpath.dirname(name).removesuffix("/_rels")
        for rel in root:
            assert rel.attrib["Id"] not in ids, "duplicate relationship"
            ids.add(rel.attrib["Id"])
            if rel.attrib.get("TargetMode")!="External":
                target=rel.attrib["Target"]
                resolved=target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join(base,target))
                assert resolved in files, (name,resolved)
    for name,root in xml.items():
        if name.endswith(".rels"): continue
        relname=posixpath.join(posixpath.dirname(name),"_rels",posixpath.basename(name)+".rels")
        relids={r.attrib["Id"] for r in xml.get(relname,[])}
        for node in root.iter():
            for key,value in node.attrib.items():
                if key in ["{"+R+"}id","{"+R+"}embed","{"+R+"}link"]: assert value in relids, (name,value)
    styles=xml["xl/styles.xml"]
    for collection in styles:
        if "count" in collection.attrib: assert int(collection.attrib["count"])==len(collection)
    count=len(styles.find("{"+M+"}cellXfs"))
    strings=xml.get("xl/sharedStrings.xml")
    names={n.attrib["name"] for n in xml["xl/workbook.xml"].iter("{"+M+"}definedName")}
    for name,sheet in xml.items():
        if not name.startswith("xl/worksheets/") or not name.endswith(".xml"):continue
        cells=set()
        for cell in sheet.iter("{"+M+"}c"):
            assert cell.attrib["r"] not in cells, "duplicate cell"
            cells.add(cell.attrib["r"])
            assert int(cell.attrib.get("s","0"))<count, "style index"
            if cell.attrib.get("t")=="s":
                assert strings is not None and int(cell.find("{"+M+"}v").text)<len(strings), "shared string index"
        for validation in sheet.iter("{"+M+"}dataValidation"):
            for formula in validation:
                f=(formula.text or "").removeprefix("=")
                if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.]*",f) and not re.fullmatch(r"[A-Za-z]{1,3}[1-9][0-9]*",f):
                    assert f in names, "dangling validation name "+f
    content=xml["[Content_Types].xml"]
    for node in content:
        if node.tag.endswith("Override"):assert node.attrib["PartName"].lstrip("/") in files, "missing content type target"
print("XLSX ZIP/XML consistency PASS")
