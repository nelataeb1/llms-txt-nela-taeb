"""Builds docs/llms-txt-deck.pptx, the interview deck for this project.

Requirements: pip install python-pptx
Usage:        python scripts/build_deck.py

The theme mirrors the reference deck: near-black background, dark cards with
hairline borders, Helvetica Neue / Helvetica Neue Light, one muted grey for
body copy and a monospace face for code.
"""

from __future__ import annotations

from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUT = DOCS / "llms-txt-deck.pptx"
LOGO = DOCS / "deck" / "profound-logo.png"

CANDIDATE = "Nela Taeb"
LIVE_URL = "https://llms-txt-nela-taeb.vercel.app"

BG = RGBColor(0x07, 0x07, 0x07)
CARD = RGBColor(0x0F, 0x0F, 0x0F)
HAIRLINE = RGBColor(0x33, 0x33, 0x33)
TITLE = RGBColor(0xF3, 0xF3, 0xF3)
BRIGHT = RGBColor(0xF5, 0xF5, 0xF0)
MUTED = RGBColor(0x88, 0x88, 0x88)
LABEL = RGBColor(0xC8, 0xC8, 0xC0)

SANS = "Helvetica Neue"
SANS_LIGHT = "Helvetica Neue Light"
MONO = "Roboto Mono"


# --------------------------------------------------------------------------- #
# primitives
# --------------------------------------------------------------------------- #
def text_box(
    slide,
    x: float,
    y: float,
    w: float,
    h: float,
    *,
    align=PP_ALIGN.LEFT,
    anchor=MSO_ANCHOR.TOP,
):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    frame = box.text_frame
    frame.word_wrap = True
    frame.margin_left = frame.margin_right = frame.margin_top = frame.margin_bottom = 0
    frame.vertical_anchor = anchor
    frame.paragraphs[0].alignment = align
    return frame


def write(
    frame,
    text: str,
    *,
    size: float,
    color: RGBColor = MUTED,
    font: str = SANS_LIGHT,
    bold: bool = False,
    space_before: float = 0,
    line_spacing: float = 1.25,
    first: bool = False,
    align=None,
):
    para = frame.paragraphs[0] if first else frame.add_paragraph()
    para.line_spacing = line_spacing
    para.space_before = Pt(space_before)
    if align is not None:
        para.alignment = align
    run = para.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.name = font
    run.font.bold = bold
    run.font.color.rgb = color
    return para


def line(slide, x1: float, y1: float, x2: float, y2: float, *, dashed=False, arrow=False):
    conn = slide.shapes.add_connector(
        MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2)
    )
    conn.line.color.rgb = HAIRLINE
    conn.line.width = Emu(9525)
    if dashed:
        conn.line.dash_style = 4  # long dash
    if arrow:
        tail = conn.line._get_or_add_ln().find(
            "{http://schemas.openxmlformats.org/drawingml/2006/main}tailEnd"
        )
        if tail is None:
            from lxml import etree

            tail = etree.SubElement(
                conn.line._get_or_add_ln(),
                "{http://schemas.openxmlformats.org/drawingml/2006/main}tailEnd",
            )
        tail.set("type", "triangle")
        tail.set("w", "sm")
        tail.set("len", "sm")
    return conn


def card(slide, x: float, y: float, w: float, h: float, *, fill=CARD, border=True):
    shape = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h)
    )
    shape.adjustments[0] = 0.06
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    if border:
        shape.line.color.rgb = HAIRLINE
        shape.line.width = Emu(10125)
    else:
        shape.line.fill.background()
    shape.shadow.inherit = False
    shape.text_frame.text = ""
    return shape


def node(slide, x: float, y: float, w: float, h: float, title: str, subtitle: str = ""):
    """A labelled diagram box."""
    card(slide, x, y, w, h)
    frame = text_box(slide, x, y, w, h, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    write(frame, title, size=9, color=BRIGHT, font=SANS, bold=True, first=True, align=PP_ALIGN.CENTER)
    if subtitle:
        write(frame, subtitle, size=7, color=LABEL, align=PP_ALIGN.CENTER)


def caption(slide, x: float, y: float, w: float, text: str, *, align=PP_ALIGN.CENTER):
    frame = text_box(slide, x, y, w, 0.16, align=align)
    write(frame, text, size=6.5, color=LABEL, first=True, align=align)


def picture(slide, path: Path, x: float, y: float, w: float):
    pic = slide.shapes.add_picture(str(path), Inches(x), Inches(y), width=Inches(w))
    pic.line.color.rgb = HAIRLINE
    pic.line.width = Emu(10125)
    return pic


# --------------------------------------------------------------------------- #
# slide chrome
# --------------------------------------------------------------------------- #
def new_slide(prs: Presentation):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = BG
    return slide


def content_slide(prs: Presentation, eyebrow: str, title: str):
    slide = new_slide(prs)
    line(slide, 0.23, 0.0, 0.23, 5.62, dashed=True)
    line(slide, 9.75, 0.0, 9.75, 5.62, dashed=True)
    line(slide, 0.0, 0.32, 10.0, 0.32, dashed=True)

    frame = text_box(slide, 0.7, 0.58, 8.6, 0.22)
    write(frame, eyebrow, size=8.5, color=MUTED, font=SANS, first=True)
    frame = text_box(slide, 0.7, 0.83, 8.8, 0.74)
    write(frame, title, size=30, color=TITLE, font=SANS_LIGHT, first=True, line_spacing=1.0)

    if LOGO.exists():
        slide.shapes.add_picture(str(LOGO), Inches(0.19), Inches(5.07), width=Inches(1.34))
    return slide


def wrapped_height(text: str, width: float, size: float) -> float:
    """Rough height in inches of `text` wrapped into `width`, so rows never collide."""
    chars_per_line = max(int(width * 72 / (0.52 * size)), 12)
    lines = 1
    used = 0
    for word in text.split():
        need = len(word) + (1 if used else 0)
        if used + need > chars_per_line:
            lines += 1
            used = len(word)
        else:
            used += need
    return lines * size * 1.34 / 72


def rows(slide, items, *, x=0.75, y=1.62, w=8.5, gap=0.3, title_size=11.5, body_size=10.0):
    """Title + muted description rows, the reference deck's default body layout."""
    top = y
    for head, body in items:
        frame = text_box(slide, x, top, w, 0.22)
        write(frame, head, size=title_size, color=TITLE, first=True)
        top += title_size * 1.34 / 72 + 0.09
        height = wrapped_height(body, w, body_size)
        frame = text_box(slide, x, top, w, height)
        write(frame, body, size=body_size, color=MUTED, first=True, line_spacing=1.3)
        top += height + gap
    return top


def numbered(slide, items, *, y=1.75, gap=0.38, w=7.8, head_size=13.0, body_size=10.5):
    top = y
    for index, (head, body) in enumerate(items):
        frame = text_box(slide, 0.79, top + 0.02, 0.4, 0.28)
        write(frame, f"{index + 1:02d}", size=11, color=TITLE, font=SANS, first=True)
        frame = text_box(slide, 1.29, top, w, 0.32)
        write(frame, head, size=head_size, color=TITLE, first=True)
        top += head_size * 1.34 / 72 + 0.1
        height = wrapped_height(body, w, body_size)
        frame = text_box(slide, 1.29, top, w, height)
        write(frame, body, size=body_size, color=MUTED, first=True, line_spacing=1.3)
        top += height + gap
    return top


def card_grid(slide, items, *, x=0.75, y=1.7, w=4.2, h=1.34, gapx=0.24, gapy=0.19):
    for index, (head, body) in enumerate(items):
        col, row = index % 2, index // 2
        left = x + col * (w + gapx)
        top = y + row * (h + gapy)
        card(slide, left, top, w, h)
        frame = text_box(slide, left + 0.22, top + 0.22, w - 0.44, 0.22)
        write(frame, head, size=11.5, color=TITLE, first=True)
        frame = text_box(slide, left + 0.22, top + 0.46, w - 0.44, h - 0.66)
        write(frame, body, size=9.5, color=MUTED, first=True, line_spacing=1.3)


def code_block(slide, x: float, y: float, w: float, lines_: list[str], *, size=8.5):
    height = 0.28 + len(lines_) * (size + 5) / 72
    card(slide, x, y, w, height)
    frame = text_box(slide, x + 0.18, y + 0.14, w - 0.36, height - 0.28)
    for index, text in enumerate(lines_):
        write(frame, text, size=size, color=LABEL, font=MONO, first=index == 0, line_spacing=1.25)
    return height


# --------------------------------------------------------------------------- #
# slides
# --------------------------------------------------------------------------- #
def slide_title(prs):
    slide = new_slide(prs)
    line(slide, 0.37, 0.06, 0.37, 5.31, dashed=True)
    line(slide, 9.59, 0.06, 9.59, 5.31, dashed=True)
    line(slide, 0.0, 5.33, 10.0, 5.33, dashed=True)

    frame = text_box(slide, 0.55, 1.05, 8.9, 0.7)
    write(frame, "Automated llms.txt Generator", size=40, color=TITLE, font=SANS, first=True, line_spacing=1.0)
    frame = text_box(slide, 0.58, 1.83, 8.9, 0.5)
    write(frame, "Making a site legible to answer engines", size=26, color=TITLE, first=True, line_spacing=1.0)

    frame = text_box(slide, 0.6, 2.6, 8.6, 0.3)
    write(frame, LIVE_URL, size=11, color=LABEL, font=MONO, first=True)

    frame = text_box(slide, 0.78, 4.2, 5.75, 0.3)
    write(frame, f"{CANDIDATE}  |  Profound — technical interview", size=16, color=TITLE, first=True)

    if LOGO.exists():
        slide.shapes.add_picture(str(LOGO), Inches(7.24), Inches(4.2), width=Inches(2.11))


def slide_problem(prs):
    slide = content_slide(prs, "The Problem", "AI answers are the new front page")
    card_grid(
        slide,
        [
            (
                "Discovery moved to answer engines",
                "ChatGPT and Perplexity answer the question instead of returning ten links. If the "
                "model cannot read your site, the brand is simply absent from the answer.",
            ),
            (
                "HTML is a bad format for agents",
                "Nav, cookie banners and JS shells bury the content. An agent burns its context "
                "budget before it reaches the page that mattered.",
            ),
            (
                "llms.txt is the proposed contract",
                "Like robots.txt, but curated: one markdown index of the pages an agent should read, "
                "per the llmstxt.org spec.",
            ),
            (
                "Hand-authoring does not scale",
                "Someone must pick and describe the right pages, then keep the file in sync every "
                "time docs, pricing or product pages change.",
            ),
        ],
    )


def slide_solution(prs):
    slide = content_slide(prs, "The Solution", "Paste a URL, get a maintained llms.txt")
    rows(
        slide,
        [
            (
                "Generate",
                "Crawls the site, extracts metadata, ranks and groups pages, renders llms.txt "
                "plus an optional llms-full.txt.",
            ),
            (
                "Validate",
                "Every file is re-parsed and checked against the llmstxt.org structure, in the UI "
                "next to the document.",
            ),
            (
                "Monitor",
                "A tracked site is re-crawled daily and diffed page by page; a snapshot is stored "
                "only when something changed.",
            ),
            (
                "Serve",
                "The latest file is served as text/plain at /s/{siteId}/llms.txt — one stable URL "
                "to proxy.",
            ),
        ],
        y=1.7,
        w=4.5,
        gap=0.24,
        title_size=11,
        body_size=9.5,
    )
    picture(slide, DOCS / "generate.png", 5.6, 1.66, 3.65)
    caption(
        slide,
        5.6,
        4.1,
        3.65,
        "tryprofound.com — 120 pages crawled, spec compliant",
        align=PP_ALIGN.LEFT,
    )


def slide_architecture(prs):
    slide = content_slide(prs, "Architecture", "One pipeline, seven stages")
    stages = ["URL", "Crawl", "Extract", "Classify\n& rank", "Group", "Render", "Validate"]
    subs = [
        "entry point",
        "robots + sitemap\n+ links",
        "title, meta,\ncanonical, hash",
        "kind + score",
        "sections +\nlink budget",
        "llms.txt\n(+ full)",
        "spec check",
    ]
    x, y, w, h = 0.62, 2.05, 1.18, 0.86
    gap = 0.16
    for index, (stage, sub) in enumerate(zip(stages, subs)):
        left = x + index * (w + gap)
        node(slide, left, y, w, h, stage.replace("\n", " "), sub.replace("\n", " "))
        if index:
            line(slide, left - gap, y + h / 2, left, y + h / 2, arrow=True)

    llm_x = 0.62 + 3 * (w + gap)
    node(slide, llm_x - 0.35, 3.55, 1.9, 0.6, "LLM enrichment", "optional, gpt-4o-mini")
    line(slide, llm_x + 0.6, 3.55, llm_x + 0.6, 2.91, arrow=True)
    caption(slide, llm_x - 0.35, 4.2, 1.9, "relabels pages it was given — never invents URLs")

    rows(
        slide,
        [
            (
                "Stateless by design",
                "Each stage is a pure function over serializable state, so a crawl can be paused, "
                "persisted and resumed across serverless requests.",
            ),
        ],
        x=0.62,
        y=4.62,
        w=8.6,
        title_size=11,
        body_size=9.5,
    )


def slide_crawl(prs):
    slide = content_slide(prs, "Technical Solution", "Crawl engine")
    rows(
        slide,
        [
            (
                "Slice-based, resumable crawling",
                "crawlSlice() fetches a bounded batch inside a 20s budget and returns new state, so "
                "the crawl survives serverless timeouts and shows progress instead of hanging.",
            ),
            (
                "Sitemap-first, link crawl as fallback",
                "Sitemaps give breadth cheaply; link crawling covers sites without one and supplies "
                "the nav and inbound-link signals used for ranking.",
            ),
            (
                "Polite and bounded",
                "robots.txt is honoured by default (crawl-delay capped at 2s), concurrency 6, "
                "default budget 120 pages.",
            ),
            (
                "Aggressive dropping",
                "Off-site redirects, non-HTML responses, noindex pages and out-of-scope URLs never "
                "reach the index.",
            ),
        ],
        y=1.6,
        gap=0.2,
        title_size=11,
        body_size=9.5,
    )
    code_block(
        slide,
        0.75,
        4.55,
        8.5,
        ["state = await initCrawl(url, options)",
         "while (!state.done) state = await crawlSlice(state, 20_000)  // one HTTP request each"],
    )


def slide_ranking(prs):
    slide = content_slide(prs, "Technical Solution", "Ranking & grouping")
    card(slide, 0.75, 1.62, 4.2, 3.2)
    frame = text_box(slide, 0.97, 1.84, 3.76, 0.22)
    write(frame, "scorePage() signals", size=11.5, color=TITLE, first=True)
    frame = text_box(slide, 0.97, 2.12, 3.76, 2.5)
    for index, item in enumerate(
        [
            "page kind — home 100, docs 40, api 38, legal 2",
            "depth penalty (-8 per level)",
            "inbound links (capped) + nav membership",
            "sitemap presence, markdown alternate, description",
            "content volume, with penalties for pagination and deep paths",
        ]
    ):
        write(frame, f"·  {item}", size=9.5, color=MUTED, first=index == 0, space_before=0 if index == 0 else 6)

    card(slide, 5.19, 1.62, 4.05, 3.2)
    frame = text_box(slide, 5.41, 1.84, 3.6, 0.22)
    write(frame, "groupPages() sectioning", size=11.5, color=TITLE, first=True)
    frame = text_box(slide, 5.41, 2.12, 3.6, 2.5)
    for index, item in enumerate(
        [
            "sections by page kind in a fixed order: Overview, Documentation, API Reference, Guides…",
            "link budgets — 25 per section, 120 total",
            "large Other buckets split by top-level path",
            "legal and overflow pages fall into the trailing Optional section",
            "markdown alternates preferred as link targets",
        ]
    ):
        write(frame, f"·  {item}", size=9.5, color=MUTED, first=index == 0, space_before=0 if index == 0 else 6)

    caption(
        slide,
        0.75,
        4.95,
        8.5,
        "Optional is the spec's escape hatch: an agent with a small context window can skip it.",
        align=PP_ALIGN.LEFT,
    )


def slide_validate(prs):
    slide = content_slide(prs, "Technical Solution", "Validation against the spec")
    rows(
        slide,
        [
            (
                "The renderer and the checker are separate",
                "validateLlmsTxt() re-parses the rendered text rather than trusting the builder, so "
                "the UI grades the exact bytes a consumer would download.",
            ),
            (
                "Structure the spec requires",
                "One H1, an optional blockquote summary, free-form detail blocks, then H2 sections "
                "of markdown link lists.",
            ),
            (
                "Errors vs. warnings",
                "Errors: missing or duplicate H1, content before the title, malformed link lines, "
                "H3+ headings. Warnings: duplicate URLs, missing summary or notes.",
            ),
            (
                "Reused everywhere",
                "The same function backs POST /api/validate, the generator UI and the audit's check "
                "of an existing /llms.txt.",
            ),
        ],
        y=1.7,
        gap=0.32,
    )


def slide_monitoring(prs):
    slide = content_slide(prs, "Automated Updates", "Monitoring & change detection")
    y = 1.62
    node(slide, 0.62, y, 1.55, 0.66, "Vercel cron", "daily, 03:00 UTC")
    node(slide, 2.47, y, 1.55, 0.66, "refreshSite()", "per tracked site")
    node(slide, 4.32, y, 1.55, 0.66, "Re-crawl", "same options")
    node(slide, 6.17, y, 1.55, 0.66, "diffPages()", "added/removed/changed")
    node(slide, 8.02, y, 1.4, 0.66, "snapshotHash", "sha of all pages")
    for left in (2.47, 4.32, 6.17, 8.02):
        line(slide, left - 0.3, y + 0.33, left, y + 0.33, arrow=True)

    node(slide, 5.55, 2.72, 1.75, 0.6, "hash changed", "write snapshot")
    node(slide, 7.67, 2.72, 1.75, 0.6, "hash equal", "skip write")
    line(slide, 8.7, y + 0.66, 8.7, 2.72, arrow=True)
    line(slide, 6.4, y + 0.66, 6.4, 2.72, arrow=True)
    caption(slide, 5.55, 3.4, 3.87, "GET /s/{siteId}/llms.txt always serves the latest snapshot")

    rows(
        slide,
        [
            (
                "Diffs are page-level, not file-level",
                "Each page carries a content hash, so a refresh reports exactly which URLs were "
                "added, removed or edited — and what moved in the title or description.",
            ),
            (
                "Snapshots are written only on change",
                "History stays readable and storage small; page text is dropped from stored "
                "snapshots because only llms-full.txt needs it.",
            ),
            (
                "One code path",
                "The manual Refresh button and the daily cron job both call refreshSite().",
            ),
        ],
        x=0.7,
        y=3.5,
        w=8.5,
        gap=0.1,
        title_size=10,
        body_size=8.5,
    )


def slide_monitoring_ui(prs):
    slide = content_slide(prs, "Automated Updates", "Monitoring in the UI")
    picture(slide, DOCS / "site-history.png", 0.7, 1.7, 4.3)
    caption(slide, 0.7, 4.25, 4.3, "Snapshot history: what changed, when", align=PP_ALIGN.LEFT)
    picture(slide, DOCS / "monitored-sites.png", 5.2, 1.7, 4.3)
    caption(
        slide,
        5.2,
        3.1,
        4.3,
        "Tracked sites, last check and the served file URL",
        align=PP_ALIGN.LEFT,
    )


def slide_audit(prs):
    slide = content_slide(prs, "Beyond spec #1", "AI-readiness audit")
    frame = text_box(slide, 0.7, 1.5, 8.6, 0.3)
    write(
        frame,
        "Grades a domain the way an answer engine sees it — six real bot probes, not a lint pass.",
        size=11,
        color=TITLE,
        first=True,
    )
    card_grid(
        slide,
        [
            (
                "Per-bot access",
                "GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot and Google-Extended "
                "are each evaluated against robots.txt, then fetch the entry page with their own UA.",
            ),
            (
                "Cloaking & WAF detection",
                "Body size per bot is compared with a browser-like baseline, catching challenge "
                "pages and JS stubs that a normal crawl never sees.",
            ),
            (
                "Content checks",
                "Sitemap coverage, missing descriptions, thin and duplicate pages, markdown "
                "alternates, canonical and server-rendered content.",
            ),
            (
                "Existing /llms.txt",
                "Fetched, validated and compared against the fresh crawl: stale links and pages the "
                "live file never mentions.",
            ),
        ],
        y=1.88,
        w=4.15,
        h=1.24,
        gapy=0.17,
    )
    frame = text_box(slide, 0.75, 4.62, 8.5, 0.5)
    write(
        frame,
        "Weighted score → A–F grade (A ≥ 90, F < 45). Every failing check ships a concrete fix.",
        size=10,
        color=TITLE,
        first=True,
    )
    write(
        frame,
        "Use case: shows a brand exactly why it is invisible to answer engines, and what to change first.",
        size=10,
        color=MUTED,
        space_before=4,
    )


def slide_audit_shot(prs):
    slide = content_slide(prs, "Beyond spec #1", "Audit output")
    picture(slide, DOCS / "ai-readiness.png", 2.65, 1.6, 4.7)
    caption(
        slide,
        0.7,
        5.15,
        8.6,
        "Per-bot table, weighted checks and the fix for each failure",
        align=PP_ALIGN.CENTER,
    )


def slide_eval(prs):
    slide = content_slide(prs, "Beyond spec #2", "Retrieval eval")
    frame = text_box(slide, 0.7, 1.5, 8.6, 0.3)
    write(
        frame,
        "Spec-valid is not the same as useful. This measures whether the index can actually route a question.",
        size=11,
        color=TITLE,
        first=True,
    )

    y = 2.0
    node(slide, 0.62, y, 1.8, 0.7, "Writer LLM", "sees crawled pages")
    node(slide, 2.72, y, 1.8, 0.7, "8 questions", "one per page id")
    node(slide, 4.82, y, 1.8, 0.7, "Reader LLM", "sees only llms.txt")
    node(slide, 6.92, y, 2.3, 0.7, "Accuracy + ambiguous links", "per-question verdict")
    for left in (2.72, 4.82, 6.92):
        line(slide, left - 0.3, y + 0.35, left, y + 0.35, arrow=True)

    rows(
        slide,
        [
            (
                "Ids, not URLs, cross the wire",
                "Both calls exchange numbered link ids, so a hallucinated answer fails to resolve "
                "and is rejected instead of being silently scored as correct.",
            ),
            (
                "Failures are actionable",
                "Every miss names the link that was picked and why its notes did not disambiguate — "
                "that is the description to rewrite.",
            ),
            (
                "Use case",
                "Turns 'good llms.txt' from an opinion into a number you can regression-test.",
            ),
        ],
        x=0.7,
        y=2.95,
        w=5.1,
        gap=0.16,
        title_size=10.5,
        body_size=8.5,
    )
    picture(slide, DOCS / "retrieval-eval.png", 6.05, 3.05, 3.2)


def slide_tradeoffs(prs):
    slide = content_slide(prs, "Engineering", "Technical trade-offs")
    numbered(
        slide,
        [
            (
                "Slice crawling over one long request",
                "More state to serialize and more round-trips, but the crawl never dies at the "
                "serverless timeout and progress is visible while it runs.",
            ),
            (
                "Heuristics first, LLM optional",
                "The deterministic path always produces a valid file. The model only relabels pages "
                "it was handed, so it can never invent a URL; a missing key degrades quality, "
                "not correctness.",
            ),
            (
                "Hash diffing over full re-render comparison",
                "Page-level hashes make 'nothing changed' cheap and let monitoring skip a write "
                "entirely; the cost is that formatting-only changes look identical.",
            ),
            (
                "Audit and eval opt-in, post-generation",
                "Six bot probes and two LLM calls would double generation latency for every user, "
                "so they sit behind their own endpoints and a button.",
            ),
        ],
        y=1.55,
        gap=0.2,
        head_size=12.5,
        body_size=9.5,
    )


def slide_data_model(prs):
    slide = content_slide(prs, "Persistence", "Data model")
    y = 1.75
    for index, (name, fields) in enumerate(
        [
            ("sites", "id · url · name · crawl options · monitoring · lastCheckedAt"),
            ("snapshots", "id · siteId · llmsTxt · contentHash · pages · changes · changed"),
            ("jobs", "id · crawl state · progress · result · status"),
        ]
    ):
        top = y + index * 0.86
        card(slide, 0.75, top, 5.1, 0.7)
        frame = text_box(slide, 0.97, top + 0.13, 4.7, 0.45)
        write(frame, name, size=11, color=BRIGHT, font=SANS, bold=True, first=True)
        write(frame, fields, size=8.5, color=LABEL, font=MONO, space_before=2)

    node(slide, 6.3, 1.75, 2.95, 0.75, "Neon Postgres", "DATABASE_URL, schema created on first use")
    node(slide, 6.3, 2.75, 2.95, 0.75, "In-memory store", "used when no DATABASE_URL is set")
    line(slide, 5.85, 2.1, 6.3, 2.1, arrow=True)
    line(slide, 5.85, 3.1, 6.3, 3.1, arrow=True)
    caption(slide, 6.3, 3.6, 2.95, "one Store interface, two implementations")

    rows(
        slide,
        [
            (
                "Zero-config by default",
                "No database and no API key required: state lives in memory and heuristics cover "
                "titles, sections and descriptions.",
            ),
        ],
        x=0.75,
        y=4.42,
        w=8.5,
        title_size=10.5,
        body_size=9,
    )


def slide_testing(prs):
    slide = content_slide(prs, "Quality", "Testing")
    card_grid(
        slide,
        [
            ("robots & sitemap parsing", "User-agent groups, wildcards, $ anchors, crawl-delay, sitemap indexes, gzip, CDATA and plain-text sitemaps."),
            ("extraction & URLs", "Titles, descriptions from meta/OG/Twitter/JSON-LD, canonicals, markdown alternates, content hashing, URL normalization."),
            ("classification & generation", "Page kinds and ranking order, sectioning and link budgets, and the rendered document layout."),
            ("validation, diffing & audit", "Spec errors and warnings, snapshot diffs, per-bot robots evaluation, audit scoring and grading."),
        ],
        y=1.7,
        w=4.15,
        h=1.35,
    )
    code_block(slide, 0.75, 4.65, 8.5, ["npm run test    # vitest    npm run lint    npm run typecheck    npm run build"])


def slide_next(prs):
    slide = content_slide(prs, "Roadmap", "Next steps & optimizations")
    numbered(
        slide,
        [
            (
                "Headless rendering for JS-only sites",
                "A client-rendered SPA extracts as empty; fall back to a browser on thin pages only.",
            ),
            (
                "Embeddings-based ranking and sectioning",
                "Cluster page embeddings to name sections from content instead of URL paths.",
            ),
            (
                "Incremental per-page recrawl",
                "ETag / If-Modified-Since plus per-page scheduling instead of re-crawling everything.",
            ),
            (
                "Event-driven refresh instead of a daily cron",
                "Sitemap lastmod polling or a CMS/deploy webhook: minutes behind a publish, not hours.",
            ),
            (
                "Multi-tenant dashboards",
                "Accounts, audit history and score trends — both metrics are better as a time series.",
            ),
        ],
        y=1.6,
        gap=0.22,
        head_size=12,
        body_size=9.5,
    )


def slide_close(prs):
    slide = content_slide(prs, "Thank you", "Talk is cheap. Show me the code.")
    card(slide, 0.75, 1.9, 8.5, 1.5)
    frame = text_box(slide, 0.75, 1.9, 8.5, 1.5, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    write(frame, "Live app", size=10, color=MUTED, first=True, align=PP_ALIGN.CENTER)
    write(frame, LIVE_URL, size=20, color=BRIGHT, font=MONO, space_before=6, align=PP_ALIGN.CENTER)
    write(
        frame,
        "Paste any URL — try tryprofound.com, then run the audit and the retrieval eval.",
        size=10,
        color=MUTED,
        space_before=8,
        align=PP_ALIGN.CENTER,
    )
    frame = text_box(slide, 0.75, 3.7, 8.5, 0.6, align=PP_ALIGN.CENTER)
    write(frame, f"{CANDIDATE} — Profound technical interview", size=11, color=TITLE, first=True, align=PP_ALIGN.CENTER)


def build() -> Path:
    prs = Presentation()
    prs.slide_width = Inches(10)
    prs.slide_height = Inches(5.625)

    slide_title(prs)
    slide_problem(prs)
    slide_solution(prs)
    slide_architecture(prs)
    slide_crawl(prs)
    slide_ranking(prs)
    slide_validate(prs)
    slide_monitoring(prs)
    slide_monitoring_ui(prs)
    slide_audit(prs)
    slide_audit_shot(prs)
    slide_eval(prs)
    slide_tradeoffs(prs)
    slide_data_model(prs)
    slide_testing(prs)
    slide_next(prs)
    slide_close(prs)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    prs.save(OUT)
    return OUT


if __name__ == "__main__":
    print(f"wrote {build().relative_to(ROOT)}")
