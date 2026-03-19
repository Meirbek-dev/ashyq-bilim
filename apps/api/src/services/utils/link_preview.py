from urllib.parse import urljoin, urlparse

import httpx
from selectolax.lexbor import LexborHTMLParser, LexborNode


async def fetch_link_preview(url: str) -> dict[str, str | None]:
    async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:
        response = await client.get(url)
        response.raise_for_status()
        html = response.text

    tree = LexborHTMLParser(html)

    def get_meta(property_name: str, attr: str = "property") -> str | None:
        node = tree.css_first(f'meta[{attr}="{property_name}"]')
        return node.attributes.get("content") if node else None

    # Title
    title_node = tree.css_first("title")
    title = title_node.text(strip=True) if title_node else None

    # Description
    description = get_meta("og:description") or get_meta("description", "name")

    # OG Image
    og_image = get_meta("og:image")
    if og_image and not og_image.startswith("http"):
        og_image = urljoin(url, og_image)

    # Favicon (robust)
    favicon: str | None = None
    icon_rels = {
        "icon",
        "shortcut icon",
        "apple-touch-icon",
        "apple-touch-icon-precomposed",
    }
    for node in tree.css("link[rel]"):
        rel = node.attributes.get("rel", "")
        href = node.attributes.get("href", "")
        if rel and href and rel.lower() in icon_rels:
            favicon = href
            break

    # Fallback to /favicon.ico
    if not favicon:
        parsed = urlparse(url)
        favicon = f"{parsed.scheme}://{parsed.netloc}/favicon.ico"
    elif not favicon.startswith("http"):
        favicon = urljoin(url, favicon)

    # OG meta
    og_title = get_meta("og:title")
    og_type = get_meta("og:type")
    og_url = get_meta("og:url")

    return {
        "title": og_title or title,
        "description": description,
        "og_image": og_image,
        "favicon": favicon,
        "og_type": og_type,
        "og_url": og_url or url,
        "url": url,
    }
