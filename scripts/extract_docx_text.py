#!/usr/bin/env python3
"""Extract readable paragraph/table text from DOCX files without external packages."""
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import json
import re

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def text_from_paragraph(node):
    parts = []
    for t in node.findall(".//w:t", NS):
        parts.append(t.text or "")
    return "".join(parts).strip()


def extract(path):
    with ZipFile(path) as zf:
        root = ET.fromstring(zf.read("word/document.xml"))
    blocks = []
    for child in root.findall(".//w:body/*", NS):
        if child.tag.endswith("}p"):
            value = text_from_paragraph(child)
            if value:
                blocks.append(value)
        elif child.tag.endswith("}tbl"):
            for row in child.findall("./w:tr", NS):
                cells = []
                for cell in row.findall("./w:tc", NS):
                    value = text_from_paragraph(cell)
                    if value:
                        cells.append(value)
                if cells:
                    blocks.append(" | ".join(cells))
    text = "\n".join(blocks)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text


def main():
    root = Path("staging/tchad")
    out = root / "docx-text"
    out.mkdir(parents=True, exist_ok=True)
    result = {}
    for path in sorted(root.glob("*.docx")):
        text = extract(path)
        target = out / f"{path.stem}.txt"
        target.write_text(text + ("\n" if text else ""), encoding="utf-8")
        result[path.name] = {"output": str(target), "characters": len(text)}
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
