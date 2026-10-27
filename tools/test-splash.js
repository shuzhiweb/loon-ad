const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/bilibili-splash.js"), "utf8");
const plugin = fs.readFileSync(path.join(root, "Bilibili-AdBlock.plugin"), "utf8");
const pattern = new RegExp(plugin.split("\n").find(line => line.startsWith("http-response ")).split(" ")[1]);
const baseURL = "https://app.bilibili.com/x/v2/splash/list";
const fixture = {
  code: 0, message: "0", ttl: 1,
  data: {
    account: { synthetic: true }, event_list: [{ synthetic: true }],
    preload: [{ synthetic: true }], show: [{ synthetic: true }],
    untouched: { value: 123 },
  },
};

function run(url = baseURL, body = JSON.stringify(fixture), overrides = {}) {
  const calls = [];
  vm.runInNewContext(source, {
    $request: { url },
    $response: { status: 200, headers: { "Content-Type": "application/json" }, body, ...overrides },
    $done: value => calls.push(value),
  }, { timeout: 1000 });
  assert.equal(calls.length, 1, "complete the response exactly once");
  return JSON.parse(JSON.stringify(calls[0]));
}

for (const host of ["app.bilibili.com", "app.biliapi.net", "app.biliapi.com"]) {
  for (const endpoint of ["show", "list", "brand/list", "event/list2"]) {
    test(`filter known splash response: ${host}/${endpoint}`, () => {
      const url = `https://${host}/x/v2/splash/${endpoint}?synthetic=true`;
      assert.ok(pattern.test(url));
      assert.deepEqual(JSON.parse(run(url).body), {
        code: 0, message: "0", ttl: 1, data: { untouched: { value: 123 } },
      });
    });
  }
}

test("unrelated endpoints and lookalike domains pass through", () => {
  for (const url of [
    "https://app.bilibili.com/x/v2/feed/index",
    "https://app.bilibili.com/x/v2/splash/list/unknown",
    "https://app.bilibili.com/x/v2/splash/list2",
    "https://app.bilibili.com.example.org/x/v2/splash/list",
    "https://example.bilivideo.com/live-bvc/example/index.m3u8",
    "https://httpdns.bilivideo.com/resolve",
  ]) {
    assert.equal(pattern.test(url), false);
    assert.deepEqual(run(url), {});
  }
});

test("malformed JSON and unknown schemas remain byte-for-byte unchanged", () => {
  for (const body of ["<html>error</html>", "{", "null", "[]", "0", "",
    '{"code":0,"data":null}', '{"code":0,"data":[]}',
    '{ "code":0, "data": {"unknown":[1]} }', '{"code":0,"data":{"list":[1]}}']) {
    assert.deepEqual(run(baseURL, body), {});
  }
});

test("HTTP and API error responses pass through", () => {
  for (const status of [204, 301, 400, 403, 500]) {
    const body = status === 204 ? "" : JSON.stringify(fixture);
    assert.deepEqual(run(baseURL, body, { status }), {});
  }
  assert.deepEqual(run(baseURL, JSON.stringify({ ...fixture, code: -101 })), {});
});

test("content type is case insensitive and non-JSON is unchanged", () => {
  assert.ok(run(baseURL, JSON.stringify(fixture), { headers: { "cOnTeNt-TyPe": "Application/JSON; charset=utf-8" } }).body);
  for (const type of ["text/html", "application/grpc", "image/gif", "application/not-json", "application/jsonp"]) {
    assert.deepEqual(run(baseURL, JSON.stringify(fixture), { headers: { "Content-Type": type } }), {});
  }
  assert.deepEqual(run(baseURL, JSON.stringify(fixture), { headers: {} }), {});
  assert.deepEqual(run(baseURL, undefined, { body: undefined }), {});
});

test("filter is idempotent and does not change unrelated ad-named fields", () => {
  const body = JSON.stringify({ ...fixture, data: { ...fixture.data, ad: "preserve", nested: { show: "preserve" } } });
  const first = run(baseURL, body);
  assert.ok(first.body);
  const parsed = JSON.parse(first.body);
  assert.equal(parsed.data.ad, "preserve");
  assert.equal(parsed.data.nested.show, "preserve");
  assert.deepEqual(run(baseURL, first.body), {});
});
