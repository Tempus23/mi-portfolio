#!/usr/bin/env python3
"""Generate a deterministic, one-column PDF CV from the English CV JSON.

The generator intentionally uses only Python's standard library and the PDF
Base-14 Helvetica fonts.  No dates, random values, or external assets are put
in the document, so running it with the same JSON produces the same bytes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


PAGE_WIDTH = 595.28  # A4, points
PAGE_HEIGHT = 841.89
LEFT = 48.0
RIGHT = 48.0
BODY_WIDTH = PAGE_WIDTH - LEFT - RIGHT
BOTTOM = 54.0
FIRST_PAGE_TOP = 654.0
OTHER_PAGE_TOP = 788.0

NAVY = (0.08, 0.16, 0.27)
TEAL = (0.06, 0.49, 0.52)
DARK = (0.12, 0.15, 0.19)
MUTED = (0.35, 0.39, 0.44)
LIGHT = (0.88, 0.90, 0.92)

# A compact approximation of Helvetica's WinAnsi character widths.  Exact
# font metrics are not required for the layout, but using real-ish widths
# makes wrapping stable and avoids clipping long headings and URLs.
HELVETICA_WIDTHS = {
    " ": 0.278,
    "!": 0.278,
    '"': 0.355,
    "#": 0.556,
    "$": 0.556,
    "%": 0.889,
    "&": 0.667,
    "'": 0.191,
    "(": 0.333,
    ")": 0.333,
    "*": 0.389,
    "+": 0.584,
    ",": 0.278,
    "-": 0.333,
    ".": 0.278,
    "/": 0.278,
    ":": 0.278,
    ";": 0.278,
    "<": 0.584,
    "=": 0.584,
    ">": 0.584,
    "?": 0.556,
    "@": 1.015,
    "[": 0.278,
    "\\": 0.278,
    "]": 0.278,
    "^": 0.469,
    "_": 0.556,
    "`": 0.333,
    "{": 0.334,
    "|": 0.260,
    "}": 0.334,
    "~": 0.584,
}
for _letter in "abcdefghijklmnopqrstuvwxyz":
    HELVETICA_WIDTHS[_letter] = {
        "a": 0.556,
        "b": 0.556,
        "c": 0.500,
        "d": 0.556,
        "e": 0.556,
        "f": 0.278,
        "g": 0.556,
        "h": 0.556,
        "i": 0.222,
        "j": 0.222,
        "k": 0.500,
        "l": 0.222,
        "m": 0.833,
        "n": 0.556,
        "o": 0.556,
        "p": 0.556,
        "q": 0.556,
        "r": 0.333,
        "s": 0.500,
        "t": 0.278,
        "u": 0.556,
        "v": 0.500,
        "w": 0.722,
        "x": 0.500,
        "y": 0.500,
        "z": 0.500,
    }[_letter]
for _letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
    HELVETICA_WIDTHS[_letter] = {
        "A": 0.667,
        "B": 0.667,
        "C": 0.722,
        "D": 0.722,
        "E": 0.667,
        "F": 0.611,
        "G": 0.778,
        "H": 0.722,
        "I": 0.278,
        "J": 0.500,
        "K": 0.667,
        "L": 0.556,
        "M": 0.833,
        "N": 0.722,
        "O": 0.778,
        "P": 0.667,
        "Q": 0.778,
        "R": 0.722,
        "S": 0.667,
        "T": 0.611,
        "U": 0.722,
        "V": 0.667,
        "W": 0.944,
        "X": 0.667,
        "Y": 0.667,
        "Z": 0.611,
    }[_letter]


@dataclass(frozen=True)
class Item:
    kind: str
    height: float
    values: tuple[Any, ...]


@dataclass(frozen=True)
class PlacedItem:
    item: Item
    top: float


def text_width(text: str, size: float) -> float:
    """Return a stable width estimate for a Base-14 Helvetica string."""
    total = 0.0
    for char in text:
        if char in HELVETICA_WIDTHS:
            factor = HELVETICA_WIDTHS[char]
        else:
            decomposed = unicodedata.normalize("NFKD", char)
            base = decomposed[0] if decomposed else "?"
            factor = HELVETICA_WIDTHS.get(base, 0.55)
        total += factor * size
    return total


def safe_text(text: Any) -> str:
    """Make input safe for WinAnsi while retaining common European accents."""
    value = str(text)
    replacements = {
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2013": "-",
        "\u2014": "-",
        "\u2022": "-",
        "\u00a0": " ",
    }
    value = "".join(replacements.get(char, char) for char in value)
    return value.encode("cp1252", errors="replace").decode("cp1252")


def wrap_text(text: str, max_width: float, size: float) -> list[str]:
    """Wrap text by measured width, splitting an unusually long token safely."""
    normalized = safe_text(text).replace("\r\n", "\n").replace("\r", "\n")
    result: list[str] = []
    for paragraph in normalized.split("\n"):
        words = paragraph.split()
        if not words:
            result.append("")
            continue
        line = ""
        for word in words:
            candidate = word if not line else f"{line} {word}"
            if text_width(candidate, size) <= max_width:
                line = candidate
                continue
            if line:
                result.append(line)
                line = ""
            # URLs and other long tokens must not overflow the content column.
            chunk = ""
            for char in word:
                candidate_chunk = chunk + char
                if chunk and text_width(candidate_chunk, size) > max_width:
                    result.append(chunk)
                    chunk = char
                else:
                    chunk = candidate_chunk
            line = chunk
        if line:
            result.append(line)
    return result


def rgb(color: tuple[float, float, float]) -> bytes:
    return f"{color[0]:.3f} {color[1]:.3f} {color[2]:.3f}".encode("ascii")


def pdf_string(value: str) -> bytes:
    """Encode a text string as a PDF literal string using WinAnsi bytes."""
    raw = safe_text(value).encode("cp1252")
    escaped = bytearray()
    for byte in raw:
        if byte in (0x28, 0x29, 0x5c):  # (, ), backslash
            escaped.extend((0x5C, byte))
        elif byte == 0x0A:
            escaped.extend(b"\\n")
        elif byte == 0x0D:
            escaped.extend(b"\\r")
        else:
            escaped.append(byte)
    return b"(" + bytes(escaped) + b")"


def draw_text(x: float, baseline: float, value: str, font: str, size: float, color: tuple[float, float, float]) -> bytes:
    return b" ".join(
        (
            b"BT",
            b"/" + font.encode("ascii") + f" {size:.2f} Tf".encode("ascii"),
            rgb(color) + b" rg",
            f"1 0 0 1 {x:.2f} {baseline:.2f} Tm".encode("ascii"),
            pdf_string(value),
            b"Tj",
            b"ET",
        )
    )


def draw_rule(x1: float, y: float, x2: float, color: tuple[float, float, float], width: float = 0.8) -> bytes:
    return b" ".join(
        (
            b"q",
            f"{width:.2f} w".encode("ascii"),
            rgb(color) + b" RG",
            f"{x1:.2f} {y:.2f} m {x2:.2f} {y:.2f} l S".encode("ascii"),
            b"Q",
        )
    )


def draw_rect(x: float, y: float, width: float, height: float, color: tuple[float, float, float]) -> bytes:
    return b" ".join(
        (
            b"q",
            rgb(color) + b" rg",
            f"{x:.2f} {y:.2f} {width:.2f} {height:.2f} re f".encode("ascii"),
            b"Q",
        )
    )


class FlowLayout:
    """A small page-flow engine that keeps all content inside the margins."""

    def __init__(self) -> None:
        self.pages: list[list[PlacedItem]] = [[]]
        self.y = FIRST_PAGE_TOP

    @property
    def page_index(self) -> int:
        return len(self.pages) - 1

    def new_page(self) -> None:
        self.pages.append([])
        self.y = OTHER_PAGE_TOP

    def place(self, item: Item, minimum_following: float = 0.0) -> None:
        if self.pages[-1] and self.y - item.height - minimum_following < BOTTOM:
            self.new_page()
        self.pages[-1].append(PlacedItem(item, self.y))
        self.y -= item.height

    def section(self, title: str) -> None:
        # Keep a section heading with a useful amount of following content.
        if self.pages[-1] and self.y - 25.0 - 30.0 < BOTTOM:
            self.new_page()
        self.place(Item("section", 25.0, (safe_text(title),)))

    def spacer(self, height: float = 7.0) -> None:
        self.place(Item("spacer", height, ()))

    def paragraph(self, text: str, size: float = 9.25, leading: float = 13.25, color: tuple[float, float, float] = DARK, indent: float = 0.0) -> None:
        for line in wrap_text(text, BODY_WIDTH - indent, size):
            self.place(Item("text", leading, (line, LEFT + indent, size, color, "F1")))

    def labeled_lines(
        self,
        label: str,
        values: Iterable[str],
        size: float = 8.65,
        leading: float = 12.2,
        color: tuple[float, float, float] = MUTED,
    ) -> None:
        label_text = safe_text(label)
        values_text = " - ".join(safe_text(value) for value in values)
        joined = f"{label_text}: {values_text}" if label_text else values_text
        lines = wrap_text(joined, BODY_WIDTH, size)
        for line in lines:
            self.place(Item("text", leading, (line, LEFT, size, color, "F1")))

    def entry_header(self, title: str, organization: str, date: str) -> None:
        title_size = 10.4
        date_size = 8.5
        date_text = safe_text(date)
        date_width = text_width(date_text, date_size)
        title_width = BODY_WIDTH - date_width - 14.0
        title_lines = wrap_text(title, title_width, title_size)
        organization_lines = wrap_text(organization, BODY_WIDTH, 9.0)
        height = 16.0 * len(title_lines) + 13.0 * len(organization_lines) + 5.0
        self.place(Item("entry_header", height, (tuple(title_lines), tuple(organization_lines), date_text, title_size, date_size)))

    def bullet_lines(self, values: Iterable[str], size: float = 9.0, leading: float = 12.9) -> None:
        for value in values:
            lines = wrap_text(value, BODY_WIDTH - 14.0, size)
            for index, line in enumerate(lines):
                prefix = "- " if index == 0 else "  "
                self.place(Item("text", leading, (prefix + line, LEFT, size, DARK, "F1")))


def build_layout(data: dict[str, Any]) -> FlowLayout:
    layout = FlowLayout()
    basic = data.get("basic_info", {})
    about = data.get("about_me", {})

    layout.section("SUMMARY")
    for paragraph in about.get("description_paragraphs", []):
        layout.paragraph(paragraph)
        layout.spacer(3.0)
    attributes = about.get("attributes", [])
    if attributes:
        layout.labeled_lines("Core strengths", attributes, size=8.65, color=TEAL)
    layout.spacer(9.0)

    experience = data.get("professional_experience", [])
    if experience:
        layout.section("PROFESSIONAL EXPERIENCE")
        for index, job in enumerate(experience):
            layout.entry_header(job.get("title", ""), job.get("company", ""), job.get("date", ""))
            description = job.get("description", "")
            if isinstance(description, list):
                layout.bullet_lines(description, size=9.1, leading=12.9)
            else:
                layout.paragraph(description, size=9.1, leading=12.9)
            keywords = job.get("keywords", [])
            if keywords:
                layout.labeled_lines("Technologies", keywords, size=8.45, leading=11.8, color=MUTED)
            if index != len(experience) - 1:
                layout.spacer(10.0)
        layout.spacer(9.0)

    education = data.get("academic_formation", [])
    if education:
        layout.section("EDUCATION")
        for index, item in enumerate(education):
            layout.entry_header(item.get("title", ""), item.get("company", ""), item.get("date", ""))
            layout.paragraph(item.get("description", ""), size=9.0, leading=12.7)
            if index != len(education) - 1:
                layout.spacer(8.0)
        layout.spacer(9.0)

    skills = data.get("skills", {})
    technical = skills.get("technical", [])
    competencies = skills.get("competencies", [])
    if technical or competencies:
        layout.section("SKILLS")
        for category in technical:
            category_name = safe_text(category.get("category", ""))
            layout.place(Item("skill_category", 14.0, (category_name,)))
            items = category.get("items", [])
            if items:
                layout.labeled_lines("", items, size=8.75, leading=12.1, color=DARK)
            layout.spacer(3.0)
        if competencies:
            layout.place(Item("skill_category", 14.0, ("Professional competencies",)))
            layout.bullet_lines(competencies, size=8.8, leading=12.0)
        layout.spacer(9.0)

    projects = data.get("projects", [])
    if projects:
        layout.section("PROJECTS")
        for index, project in enumerate(projects):
            layout.place(Item("project_title", 17.0, (safe_text(project.get("title", "")),)))
            layout.paragraph(project.get("description", ""), size=9.0, leading=12.7)
            tags = project.get("tags", [])
            if tags:
                layout.labeled_lines("Tags", tags, size=8.45, leading=11.8, color=TEAL)
            links = [link for link in (project.get("link", ""), project.get("github", "")) if link]
            if links:
                layout.labeled_lines("Links", links, size=8.35, leading=11.7, color=MUTED)
            if index != len(projects) - 1:
                layout.spacer(10.0)
        layout.spacer(9.0)

    languages = data.get("languages", [])
    if languages:
        layout.section("LANGUAGES")
        language_text = " - ".join(f"{safe_text(item.get('name', ''))}: {safe_text(item.get('level', ''))}" for item in languages)
        for line in wrap_text(language_text, BODY_WIDTH, 9.1):
            layout.place(Item("text", 13.0, (line, LEFT, 9.1, DARK, "F1")))

    # The contact block is deliberately read from the same canonical JSON as
    # the body, rather than being duplicated in this script.
    _ = basic
    return layout


def render_page(items: list[PlacedItem], page_number: int, page_count: int, data: dict[str, Any]) -> bytes:
    commands: list[bytes] = []
    basic = data.get("basic_info", {})
    name = safe_text(basic.get("name", ""))

    # Header is present only on the first page.  The continuation pages get a
    # restrained running bar so the document still feels like one CV.
    if page_number == 1:
        commands.append(draw_rect(0, PAGE_HEIGHT - 15.0, PAGE_WIDTH, 15.0, NAVY))
        commands.append(draw_text(LEFT, 786.0, name, "F2", 24.0, NAVY))
        commands.append(draw_text(LEFT, 758.0, safe_text(basic.get("role", "")), "F2", 11.5, TEAL))
        tagline = basic.get("tagline", "")
        if tagline:
            commands.append(draw_text(LEFT, 739.0, safe_text(tagline), "F3", 9.3, MUTED))

        emails = [safe_text(email) for email in basic.get("emails", []) if email]
        contact_first = "  |  ".join(emails)
        contact_second = "  |  ".join(
            part
            for part in (
                f"LinkedIn: {safe_text(basic.get('linkedin', ''))}" if basic.get("linkedin") else "",
                f"GitHub: {safe_text(basic.get('github', ''))}" if basic.get("github") else "",
                safe_text(basic.get("location", "")),
            )
            if part
        )
        contact_lines = wrap_text(contact_first, BODY_WIDTH, 8.25) + wrap_text(contact_second, BODY_WIDTH, 8.25)
        contact_y = 716.0
        for line in contact_lines[:3]:
            commands.append(draw_text(LEFT, contact_y, line, "F1", 8.25, MUTED))
            contact_y -= 12.0
        commands.append(draw_rule(LEFT, 681.0, PAGE_WIDTH - RIGHT, LIGHT, 1.0))
    else:
        commands.append(draw_rect(0, PAGE_HEIGHT - 8.0, PAGE_WIDTH, 8.0, TEAL))
        commands.append(draw_text(LEFT, PAGE_HEIGHT - 30.0, name, "F2", 10.0, NAVY))
        commands.append(draw_text(PAGE_WIDTH - RIGHT - 75.0, PAGE_HEIGHT - 30.0, "CURRICULUM VITAE", "F1", 7.2, MUTED))
        commands.append(draw_rule(LEFT, PAGE_HEIGHT - 40.0, PAGE_WIDTH - RIGHT, LIGHT, 0.8))

    for placed in items:
        item = placed.item
        top = placed.top
        if item.kind == "section":
            title = item.values[0]
            commands.append(draw_text(LEFT, top - 13.0, title, "F2", 10.0, NAVY))
            commands.append(draw_rule(LEFT, top - 21.0, PAGE_WIDTH - RIGHT, TEAL, 1.35))
        elif item.kind == "text":
            value, x, size, color, font = item.values
            commands.append(draw_text(float(x), top - float(size), value, font, float(size), color))
        elif item.kind == "entry_header":
            title_lines, organization_lines, date, title_size, date_size = item.values
            for index, line in enumerate(title_lines):
                baseline = top - 11.5 - (index * 16.0)
                commands.append(draw_text(LEFT, baseline, line, "F2", title_size, DARK))
                if index == 0 and date:
                    date_x = PAGE_WIDTH - RIGHT - text_width(date, date_size)
                    commands.append(draw_text(date_x, baseline, date, "F1", date_size, MUTED))
            organization_top = top - (16.0 * len(title_lines))
            for index, line in enumerate(organization_lines):
                commands.append(draw_text(LEFT, organization_top - 10.0 - (index * 13.0), line, "F1", 9.0, TEAL))
        elif item.kind == "skill_category":
            commands.append(draw_text(LEFT, top - 10.0, item.values[0], "F2", 9.0, NAVY))
        elif item.kind == "project_title":
            commands.append(draw_text(LEFT, top - 11.5, item.values[0], "F2", 10.0, DARK))

    footer = f"{name}  -  Curriculum Vitae  |  {page_number} / {page_count}"
    commands.append(draw_rule(LEFT, 39.0, PAGE_WIDTH - RIGHT, LIGHT, 0.65))
    footer_width = text_width(footer, 7.3)
    commands.append(draw_text(PAGE_WIDTH - RIGHT - footer_width, 27.0, footer, "F1", 7.3, MUTED))
    return b"\n".join(commands) + b"\n"


def pdf_object(content: bytes) -> bytes:
    return content


def build_pdf(data: dict[str, Any], layout: FlowLayout) -> bytes:
    page_count = len(layout.pages)
    streams = [render_page(items, index + 1, page_count, data) for index, items in enumerate(layout.pages)]

    # Object numbering is fixed: catalog, page tree, three fonts, then each
    # page followed by its content stream.  This is part of the determinism.
    catalog_id = 1
    pages_id = 2
    font_regular_id = 3
    font_bold_id = 4
    font_italic_id = 5
    first_page_id = 6
    first_stream_id = first_page_id + page_count
    objects: list[bytes] = [b""] * (first_stream_id + page_count)
    objects[catalog_id - 1] = b"<< /Type /Catalog /Pages 2 0 R >>"
    page_ids = [first_page_id + index for index in range(page_count)]
    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects[pages_id - 1] = f"<< /Type /Pages /Kids [{kids}] /Count {page_count} >>".encode("ascii")
    objects[font_regular_id - 1] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
    objects[font_bold_id - 1] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
    objects[font_italic_id - 1] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>"

    for index, stream in enumerate(streams):
        page_id = page_ids[index]
        stream_id = first_stream_id + index
        objects[page_id - 1] = (
            f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 {PAGE_WIDTH:.2f} {PAGE_HEIGHT:.2f}] "
            f"/Resources << /Font << /F1 {font_regular_id} 0 R /F2 {font_bold_id} 0 R /F3 {font_italic_id} 0 R >> >> "
            f"/Contents {stream_id} 0 R >>"
        ).encode("ascii")
        objects[stream_id - 1] = b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"endstream"

    header = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    document_body = bytearray(header)
    offsets = [0]
    for object_number, content in enumerate(objects, start=1):
        offsets.append(len(document_body))
        document_body.extend(f"{object_number} 0 obj\n".encode("ascii"))
        document_body.extend(pdf_object(content))
        document_body.extend(b"\nendobj\n")

    xref_offset = len(document_body)
    document_body.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    document_body.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        document_body.extend(f"{offset:010d} 00000 n \n".encode("ascii"))

    # The ID is content-derived and therefore stable, without introducing a
    # timestamp or random value into an otherwise reproducible artifact.
    file_id = hashlib.md5(bytes(document_body), usedforsecurity=False).hexdigest().upper().encode("ascii")
    document_body.extend(
        b"trailer\n"
        + f"<< /Size {len(objects) + 1} /Root {catalog_id} 0 R /ID [<".encode("ascii")
        + file_id
        + b"><"
        + file_id
        + b">] >>\n"
        + f"startxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    )
    return bytes(document_body)


def extract_literal_strings(pdf: bytes) -> list[str]:
    """Extract literal strings from uncompressed content streams for checks."""
    strings: list[str] = []
    for match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", pdf, flags=re.DOTALL):
        stream = match.group(1)
        index = 0
        while index < len(stream):
            if stream[index] != 0x28:  # '('
                index += 1
                continue
            index += 1
            depth = 1
            value = bytearray()
            while index < len(stream) and depth:
                byte = stream[index]
                index += 1
                if byte == 0x5C:  # backslash escape
                    if index >= len(stream):
                        break
                    escaped = stream[index]
                    index += 1
                    simple = {ord("n"): 10, ord("r"): 13, ord("t"): 9, ord("b"): 8, ord("f"): 12}
                    if escaped in simple:
                        value.append(simple[escaped])
                    elif 48 <= escaped <= 55:
                        digits = bytes([escaped])
                        for _ in range(2):
                            if index < len(stream) and 48 <= stream[index] <= 55:
                                digits += bytes([stream[index]])
                                index += 1
                            else:
                                break
                        value.append(int(digits, 8))
                    else:
                        value.append(escaped)
                elif byte == 0x28:
                    depth += 1
                    value.append(byte)
                elif byte == 0x29:
                    depth -= 1
                    if depth:
                        value.append(byte)
                else:
                    value.append(byte)
            strings.append(bytes(value).decode("cp1252", errors="replace"))
    return strings


def validate_pdf(path: Path, expected: Iterable[str], expected_pdf: bytes) -> tuple[bool, str]:
    if not path.is_file():
        return False, f"missing artifact: {path}"
    pdf = path.read_bytes()
    if not pdf.startswith(b"%PDF-1.4") or b"%%EOF" not in pdf[-32:]:
        return False, "invalid PDF header or EOF marker"
    if b"xref\n" not in pdf or b"/Type /Catalog" not in pdf:
        return False, "missing cross-reference table or catalog"
    strings = extract_literal_strings(pdf)
    extracted = "\n".join(strings)
    missing = [value for value in expected if value not in extracted]
    if missing:
        return False, "missing expected text: " + ", ".join(missing)
    page_count = len(re.findall(rb"/Type /Page /Parent", pdf))
    if page_count < 1:
        return False, "PDF contains no page objects"
    actual_hash = hashlib.sha256(pdf).hexdigest()
    expected_hash = hashlib.sha256(expected_pdf).hexdigest()
    if actual_hash != expected_hash:
        return False, f"artifact does not match current generated PDF (sha256 {actual_hash} != {expected_hash})"
    return True, f"valid PDF; {page_count} page(s); {len(pdf)} bytes; expected text present; sha256 {actual_hash} matches current data"


def load_data(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError("CV data must be a JSON object")
    return value


def generate(data_path: Path, output_path: Path) -> tuple[Path, int, int]:
    data = load_data(data_path)
    layout = build_layout(data)
    pdf = build_pdf(data, layout)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(pdf)
    return output_path, len(layout.pages), len(pdf)


def main(argv: list[str] | None = None) -> int:
    repository = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=repository / "src/data/cv_data.json")
    parser.add_argument("--output", type=Path, default=repository / "public/carlos-hernandez-martinez-cv.pdf")
    parser.add_argument("--validate", action="store_true", help="validate the existing output instead of generating it")
    args = parser.parse_args(argv)
    data_path = args.data.resolve()
    output_path = args.output.resolve()

    try:
        if args.validate:
            data = load_data(data_path)
            basic = data.get("basic_info", {})
            expected = (
                safe_text(basic.get("name", "")),
                "SUMMARY",
                "PROFESSIONAL EXPERIENCE",
                "EDUCATION",
                "SKILLS",
                "PROJECTS",
                "LANGUAGES",
                safe_text(basic.get("role", "")),
            )
            expected_pdf = build_pdf(data, build_layout(data))
            ok, message = validate_pdf(output_path, expected, expected_pdf)
            print(f"{message}: {output_path}")
            return 0 if ok else 1

        path, page_count, byte_count = generate(data_path, output_path)
        print(f"Generated {path} ({page_count} page(s), {byte_count} bytes)")
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = [
    "build_layout",
    "build_pdf",
    "extract_literal_strings",
    "generate",
    "validate_pdf",
]


# End of file.
