const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/twitter-timeline.js"), "utf8");

function loadPlugin() {
  const text = fs.readFileSync(path.join(root, "Twitter-AdBlock.plugin"), "utf8");
  const sections = {};
  for (const key of ["name", "desc", "author", "homepage"]) {
    assert.ok(text.split("\n").some(line => line.startsWith(`#!${key}=`)));
  }
  let section;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("[")) {
      assert.ok(["[Rewrite]", "[Script]", "[MITM]"].includes(line));
      assert.ok(!sections[line]);
      section = line;
      sections[section] = [];
    } else {
      assert.ok(section);
      sections[section].push(line);
    }
  }
  assert.equal(sections["[Rewrite]"].length, 1);
  assert.equal(sections["[Script]"].length, 1);
  const [tracking, action] = sections["[Rewrite]"][0].split(/\s+/);
  assert.equal(action, "reject-dict");
  const [type, timeline, options] = sections["[Script]"][0].split(/\s+/);
  assert.equal(type, "http-response");
  assert.equal(options, "requires-body=true,script-path=https://raw.githubusercontent.com/shuzhiweb/loon-ad-bilibili/main/scripts/twitter-timeline.js,timeout=10,tag=X推广信息流过滤");
  assert.deepEqual(sections["[MITM]"], [
    "hostname = ads-api.twitter.com, api.twitter.com, api.x.com, twitter.com, x.com", "h2 = true",
  ]);
  return { tracking: new RegExp(tracking), timeline: new RegExp(timeline) };
}

function runScript(url, body, overrides = {}) {
  const calls = [];
  vm.runInNewContext(source, {
    $request: { url },
    $response: { status: 200, headers: { "Content-Type": "application/json" }, body, ...overrides },
    $done: value => calls.push(value),
  }, { timeout: 1000 });
  assert.equal(calls.length, 1);
  return JSON.parse(JSON.stringify(calls[0]));
}

function replayHar(harPath, config) {
  const har = JSON.parse(fs.readFileSync(harPath, "utf8").replace(/^\uFEFF/, ""));
  const counts = {
    entries: har.log.entries.length, trackingMatched: 0, timelineMatched: 0,
    timelineModified: 0, missingTimelineBodies: 0, unchanged: 0,
    mediaHostUnmatched: 0, staticHostUnmatched: 0,
  };
  for (const entry of har.log.entries) {
    const url = entry.request.url;
    const host = new URL(url).hostname;
    const tracking = config.tracking.test(url);
    const timeline = config.timeline.test(url);
    assert.ok(!((host === "video.twimg.com" || host === "abs.twimg.com") && (tracking || timeline)));
    counts.trackingMatched += Number(tracking);
    counts.timelineMatched += Number(timeline);
    if (timeline) {
      const content = entry.response.content || {};
      if (!content.text) counts.missingTimelineBodies++;
      const body = content.encoding === "base64" ? Buffer.from(content.text || "", "base64").toString("utf8") : content.text;
      const headers = Object.fromEntries((entry.response.headers || []).map(item => [item.name, item.value]));
      const result = runScript(url, body, { status: entry.response.status, headers });
      counts.timelineModified += Number(typeof result.body === "string");
    }
    if (!tracking && !timeline) {
      counts.unchanged++;
      counts.mediaHostUnmatched += Number(host === "video.twimg.com");
      counts.staticHostUnmatched += Number(host === "abs.twimg.com");
    }
  }
  return counts;
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    assert.ok(args.length === 0 || (args.length === 2 && args[0] === "--har"));
    const config = loadPlugin();
    const result = { plugin: "valid" };
    if (args[1]) result.har = replayHar(args[1], config);
    console.log(JSON.stringify(result, null, 2));
  } catch {
    // 不输出解析异常详情，异常文本可能包含私有抓包片段。
    // Omit exception details, which may contain private capture fragments.
    console.error("Validation failed; inspect input locally. Usage: node tools/validate-twitter.js [--har /path/to/private.har]");
    process.exitCode = 1;
  }
}

module.exports = { loadPlugin, runScript, replayHar };
