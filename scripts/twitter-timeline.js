// 只处理已知的信息流容器，避免进入推文正文、引用或账号对象泛删字段。
// Process known timeline containers only, without traversing tweets, quotes or accounts.
const requestPattern = /^https?:\/\/(?:api\.)?(?:twitter|x)\.com\/(?:i\/api\/)?graphql\/[A-Za-z0-9_-]+\/(HomeTimeline|HomeLatestTimeline|TweetDetail|SearchTimeline|UserTweets|UserTweetsAndReplies|UserMedia|ListLatestTweetsTimeline)(?:\?.*)?$/;
let output = {};

/**
 * 检查条目自身的推广标记；不检查引用内容。
 * Inspect promotion markers belonging to the placement, not its quoted content.
 * @param {object} node 信息流条目或模块子项 / Timeline entry or module item.
 * @returns {boolean} 是否明确标成推广 / Whether explicitly marked as promoted.
 */
function isPromoted(node) {
  if (!node || typeof node !== "object") return false;
  if (typeof node.entryId === "string" && /^promoted-(?:tweet|user|trend)-/.test(node.entryId)) return true;
  const placements = [node, node.content, node.content?.itemContent, node.item, node.item?.itemContent, node.itemContent];
  return placements.some(placement => [placement?.promotedMetadata, placement?.promoted_metadata].some(
    value => value !== null && typeof value === "object" && !Array.isArray(value)
  ));
}

/**
 * 过滤一条信息流指令集合，保留普通条目与分页指令。
 * Filter a timeline instruction set while preserving organic entries and pagination.
 * @param {Array} instructions 已知信息流容器中的指令 / Instructions in a known container.
 * @param {object} stats 本次响应的移除计数 / Removal count for this response.
 * @returns {Array} 过滤后的指令 / Filtered instructions.
 */
function filterInstructions(instructions, stats) {
  const result = [];
  for (const instruction of instructions) {
    if (!instruction || typeof instruction !== "object") {
      result.push(instruction);
      continue;
    }
    if (instruction.type === "TimelineAddEntries" && Array.isArray(instruction.entries)) {
      instruction.entries = instruction.entries.filter(entry => {
        if (isPromoted(entry)) {
          stats.removed++;
          return false;
        }
        const content = entry?.content;
        if ((content?.entryType === "TimelineTimelineModule" || content?.__typename === "TimelineTimelineModule") && Array.isArray(content.items)) {
          const items = content.items.filter(item => {
            if (!isPromoted(item)) return true;
            stats.removed++;
            return false;
          });
          if (items.length !== content.items.length) {
            content.items = items;
            if (items.length === 0) return false;
          }
        }
        return true;
      });
    } else if ((instruction.type === "TimelineReplaceEntry" || instruction.type === "TimelinePinEntry") && isPromoted(instruction.entry)) {
      stats.removed++;
      continue;
    } else if (instruction.type === "TimelineAddToModule" && Array.isArray(instruction.moduleItems)) {
      const items = instruction.moduleItems.filter(item => {
        if (!isPromoted(item)) return true;
        stats.removed++;
        return false;
      });
      if (items.length !== instruction.moduleItems.length) {
        instruction.moduleItems = items;
        if (items.length === 0) continue;
      }
    }
    result.push(instruction);
  }
  return result;
}

try {
  const match = requestPattern.exec($request.url);
  const contentType = Object.entries($response.headers || {}).find(([key]) => key.toLowerCase() === "content-type");
  if (match && $response.status >= 200 && $response.status < 300 &&
    typeof $response.body === "string" && contentType &&
    /^(?:application|text)\/(?:[\w.-]+\+)?json(?:\s*;|$)/i.test(contentType[1])) {
    const body = JSON.parse($response.body);
    if (body && typeof body === "object" && !Array.isArray(body) && !body.errors) {
      const data = body.data;
      let containers = [];
      switch (match[1]) {
        case "HomeTimeline":
        case "HomeLatestTimeline":
          containers = [data?.home?.home_timeline_urt];
          break;
        case "TweetDetail":
          containers = [data?.threaded_conversation_with_injections_v2];
          break;
        case "SearchTimeline":
          containers = [data?.search_by_raw_query?.search_timeline?.timeline];
          break;
        case "UserTweets":
        case "UserTweetsAndReplies":
        case "UserMedia":
          containers = [data?.user?.result?.timeline_v2?.timeline, data?.user?.result?.timeline?.timeline];
          break;
        case "ListLatestTweetsTimeline":
          containers = [data?.list?.tweets_timeline?.timeline];
          break;
      }
      const stats = { removed: 0 };
      for (const container of containers) {
        if (Array.isArray(container?.instructions)) {
          container.instructions = filterInstructions(container.instructions, stats);
        }
      }
      if (stats.removed > 0) {
        output = { body: JSON.stringify(body) };
      }
    }
  }
} catch {
  // 解析或结构异常时保留整个原始响应；不记录 URL、Cookie 或内容。
  // Preserve the entire original response on errors; never log URLs, cookies or content.
  output = {};
}
$done(output);
