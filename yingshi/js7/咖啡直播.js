// @name 咖啡影视
// @author OmniBox
// @description 体育赛事录像回放（直接使用 league=NBA）
// @version 1.0.3
// @dependencies: axios

const axios = require("axios");
const OmniBox = require("omnibox_sdk");

const config = {
    host: "https://kafeizhibo.com",
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://kafeizhibo.com/pc/replay"
    }
};

const log = (msg) => OmniBox.log("info", `[咖啡影视] ${msg}`);
const logError = (msg) => OmniBox.log("error", `[咖啡影视] ${msg}`);

function normalizeUrl(path) {
    if (!path) return "";
    if (path.startsWith("http")) return path;
    if (path.startsWith("//")) return "https:" + path;
    return config.host + (path.startsWith("/") ? "" : "/") + path;
}

const CATEGORIES = [
    { type_id: "all", type_name: "全部" },
    { type_id: "1", type_name: "足球" },
    { type_id: "2", type_name: "篮球" },
    { type_id: "nba", type_name: "NBA" }
];

// ========== 通用请求函数 ==========
async function fetchRecordings(page = 1, size = 30, league = null, type = null) {
    let params = { page, size };
    if (league) {
        params.league = league;
    } else if (type && type !== "all" && type !== "nba") {
        params.type = type;
    }
    
    const res = await axios.get("https://kafeizhibo.com/api/v1/recordings", {
        headers: config.headers,
        params
    });
    return res.data;
}

// ========== 列表解析 ==========
function parseVideoList(items, showScore = true) {
    return items.map(item => {
        const title = `${item.home_team} vs ${item.away_team} (${item.league_name})`;
        const score = `${item.home_score} - ${item.away_score}`;
        let pic = item.cover_image;
        if (pic && !pic.startsWith("http")) pic = normalizeUrl(pic);
        if (!pic || pic.includes("default_cover")) pic = item.home_team_logo || "";
        
        return {
            vod_id: String(item.match_id),
            vod_name: title,
            vod_pic: pic,
            vod_remarks: showScore ? `${score} | ${item.start_time} | ${item.recording_count}个录像` : `${item.start_time}`
        };
    });
}

// ========== 首页 ==========
async function home(params) {
    log("进入首页");
    try {
        const data = await fetchRecordings(1, 30);
        const list = data.code === 200 ? parseVideoList(data.data) : [];
        log(`首页获取到 ${list.length} 条录像`);
        return { class: CATEGORIES, list };
    } catch (e) {
        logError("首页失败: " + e.message);
        return { class: [], list: [] };
    }
}

// ========== 分类 ==========
async function category(params) {
    const tid = params.categoryId;
    const pg = parseInt(params.page) || 1;
    log(`分类请求: ${tid}, 页码=${pg}`);
    
    try {
        let list = [];
        let pagecount = 1;
        
        if (tid === "nba") {
            // NBA：直接使用 league=NBA 参数
            const data = await fetchRecordings(pg, 20, "NBA");
            if (data.code === 200 && data.data) {
                list = parseVideoList(data.data);
                pagecount = data.data.length === 20 ? pg + 1 : pg;
                log(`NBA 第 ${pg} 页获取到 ${list.length} 条录像`);
            }
        } else if (tid === "all") {
            const data = await fetchRecordings(pg, 30);
            if (data.code === 200) {
                list = parseVideoList(data.data);
                pagecount = data.data.length === 30 ? pg + 1 : pg;
            }
        } else {
            const data = await fetchRecordings(pg, 30, null, tid);
            if (data.code === 200) {
                list = parseVideoList(data.data);
                pagecount = data.data.length === 30 ? pg + 1 : pg;
            }
        }
        
        log(`分类获取到 ${list.length} 条录像`);
        return { list, page: pg, pagecount };
    } catch (e) {
        logError("分类失败: " + e.message);
        return { list: [], page: pg, pagecount: 0 };
    }
}

// ========== 搜索 ==========
async function search(params) {
    const wd = params.keyword || params.wd || "";
    if (!wd) return { list: [] };
    log(`搜索: ${wd}`);
    
    try {
        // 搜索全部数据
        const data = await fetchRecordings(1, 100);
        if (data.code !== 200) return { list: [] };
        
        const keyword = wd.toLowerCase();
        const list = data.data
            .filter(item => {
                return item.home_team.toLowerCase().includes(keyword) ||
                       item.away_team.toLowerCase().includes(keyword) ||
                       item.league_name.toLowerCase().includes(keyword);
            })
            .map(item => {
                const title = `${item.home_team} vs ${item.away_team} (${item.league_name})`;
                return {
                    vod_id: String(item.match_id),
                    vod_name: title,
                    vod_pic: "",
                    vod_remarks: `${item.home_score} - ${item.away_score}`
                };
            });
        
        log(`搜索到 ${list.length} 条结果`);
        return { list, page: 1, pagecount: 1 };
    } catch (e) {
        logError("搜索失败: " + e.message);
        return { list: [] };
    }
}

// ========== 详情 ==========
async function detail(params) {
    const matchId = params.videoId;
    log(`详情: match_id=${matchId}`);
    
    try {
        const res = await axios.get(`https://kafeizhibo.com/api/v1/match/${matchId}/recordings`, {
            headers: config.headers
        });
        
        const data = res.data;
        if (data.code !== 200 || !data.data) {
            return { list: [] };
        }
        
        const match = data.data.match;
        const replays = data.data.replays || [];
        const highlights = data.data.highlights || [];
        
        const title = `${match.home_team} vs ${match.away_team} (${match.league_name})`;
        let pic = match.home_team_logo || match.away_team_logo || "";
        
        const episodes = [];
        
        replays.forEach((rec, idx) => {
            if (rec.video_url) {
                episodes.push({
                    name: rec.title || `录像${idx + 1}`,
                    playId: rec.video_url
                });
            }
        });
        
        highlights.forEach((rec, idx) => {
            if (rec.video_url) {
                episodes.push({
                    name: rec.title || `集锦${idx + 1}`,
                    playId: rec.video_url
                });
            }
        });
        
        const vod = {
            vod_id: matchId,
            vod_name: title,
            vod_pic: pic,
            vod_content: `${match.league_name} ${match.match_round || ""} ${match.home_team} vs ${match.away_team}，比分 ${match.home_score} - ${match.away_score}，比赛时间：${match.start_time}`,
            vod_play_sources: episodes.length > 0 ? [{ name: "录像源", episodes }] : []
        };
        
        log(`返回: ${vod.vod_name}, 录像数=${episodes.length}`);
        return { list: [vod] };
    } catch (e) {
        logError("详情失败: " + e.message);
        return { list: [] };
    }
}

// ========== 播放 ==========
async function play(params) {
    const playUrl = params.playId;
    log(`播放: ${playUrl.substring(0, 80)}...`);
    
    return {
        parse: 0,
        urls: [{ name: "播放", url: playUrl }],
        header: {
            "User-Agent": config.headers["User-Agent"],
            "Referer": config.host,
            "Origin": config.host
        }
    };
}

module.exports = { home, category, search, detail, play };

const runner = require("spider_runner");
runner.run(module.exports);