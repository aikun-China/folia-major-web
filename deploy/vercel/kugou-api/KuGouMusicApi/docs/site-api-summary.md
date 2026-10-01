# MoeKoeMusic 站点 API 梳理

本文档基于以下两部分整理：

1. 项目前端/服务端源码中的实际调用链。
2. `2026-03-15` 对 `http://moralgew.icu/api` 的真实请求结果。

站点首页是 `http://moralgew.icu/#/`，部署时前端 API 基址来自 `VITE_APP_API_URL=/api`，见 `package.json`。

## 1. 总览

| 分类 | 前端实际调用位置 | 项目接口 | 真实调用情况 |
| --- | --- | --- | --- |
| 登录 | `src/views/Login.vue`、`src/stores/store.js` | `/login`、`/captcha/sent`、`/login/cellphone`、`/login/qr/key`、`/login/qr/create`、`/login/qr/check`、`/login/token`、`/user/detail` | 已真实验证二维码登录、`/login/token`、`/user/detail` |
| VIP 状态 | `src/views/Library.vue` | `/user/vip/detail` | 已真实验证 |
| 搜索 | `src/views/Search.vue` | `/search` | 已真实验证 `song/author/album/special` 四种类型 |
| 歌单 | `src/views/Home.vue`、`src/views/Library.vue`、`src/views/PlaylistDetail.vue`、`src/components/ContextMenu.vue`、`src/components/PlaylistSelectModal.vue` | `/top/playlist`、`/playlist/track/all`、`/user/playlist`、`/playlist/add`、`/playlist/del`、`/playlist/tracks/add`、`/playlist/tracks/del` | 已真实验证只读接口；写接口仅做源码归纳，未执行 |
| 猜你喜欢 / radio-card | `src/views/Home.vue` | `/top/card` | 已真实验证 |
| 歌曲 URL | `src/components/player/SongQueue.js`、`src/services/download/resolveUrl.ts` | `/song/url` | 已真实验证登录态/游客两种调用 |

## 2. 调用前置

### 2.1 API 基址

- 实际可调用 API 基址：`http://moralgew.icu/api`
- 根路径 `http://moralgew.icu/*` 返回的是前端 SPA 页面，不是 API。

### 2.2 鉴权方式

前端不会发送 Bearer Token，而是自己拼一个 `Authorization` 头：

```http
Authorization: token=<token>;userid=<userid>;dfid=<dfid>;t1=<t1>;KUGOU_API_MID=<mid>;KUGOU_API_GUID=<guid>;KUGOU_API_DEV=<dev>;KUGOU_API_MAC=<mac>
```

对应源码：

- `src/utils/request.js`：负责拼接 `Authorization`
- `api/server.js`：把 `Authorization` 当作 cookie 字符串解析，再合并进服务端请求参数

### 2.3 设备注册

很多接口依赖设备参数，项目启动后会先打一次：

```http
GET /api/register/dev
```

实测返回：

```json
{
  "data": {
    "dfid": "2lyyEP2BkFB41GGBpv1WFBZ5"
  },
  "status": 1,
  "error_code": 0
}
```

同时响应头会下发这些 cookie：

- `KUGOU_API_MID`
- `KUGOU_API_GUID`
- `KUGOU_API_DEV`
- `KUGOU_API_MAC`
- `dfid`

这也是为什么播放器解析歌曲 URL 前，会先走一次 `/register/dev`。

## 3. 登录相关

## 3.1 二维码登录

前端调用位置：

- `src/views/Login.vue`

实际链路：

1. `GET /api/login/qr/key`
2. `GET /api/login/qr/create?key=<qrcode>&qrimg=true`
3. `GET /api/login/qr/check?key=<qrcode>&timestamp=<ms>`

### 3.1.1 获取二维码 key

```http
GET /api/login/qr/key
```

实测返回：

```json
{
  "data": {
    "qrcode": "cfd254741d58a3b2e4500cb3443eb8d21001"
  },
  "status": 1,
  "error_code": 0
}
```

### 3.1.2 生成二维码图片

```http
GET /api/login/qr/create?key=cfd254741d58a3b2e4500cb3443eb8d21001&qrimg=true
```

实测关键返回：

```json
{
  "code": 200,
  "data": {
    "url": "https://h5.kugou.com/apps/loginQRCode/html/index.html?qrcode=cfd254741d58a3b2e4500cb3443eb8d21001",
    "base64": "data:image/png;base64,iVBORw0K..."
  }
}
```

### 3.1.3 轮询二维码状态

```http
GET /api/login/qr/check?key=cfd254741d58a3b2e4500cb3443eb8d21001&timestamp=<ms>
```

实测返回：

```json
{
  "status": 1,
  "data": {
    "status": 1,
    "nickname": null,
    "userid": null
  }
}
```

`data.status` 语义：

- `0`：二维码过期
- `1`：等待扫码
- `2`：已扫码，待确认
- `4`：授权成功

## 3.2 令牌恢复登录

虽然登录页主流程没有直接调用它，但服务端实现了：

```http
GET /api/login/token?token=<token>&userid=<userid>
```

实测返回关键字段：

```json
{
  "status": 1,
  "data": {
    "userid": 1720664119,
    "nickname": "GameHix",
    "token": "e6d51cbd...",
    "t1": "596ce597...",
    "vip_type": 0
  }
}
```

说明：

- 这个接口适合“已有 `token/userid` 时恢复登录态”。
- 项目运行时真正用于恢复会话的是 `/api/user/detail`，见 `src/stores/store.js`。

## 3.3 当前登录态详情

```http
GET /api/user/detail
Authorization: token=<token>;userid=<userid>;dfid=<dfid>
```

实测关键字段：

```json
{
  "status": 1,
  "data": {
    "userid": 1720664119,
    "nickname": "GameHix",
    "pic": "http://imge.kugou.com/kugouicon/165/20210904/20210904062628387923.jpg",
    "p_grade": 2,
    "follows": 1,
    "fans": 0,
    "duration": 1096
  }
}
```

这个接口被用来判断本地是否仍然处于登录状态。

## 3.4 源码中可调用但本次未直接执行的登录接口

以下接口确实被项目调用，但会涉及密码、短信或账号状态变化，本次为了避免副作用未在线上执行：

- `GET /api/login?username=<email>&password=<password>`
- `GET /api/captcha/sent?mobile=<mobile>`
- `GET /api/login/cellphone?mobile=<mobile>&code=<code>[&userid=<userid>]`

其中：

- `/login` 对应 `api/module/login.js`，最终转发到酷狗 `/v9/login_by_pwd`
- `/login/cellphone` 对应 `api/module/login_cellphone.js`，最终转发到酷狗 `/v7/login_by_verifycode`

## 4. VIP 状态

前端调用位置：

- `src/views/Library.vue`

接口：

```http
GET /api/user/vip/detail
Authorization: token=<token>;userid=<userid>;dfid=<dfid>
```

实测关键返回：

```json
{
  "status": 1,
  "data": {
    "userid": 1720664119,
    "vip_type": 0,
    "busi_vip": [
      {
        "product_type": "svip",
        "is_vip": 1,
        "vip_begin_time": "2026-03-14 12:41:52",
        "vip_end_time": "2026-03-15 15:41:52",
        "busi_type": "concept"
      },
      {
        "product_type": "tvip",
        "is_vip": 1,
        "vip_begin_time": "2026-03-14 12:41:52",
        "vip_end_time": "2026-03-16 15:41:52",
        "busi_type": "concept"
      }
    ]
  }
}
```

项目展示时主要看的是：

- `data.busi_vip[*].product_type`
- `data.busi_vip[*].is_vip`
- `data.busi_vip[*].vip_end_time`

## 5. 搜索

前端调用位置：

- `src/views/Search.vue`

统一入口：

```http
GET /api/search?keywords=<关键字>&page=<页码>&pagesize=<每页数量>&type=<song|author|album|special>
```

### 5.1 单曲搜索

实测：

```http
GET /api/search?keywords=海阔天空&type=song&page=1&pagesize=1
```

实测关键返回：

```json
{
  "status": 1,
  "error_code": 0,
  "data": {
    "total": 480,
    "lists": [
      {
        "OriSongName": "海阔天空",
        "SingerName": "BEYOND",
        "FileHash": "C41E80A18D1448FA47086372999C7F43",
        "Duration": 319,
        "PublishDate": "1993-05-14",
        "HQ": {
          "Hash": "DAFFF01FBBFF06991AF9E6E8C68BCE96"
        },
        "SQ": {
          "Hash": "EF79AF82F05AA5242AB2AAA22CA7DE78"
        }
      }
    ]
  }
}
```

注意：

- `Search.vue` 里优先读取的是 `HQFileHash` / `SQFileHash` / `FileHash`
- 但实测数据里更稳定的是嵌套字段 `HQ.Hash` / `SQ.Hash`
- 所以当前前端大多数时候会退回使用 `FileHash`

补充：

- 搜索结果列表里前端实际还会读取 `data.lists[*].Image`
- `Image` 不是最终可直接展示的固定 URL，而是带 `{size}` 占位符的封面模板字符串
- 项目通过 `src/utils/utils.js` 里的 `getCover(coverUrl, size)` 把 `Image` 转成真正的封面地址，本质就是把 `{size}` 替换成 `100`、`480` 等具体尺寸
- 所以“搜索结果的歌曲封面”在接口层最稳定应该看 `data.lists[*].Image`，不是 `FileHash` / `HQ.Hash` 这一类音频标识

例如，`src/views/Search.vue` 的实际读取方式就是：

- 列表缩略图：`$getCover(result.Image, 100)`
- 点击播放时传给播放器：`$getCover(result.Image, 480)`
- 右键菜单里临时挂到对象上的字段：`song.cover = song.Image?.replace("{size}", 480)`

### 5.2 歌手搜索

实测：

```http
GET /api/search?keywords=周杰伦&type=author&page=1&pagesize=3
```

首项关键字段：

```json
{
  "AuthorName": "周杰伦",
  "AuthorId": 3520,
  "Avatar": "http://singerimg.kugou.com/uploadpic/softhead/240/20241112/20241112153406328180.jpg"
}
```

### 5.3 专辑搜索

实测：

```http
GET /api/search?keywords=周杰伦&type=album&page=1&pagesize=3
```

首项关键字段：

```json
{
  "albumname": "魔杰座",
  "albumid": 960399,
  "publish_time": "2008-10-15"
}
```

### 5.4 歌单搜索

实测：

```http
GET /api/search?keywords=周杰伦&type=special&page=1&pagesize=3
```

首项关键字段：

```json
{
  "specialname": "周杰伦必听热歌 | 把青春写进我们的回忆",
  "gid": "collection_3_2132029040_287_0",
  "play_count": "148376"
}
```

### 5.5 搜索辅助接口

项目虽然没直接用到这些结果页接口，但同一套服务里还有两个很有参考价值的辅助接口：

#### 搜索建议

```http
GET /api/search/suggest?keywords=周杰伦
```

实测首个建议词：

```json
{
  "HintInfo": "周杰伦"
}
```

#### 热搜

```http
GET /api/search/hot
```

实测首个榜单和首个关键词：

```json
{
  "name": "热搜榜",
  "keyword": "海屿你"
}
```

#### 默认搜索词

```http
GET /api/search/default
```

实测返回的是一组默认广告/推荐位，而不是一个简单字符串：

```json
{
  "timestamp": 1773547105,
  "ads": [
    {
      "title": "漂流瓶点亮计划",
      "sub_title": "汪苏泷新歌"
    }
  ]
}
```

## 6. 歌单

### 6.1 首页推荐歌单

前端调用位置：

- `src/views/Home.vue`

接口：

```http
GET /api/top/playlist?category_id=0
```

实测前 3 项：

```json
[
  {
    "specialname": "深夜emo歌曲 | 抖音超火伤感情歌",
    "global_collection_id": "collection_3_2120207009_138_0"
  },
  {
    "specialname": "巨人 | 撤退的矮人",
    "global_collection_id": "collection_3_1805461762_13_0"
  },
  {
    "specialname": "时团 | 🍿爆米花的专属歌单🍿",
    "global_collection_id": "collection_3_1138192014_35_0"
  }
]
```

### 6.2 歌单详情 / 全量歌曲

前端调用位置：

- `src/views/PlaylistDetail.vue`

接口：

```http
GET /api/playlist/track/all?id=collection_3_2120207009_138_0&page=1&pagesize=3
```

实测关键返回：

```json
{
  "status": 1,
  "data": {
    "list_info": {
      "name": "深夜emo歌曲 | 抖音超火伤感情歌",
      "count": 105,
      "global_collection_id": "collection_3_2120207009_138_0"
    },
    "songs": [
      {
        "name": "王艳薇 - 离开我的依赖",
        "hash": "A9C377CC1B9931F0CE81907E23E4D588",
        "timelen": 233926,
        "mvhash": "61337E5A908D11ABF36E1A101FC3D93A"
      }
    ]
  }
}
```

项目详情页用到的核心字段：

- `data.list_info`
- `data.songs[*].name`
- `data.songs[*].hash`
- `data.songs[*].timelen`
- `data.songs[*].mvhash`

### 6.3 用户自己的歌单

前端调用位置：

- `src/views/Library.vue`
- `src/components/ContextMenu.vue`
- `src/components/PlaylistSelectModal.vue`

接口：

```http
GET /api/user/playlist?pagesize=3
Authorization: token=<token>;userid=<userid>;dfid=<dfid>
```

实测前 3 项：

```json
[
  {
    "listid": 1,
    "name": "默认收藏",
    "count": 15,
    "list_create_userid": 1720664119,
    "global_collection_id": "collection_3_1720664119_1_0"
  },
  {
    "listid": 2,
    "name": "我喜欢",
    "count": 84,
    "list_create_userid": 1720664119,
    "global_collection_id": "collection_3_1720664119_2_0"
  },
  {
    "listid": 3,
    "name": "1",
    "count": 104,
    "list_create_userid": 1720664119,
    "global_collection_id": "collection_3_1720664119_3_0"
  }
]
```

### 6.4 歌单写接口

这些接口都被项目真实调用，但本次未在线上执行，以避免直接修改账号数据：

- `GET /api/playlist/add?name=<name>&list_create_userid=<userid>`
- `GET /api/playlist/del?listid=<listid>`
- `GET /api/playlist/tracks/add?listid=<listid>&data=<name>|<hash>[,<name>|<hash>]`
- `GET /api/playlist/tracks/del?listid=<listid>&fileids=<fileid>[,<fileid>]`

源码调用点：

- `src/views/Library.vue`：创建歌单
- `src/views/PlaylistDetail.vue`：删除歌单、批量移除歌曲
- `src/components/ContextMenu.vue`：添加到歌单、取消收藏
- `src/components/PlaylistSelectModal.vue`：批量添加到歌单

## 7. 猜你喜欢 / radio-card

前端调用位置：

- `src/views/Home.vue`

实际调用接口：

```http
GET /api/top/card?card_id=<1|2|3|4|6>
```

注意：

- 当前首页 `radio-card` 实际打的是 `/api/top/card`
- 仓库里虽然也有 `/fm/recommend`，但首页这个组件并没有直接用它

### 7.1 card_id 与模式对应关系

综合 `Home.vue` 的文案和 `api/module/top_card.js` 的注释，可得到：

| card_id | 页面文案 | 实测首项 |
| --- | --- | --- |
| `1` | 私人专属好歌推荐 | `猜不透 / 丁当` |
| `2` | 经典怀旧金曲精选 | `兰亭序 / 周杰伦` |
| `3` | 热门好歌随心听 | `鸳鸯戏 / 邓寓君(等什么君)` |
| `4` | 小众宝藏佳作发现 | `人鱼的眼泪 (1.3X) / EMOWZ` |
| `6` | VIP 专属音乐推荐 | `你要的全拿走 / 胡彦斌` |

### 7.2 实测样例

#### card_id=1

```json
[
  {
    "songname": "猜不透",
    "author_name": "丁当",
    "hash": "2854609C0C7E8095493602335965B115",
    "time_length": 231.053
  },
  {
    "songname": "天若有情",
    "author_name": "A-Lin"
  },
  {
    "songname": "偏爱",
    "author_name": "Dr.Phonk"
  }
]
```

#### card_id=6

```json
[
  {
    "songname": "你要的全拿走",
    "author_name": "胡彦斌",
    "hash": "489E4872BD06E51C969AE81748E78A10",
    "time_length": 299.363
  },
  {
    "songname": "演员",
    "author_name": "薛之谦"
  },
  {
    "songname": "西楼别序",
    "author_name": "尹昔眠、小田音乐社"
  }
]
```

## 8. 歌曲 URL

前端调用位置：

- `src/components/player/SongQueue.js`
- `src/services/download/resolveUrl.ts`

接口：

```http
GET /api/song/url?hash=<hash>[&quality=<128|320|flac|high>][&free_part=1]
```

### 8.1 登录态调用

实测：

```http
GET /api/song/url?hash=2854609C0C7E8095493602335965B115&quality=320
Authorization: token=<token>;userid=<userid>;dfid=<dfid>
```

实测关键返回：

```json
{
  "status": 1,
  "extName": "mp3",
  "fileSize": 9243377,
  "timeLength": 231,
  "url": [
    "http://fs.youthandroid2.kugou.com/...qu320....mp3"
  ]
}
```

说明：

- 返回字段在顶层，不在 `data` 里
- `SongQueue.js` 使用 `response.url[0]`
- `resolveUrl.ts` 兼容 `response.data.url` 和 `response.url[0]`

### 8.2 游客试听调用

实测：

```http
GET /api/song/url?hash=2854609C0C7E8095493602335965B115&quality=128&free_part=1
```

实测关键返回：

```json
{
  "status": 1,
  "extName": "mp3",
  "fileSize": 3697477,
  "timeLength": 231,
  "url": [
    "http://fs.youthandroid2.kugou.com/.../yp/p_0_2321844/...qu128....mp3"
  ]
}
```

差异：

- 登录态 `320` 返回完整资源，文件更大
- 游客 `free_part=1` 返回试听资源，URL 路径里能看到 `p_0_...`

### 8.3 当前播放歌曲的封面怎么看

这个项目里“当前播放封面”不是某个单独 API 返回的稳定字段，而是播放器内部归一后的运行时字段：

- 播放器统一读取的是 `currentSong.img`
- `currentSong.img` 由 `src/components/player/SongQueue.js` 在入队时写入
- `src/components/PlayerControl.vue` 播放时会把整个 `currentSong` 持久化到 `localStorage.current_song`

来源关系分别是：

- 从搜索结果播放：`currentSong.img = $getCover(result.Image, 480)`
- 从首页推荐 / 排行 / 历史记录等列表播放：也是各自列表里的封面字段先经过 `getCover(...)`，再写入 `currentSong.img`
- 只有 `hash`、没有现成封面时：项目会调用 `/api/privilege/lite?hash=<hash>`，再从返回的 `data[0].info.image` 生成封面，例如 `Home.vue` 和 `PlayerControl.vue` 的 URL 唤起播放就是这样处理的

因此，如果你是在：

- 看搜索接口原始返回：封面看 `data.lists[*].Image`
- 看播放器当前状态：封面看前端运行时对象 `currentSong.img`
- 只有歌曲 `hash` 想反查封面：优先看 `/api/privilege/lite` 返回里的 `data[0].info.image`

## 9. 源码到上游接口映射

项目服务端不是直接把前端参数原样转发给酷狗，而是会重新封装并签名。核心映射如下：

| 项目接口 | 服务端模块 | 上游接口 |
| --- | --- | --- |
| `/api/login` | `api/module/login.js` | `/v9/login_by_pwd` |
| `/api/login/cellphone` | `api/module/login_cellphone.js` | `/v7/login_by_verifycode` |
| `/api/login/qr/key` | `api/module/login_qr_key.js` | `/v2/qrcode` |
| `/api/login/qr/check` | `api/module/login_qr_check.js` | `/v2/get_userinfo_qrcode` |
| `/api/login/token` | `api/module/login_token.js` | `/v5/login_by_token` |
| `/api/user/vip/detail` | `api/module/user_vip_detail.js` | `/v1/get_union_vip` |
| `/api/user/playlist` | `api/module/user_playlist.js` | `/v7/get_all_list` |
| `/api/top/playlist` | `api/module/top_playlist.js` | `/v2/special_recommend` |
| `/api/playlist/track/all` | `api/module/playlist_track_all.js` | `/pubsongs/v2/get_other_list_file_nofilt` |
| `/api/top/card` | `api/module/top_card.js` | `/singlecardrec.service/v1/single_card_recommend` |
| `/api/everyday/recommend` | `api/module/everyday_recommend.js` | `/everyday_song_recommend` |
| `/api/search` | `api/module/search.js` | `/v3/search/song` 或 `/v1/search/{type}` |
| `/api/song/url` | `api/module/song_url.js` | `/v5/url` |
| `/api/register/dev` | `api/module/register_dev.js` | `/risk/v2/r_register_dev` |

## 10. 结论

可以直接下结论：

1. 线上站点真正的 API 前缀是 `/api`，不是根路径。
2. 登录态依赖自定义 `Authorization` 头加设备 cookie，不是标准 Bearer Token。
3. `radio-card` 实际调用的是 `/api/top/card`，不是 `/api/fm/recommend`。
4. 歌曲播放接口 `/api/song/url` 返回值在顶层，播放器直接取 `url[0]`。
5. 搜索结果页统一走 `/api/search`，不同 `type` 返回结构不同；单曲结果里音频标识更稳定的是 `HQ.Hash` / `SQ.Hash`，封面字段则看 `Image`，使用前需要把 `{size}` 替换成具体尺寸。
6. 歌单读接口已全部实测；歌单写接口虽然项目确实会调用，但本次未执行，以避免修改账号数据。
