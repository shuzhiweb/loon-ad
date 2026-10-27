// 仅按已知开屏结构处理；未知响应原样放行，不输出 URL 或响应内容。
// Limit changes to known splash schemas; pass unknown responses through without logging.
let result = {};
try {
  // 使用脚本引擎自带的正则，避免依赖浏览器 URL API。
  // Use native regular expressions without relying on a browser URL API.
  const matches = /^https?:\/\/(app\.bilibili\.com|app\.biliapi\.net|app\.biliapi\.com)\/x\/v2\/splash\/(show|list|brand\/list|event\/list2)(?:\?.*)?$/.test($request.url);
  const type = Object.entries($response.headers || {}).find(
    ([key]) => key.toLowerCase() === "content-type"
  );
  if (
    matches &&
    $response.status >= 200 && $response.status < 300 &&
    type && /^(?:application|text)\/(?:[\w.-]+\+)?json(?:\s*;|$)/i.test(type[1]) &&
    typeof $response.body === "string"
  ) {
    const body = JSON.parse($response.body);
    if (body && body.code === 0 && body.data && typeof body.data === "object" && !Array.isArray(body.data)) {
      let changed = false;
      for (const key of ["account", "event_list", "preload", "show"]) {
        if (Object.prototype.hasOwnProperty.call(body.data, key)) {
          delete body.data[key];
          changed = true;
        }
      }
      if (changed) result = { body: JSON.stringify(body) };
    }
  }
} catch {
  result = {};
}
$done(result);
