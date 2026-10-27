const assert = require("node:assert/strict");
const test = require("node:test");
const { loadPlugin, runScript } = require("./validate-twitter.js");

const config = loadPlugin();
const baseURL = "https://api.twitter.com/graphql/synthetic_query/HomeTimeline";
const organic = { entryId: "tweet-organic", sortIndex: "9876543210987654321", content: { entryType: "TimelineTimelineItem", itemContent: { tweet_results: { result: { legacy: { full_text: "Discuss promotedMetadata and ads", id_str: "9876543210987654321" } } } } } };
const cursor = { entryId: "cursor-bottom", sortIndex: "1", content: { entryType: "TimelineTimelineCursor", cursorType: "Bottom", value: "synthetic-next-page" } };
const promoted = { entryId: "tweet-sponsored", content: { itemContent: { promotedMetadata: { advertiser: "synthetic" } } } };
const termination = { type: "TimelineTerminateTimeline", direction: "Bottom" };
const instructions = [{ type: "TimelineAddEntries", entries: [organic, promoted, cursor] }, termination];

function wrap(operation, items = instructions) {
  const timeline = { instructions: items };
  switch (operation) {
    case "HomeTimeline": case "HomeLatestTimeline":
      return { data: { home: { home_timeline_urt: timeline } } };
    case "TweetDetail":
      return { data: { threaded_conversation_with_injections_v2: timeline } };
    case "SearchTimeline":
      return { data: { search_by_raw_query: { search_timeline: { timeline } } } };
    case "UserTweets": case "UserTweetsAndReplies": case "UserMedia":
      return { data: { user: { result: { timeline_v2: { timeline } } } } };
    case "ListLatestTweetsTimeline":
      return { data: { list: { tweets_timeline: { timeline } } } };
    default: throw new Error("unknown synthetic operation");
  }
}

test("all selected operations filter promotion while preserving organic tweets and cursor values", () => {
  for (const operation of ["HomeTimeline", "HomeLatestTimeline", "TweetDetail", "SearchTimeline", "UserTweets", "UserTweetsAndReplies", "UserMedia", "ListLatestTweetsTimeline"]) {
    for (const host of ["api.twitter.com", "twitter.com", "api.x.com", "x.com"]) {
      for (const prefix of ["/graphql/", "/i/api/graphql/"]) {
        const url = `https://${host}${prefix}synthetic_query/${operation}?variables=synthetic`;
        assert.ok(config.timeline.test(url));
        assert.deepEqual(JSON.parse(runScript(url, JSON.stringify(wrap(operation))).body), wrap(operation, [{ type: "TimelineAddEntries", entries: [organic, cursor] }, termination]));
      }
    }
  }
});

test("module promotion removal retains ordinary children and module metadata", () => {
  for (const entryTypeKey of ["entryType", "__typename"]) {
    const normal = { entryId: "tweet-module-organic", item: { itemContent: { tweet_results: { result: { rest_id: "synthetic" } } } } };
    const ad = { entryId: "tweet-module-ad", item: { itemContent: { promoted_metadata: { synthetic: true } } } };
    const module = { entryId: "conversation-synthetic", content: { [entryTypeKey]: "TimelineTimelineModule", items: [ad, normal], displayType: "Vertical" } };
    const body = wrap("HomeTimeline", [{ type: "TimelineAddEntries", entries: [module, cursor] }]);
    const result = JSON.parse(runScript(baseURL, JSON.stringify(body)).body);
    const entries = result.data.home.home_timeline_urt.instructions[0].entries;
    assert.deepEqual(entries, [{ ...module, content: { ...module.content, items: [normal] } }, cursor]);
  }
});

test("all-ad modules disappear but originally empty modules remain", () => {
  const allAd = { entryId: "module-ad", content: { entryType: "TimelineTimelineModule", items: [{ item: { itemContent: { promotedMetadata: {} } } }] } };
  const empty = { entryId: "module-empty", content: { entryType: "TimelineTimelineModule", items: [] } };
  const body = wrap("HomeTimeline", [{ type: "TimelineAddEntries", entries: [allAd, empty, cursor] }]);
  const result = JSON.parse(runScript(baseURL, JSON.stringify(body)).body);
  assert.deepEqual(result.data.home.home_timeline_urt.instructions[0].entries, [empty, cursor]);
});

test("replacement, pinned and incremental module instructions are filtered without removing cursors", () => {
  const moduleOrganic = { item: { itemContent: { text: "ordinary" } } };
  const moduleAd = { item: { itemContent: { promotedMetadata: {} } } };
  const items = [
    { type: "TimelineReplaceEntry", entry: promoted },
    { type: "TimelinePinEntry", entry: promoted },
    { type: "TimelineReplaceEntry", entry: cursor },
    { type: "TimelineAddToModule", moduleEntryId: "synthetic", moduleItems: [moduleAd, moduleOrganic] },
    { type: "TimelineAddToModule", moduleEntryId: "empty-ad", moduleItems: [moduleAd] }, termination,
  ];
  const result = JSON.parse(runScript(baseURL, JSON.stringify(wrap("HomeTimeline", items))).body);
  assert.deepEqual(result.data.home.home_timeline_urt.instructions, [items[2], { ...items[3], moduleItems: [moduleOrganic] }, termination]);
});

test("explicit promoted entry IDs and placement metadata are recognized", () => {
  const ads = ["tweet", "user", "trend"].map(type => ({ entryId: `promoted-${type}-synthetic` }));
  for (const data of [{ promotedMetadata: {} }, { promoted_metadata: {} }, { content: { promotedMetadata: {} } }, { itemContent: { promotedMetadata: {} } }]) ads.push({ entryId: "synthetic", ...data });
  const result = JSON.parse(runScript(baseURL, JSON.stringify(wrap("HomeTimeline", [{ type: "TimelineAddEntries", entries: [organic, ...ads, cursor] }]))).body);
  assert.deepEqual(result.data.home.home_timeline_urt.instructions[0].entries, [organic, cursor]);
});

test("ordinary tweet content, quoted promotion and unrelated metadata are preserved", () => {
  const quote = { entryId: "tweet-quote", content: { itemContent: { tweet_results: { result: { quoted_status_result: { result: { promotedMetadata: {} } }, legacy: { full_text: "promoted-tweet-example" } } } } } };
  const ordinaryItems = [organic, quote, { entryId: "tweet-promoted-substring", content: { itemContent: { promotedMetadata: null, promoted_metadata: false } } }, cursor];
  const original = JSON.stringify(wrap("HomeTimeline", [{ type: "TimelineAddEntries", entries: ordinaryItems }]), null, 2);
  assert.deepEqual(runScript(baseURL, original), {});
});

test("unknown containers or instruction types are unchanged", () => {
  for (const body of [
    { data: { unknown_timeline: { instructions } } },
    wrap("HomeTimeline", [{ type: "FutureInstruction", entries: [promoted] }]),
    { data: { home: { home_timeline_urt: { instructions: {} } } } },
  ]) assert.deepEqual(runScript(baseURL, JSON.stringify(body)), {});
});

test("legacy user timeline wrapper is recognized", () => {
  const original = { data: { user: { result: { timeline: { timeline: { instructions } } } } } };
  const result = JSON.parse(runScript("https://api.x.com/graphql/new_query/UserTweets", JSON.stringify(original)).body);
  assert.deepEqual(result.data.user.result.timeline.timeline.instructions[0].entries, [organic, cursor]);
});

test("account, Grok, media and lookalike endpoints do not match either rule", () => {
  for (const url of [
    "https://api.twitter.com/1.1/account/settings.json",
    "https://twitter.com/i/api/1.1/flow/timeline.json",
    "https://twitter.com/i/api/graphql/synthetic_query/grokAccountJwtQuery",
    "https://twitter.com/i/api/graphql/synthetic_query/DataSaverMode",
    "https://twitter.com/account/authenticate_web_view",
    "https://grok.com/commerce.prepurchase.v1.PrePurchaseService/CreateCheckoutSession",
    "https://video.twimg.com/amplify_video/synthetic/pl/video.m3u8",
    "https://abs.twimg.com/responsive-web/client-web/main.js",
    "https://api.twitter.com.example.org/graphql/synthetic_query/HomeTimeline",
    "https://api.twitter.com/graphql/synthetic_query/HomeTimelineExtra",
    "https://api.twitter.com/graphql/synthetic_query/HomeTimeline/other",
  ]) {
    assert.equal(config.timeline.test(url), false);
    assert.equal(config.tracking.test(url), false);
    assert.deepEqual(runScript(url, JSON.stringify(wrap("HomeTimeline"))), {});
  }
});

test("tracking rewrite is limited to the captured measurement path", () => {
  assert.ok(config.tracking.test("https://ads-api.twitter.com/12/measurement/dcm_local_id"));
  assert.ok(config.tracking.test("https://ads-api.twitter.com/12/measurement/dcm_local_id?synthetic=1"));
  for (const url of ["https://ads-api.twitter.com/12/measurement/other", "https://ads-api.twitter.com/12/measurement/dcm_local_id_extra", "https://ads-api.twitter.com/13/measurement/dcm_local_id", "https://ads-api.twitter.com.example.org/12/measurement/dcm_local_id"]) assert.equal(config.tracking.test(url), false);
});

test("HTTP, GraphQL and parsing errors are unchanged", () => {
  for (const status of [0, 204, 301, 400, 401, 403, 500]) assert.deepEqual(runScript(baseURL, status === 204 ? "" : JSON.stringify(wrap("HomeTimeline")), { status }), {});
  assert.deepEqual(runScript(baseURL, JSON.stringify({ ...wrap("HomeTimeline"), errors: [{ message: "synthetic" }] })), {});
  for (const body of ["{", "null", "[]", "0", "", "<html>error</html>"]) assert.deepEqual(runScript(baseURL, body), {});
  assert.deepEqual(runScript(baseURL, undefined), {});
});

test("non-JSON responses are not modified; header name and JSON mime case are ignored", () => {
  const body = JSON.stringify(wrap("HomeTimeline"));
  assert.ok(runScript(baseURL, body, { headers: { "cOnTeNt-TyPe": "Application/JSON; charset=utf-8" } }).body);
  for (const type of ["text/html", "application/grpc", "application/octet-stream", "application/jsonp", "application/not-json"]) assert.deepEqual(runScript(baseURL, body, { headers: { "Content-Type": type } }), {});
  assert.deepEqual(runScript(baseURL, body, { headers: {} }), {});
});

test("filtering is idempotent", () => {
  const first = runScript(baseURL, JSON.stringify(wrap("HomeTimeline")));
  assert.ok(first.body);
  assert.deepEqual(runScript(baseURL, first.body), {});
});
