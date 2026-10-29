"""Offline HTML scope selection and safe feed discovery."""

from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup

from .contracts import ExtractionError
from .safety import decode_text, safe_xml


def link(href, text, headings, relation="page", mime=None):
    result = {"href": href, "text": text, "headingPath": list(headings), "relation": relation}
    if mime:
        result["mimeHint"] = mime
    return result


def html_content(data, request):
    soup = BeautifulSoup(decode_text(data, request.mime, html=True), "html.parser")
    links, issues = [], []
    for tag in soup.select('link[rel~="canonical"][href]'):
        links.append(link(urljoin(request.sourceUrl, tag["href"]), "", [], "canonical"))
    for tag in soup.select('link[rel~="alternate"][href]'):
        if tag.get("type") in {"application/rss+xml", "application/atom+xml"}:
            links.append(link(urljoin(request.sourceUrl, tag["href"]), tag.get("title", ""), [], "feed", tag["type"]))
    selectors = request.html.contentSelectors if request.html else []
    if selectors:
        selected = []
        for selector in selectors:
            selected.extend(soup.select(selector))
        if not selected:
            raise ExtractionError("html-content-selector-unmatched", "review-required")
        selected = [tag for i, tag in enumerate(selected) if tag not in selected[:i] and not any(parent in selected for parent in tag.parents)]
        content = BeautifulSoup("<html><body>" + "\n".join(str(x) for x in selected) + "</body></html>", "html.parser")
    else:
        mains = soup.find_all("main")
        # Multiple article cards are all source content/discovery. Selecting
        # only the first article would silently lose the rest of a listing.
        scope = mains[0] if len(mains) == 1 else soup.body or soup
        content = BeautifulSoup(str(scope), "html.parser")
    for tag in content.select("script,style,nav,[role=navigation],template"):
        tag.decompose()
    headings = []
    seen = set()
    for tag in content.find_all(True):
        if tag.name in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            headings = headings[:int(tag.name[1])-1] + [tag.get_text(" ", strip=True)]
        if tag.name == "a" and tag.get("href"):
            href = urljoin(request.sourceUrl, tag["href"])
            if urlsplit(href).scheme in {"http", "https"} and href not in seen:
                seen.add(href)
                extension = urlsplit(href).path.lower().rsplit(".", 1)[-1]
                relation = "document" if extension in {"pdf", "docx", "doc", "xlsx", "xls", "pptx", "ppt", "odt", "ods", "odp", "csv", "rtf", "txt"} else "page"
                links.append(link(href, tag.get_text(" ", strip=True), headings, relation, tag.get("type")))
        if tag.name in {"iframe", "object", "embed", "canvas", "svg"}:
            issues.append("unrepresented-embedded-content")
    for image in content.find_all("img"):
        issues.append("unrepresented-image")
        image.attrs = {"alt": image.get("alt", "")}
    # Backends receive UTF-8 regardless of the origin encoding.
    for meta in content.select("meta[charset],meta[http-equiv]"):
        meta.decompose()
    return str(content).encode("utf-8"), links, sorted(set(issues))


def feed_links(data, request):
    root = safe_xml(data)
    items = [e for e in root.iter() if e.tag.rsplit("}", 1)[-1] in {"item", "entry"}]
    links, seen = [], set()
    for item in items:
        title, href = "", ""
        for child in item:
            kind = child.tag.rsplit("}", 1)[-1]
            if kind == "title":
                title = "".join(child.itertext())
            if kind == "link" and child.attrib.get("rel", "alternate") == "alternate":
                href = child.attrib.get("href") or child.text or ""
        if href:
            href = urljoin(request.sourceUrl, href.strip())
            if urlsplit(href).scheme in {"http", "https"} and href not in seen:
                seen.add(href)
                links.append(link(href, title, [], "page"))
    if items and not links:
        raise ExtractionError("feed-has-no-supported-links", "review-required")
    return links
