"""Validate the Loon plugin and replay a private HAR without exposing its contents."""

import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit


PLUGIN = Path(__file__).resolve().parents[1] / "Bilibili-AdBlock.plugin"
EXPECTED_HOSTS = {"df.tanx.com", "ef-dongfeng.tanx.com"}


def load_rules():
    text = PLUGIN.read_text(encoding="utf-8")
    for key in ("name", "desc", "author", "homepage"):
        if not any(line.startswith(f"#!{key}=") for line in text.splitlines()):
            raise ValueError(f"Missing plugin metadata: {key}")
    hosts = set()
    section = None
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("["):
            if line != "[Rule]" or section is not None:
                raise ValueError("Expected a single [Rule] section")
            section = line
            continue
        if section != "[Rule]":
            raise ValueError("Rule outside [Rule]")
        parts = [part.strip() for part in line.split(",")]
        if len(parts) != 3 or parts[0] != "DOMAIN" or parts[2] != "REJECT":
            raise ValueError("Expected DOMAIN,host,REJECT")
        if parts[1] in hosts:
            raise ValueError("Duplicate rule")
        hosts.add(parts[1])
    if hosts != EXPECTED_HOSTS:
        raise ValueError("Unexpected blocking scope; review domain changes")
    return hosts


def replay(har_path, hosts):
    entries = json.loads(har_path.read_text(encoding="utf-8-sig"))["log"]["entries"]
    counts = {"entries": len(entries), "matched": 0, "unmatched": 0,
              "media_unmatched": 0, "httpdns_unmatched": 0}
    for entry in entries:
        # Parse in memory only; never log raw requests or sensitive URL values.
        hostname = (urlsplit(entry["request"]["url"]).hostname or "").lower()
        mime = entry.get("response", {}).get("content", {}).get("mimeType", "")
        is_media = mime.split(";", 1)[0].strip().lower() in {
            "application/vnd.apple.mpegurl", "application/x-mpegurl",
            "video/iso.segment", "video/x-flv", "application/octet-stream",
        } or mime.lower().startswith(("video/", "audio/"))
        is_dns = hostname == "httpdns.bilivideo.com"
        matched = hostname in hosts
        if matched and (is_media or is_dns):
            raise ValueError("Plugin matches a media or HTTPDNS request")
        counts["matched" if matched else "unmatched"] += 1
        if not matched:
            counts["media_unmatched"] += int(is_media)
            counts["httpdns_unmatched"] += int(is_dns)
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--har", type=Path)
    args = parser.parse_args()
    try:
        hosts = load_rules()
        # Negative controls prevent domain expansion to CDN or unrelated hosts.
        controls = (
            "https://httpdns.bilivideo.com/resolve",
            "https://example.bilivideo.com/live-bvc/example/index.m3u8",
            "https://app.bilibili.com/x/v2/feed/index",
            "https://df.tanx.com.example.org/spf3",
            "https://other.tanx.com/tanx",
        )
        if any(urlsplit(url).hostname in hosts for url in controls):
            raise ValueError("A negative control was blocked")
        result = {"plugin": "valid", "exact_domain_rules": len(hosts)}
        if args.har:
            result["har"] = replay(args.har, hosts)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (OSError, ValueError, KeyError, TypeError) as error:
        # Parser/IO exception messages can contain private input, so redact them.
        parser.exit(1, f"Validation failed ({type(error).__name__}); inspect locally.\n")


if __name__ == "__main__":
    main()
