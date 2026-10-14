"""Verify the reviewed staging snapshot against the original XLSX; no DB access."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import posixpath
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
SHEETS = ("Sheet2", "1", "2", "3")
ROOT = Path(__file__).resolve().parent


def worksheets(path):
    with zipfile.ZipFile(path) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = [
                "".join(node.text or "" for node in item.findall(".//s:t", NS))
                for item in ET.fromstring(archive.read("xl/sharedStrings.xml"))
            ]
        relationships = {
            item.attrib["Id"]: item.attrib["Target"]
            for item in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        }
        sheets = {}
        for sheet in ET.fromstring(archive.read("xl/workbook.xml")).find("s:sheets", NS):
            relationship = sheet.attrib[
                "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
            ]
            target = relationships[relationship]
            member = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
            cells = {}
            for cell in ET.fromstring(archive.read(member)).findall("s:sheetData/s:row/s:c", NS):
                value_node = cell.find("s:v", NS)
                value = value_node.text or "" if value_node is not None else ""
                if cell.attrib.get("t") == "s":
                    value = strings[int(value)] if value else ""
                elif cell.attrib.get("t") == "inlineStr":
                    value = "".join(node.text or "" for node in cell.findall(".//s:t", NS))
                if value:
                    cells[cell.attrib["r"]] = value
            sheets[sheet.attrib["name"]] = cells
        return sheets


def extract(path):
    sheets = worksheets(path)
    rows = []
    headers = {}
    for name in SHEETS:
        cells = sheets[name]
        headers[name] = {
            re.sub(r"\d+$", "", key): value
            for key, value in cells.items() if re.search(r"(?<!\d)6$", key)
        }
        courier = name == "3"
        serial = cells.get("B4" if courier else "B2")
        date = (datetime.datetime(1899, 12, 30) + datetime.timedelta(days=float(serial))).date().isoformat()
        for number in range(7, 26):
            if not cells.get(f"B{number}", "").strip():
                continue
            raw = {
                re.sub(r"\d+$", "", key): value
                for key, value in cells.items() if int(re.search(r"\d+$", key).group()) == number
            }
            rows.append({
                "sheet": name, "row": number,
                "kind": "courier-route" if courier else "driver-route", "date": date,
                "company": raw["B"].strip(),
                "driver": "" if courier else cells.get("B3", "").strip(),
                "helper": "" if courier else cells.get("B4", "").strip(),
                "owner": cells.get("B3", "").strip() if courier else "",
                "vehicle": "" if courier else cells.get("B1", "").strip(),
                "priority": raw.get("A", "").strip(),
                "documents": "" if courier else raw.get("C", "").strip(),
                "salesOrderNumber": raw.get("C", "").strip() if courier else "",
                "reference": raw.get("D", "").strip(),
                "waybill": raw.get("E", "").strip() if courier else "",
                "remarks": raw.get("F" if courier else "E", "").strip(),
                "area": raw.get("G" if courier else "F", "").strip(),
                "timeIn": "" if courier else raw.get("G", "").strip(),
                "timeOut": "" if courier else raw.get("H", "").strip(),
                "signedByClient": "" if courier else raw.get("I", "").strip(),
                "mode": raw.get("H", "").strip() if courier else "",
                "additionalRemarks": raw.get("I" if courier else "J", "").strip(),
                "sourceCells": raw,
            })
    return headers, rows


def verify(workbook, snapshot):
    source = json.loads(snapshot.read_text())
    digest = hashlib.sha256(workbook.read_bytes()).hexdigest()
    if digest != source["source"]["sha256"]:
        raise ValueError("Original workbook SHA256 does not match the snapshot provenance.")
    headers, rows = extract(workbook)
    if headers != source["source"]["sheetHeaders"]:
        raise ValueError("Worksheet headers do not match the snapshot.")
    if len(rows) != len(source["rows"]):
        raise ValueError("Extracted and committed row counts differ.")
    for actual, committed in zip(rows, source["rows"]):
        if actual != committed:
            raise ValueError(f"Snapshot differs from workbook at sheet {actual['sheet']}, row {actual['row']}.")
    return {"verified": True, "workbookSha256": digest, "rows": len(rows),
            "companies": len({row["company"] for row in rows}),
            "rowsPerSheet": {name: sum(row["sheet"] == name for row in rows) for name in SHEETS}}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", type=Path, default=ROOT / "data/sources/delivery-route-2026.xlsx")
    parser.add_argument("--snapshot", type=Path, default=ROOT / "data/staging-route-source.json")
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.workbook, args.snapshot), indent=2))
    except (ValueError, KeyError, OSError, zipfile.BadZipFile, ET.ParseError) as error:
        print(f"Verification failed: {error}", file=sys.stderr)
        sys.exit(1)
