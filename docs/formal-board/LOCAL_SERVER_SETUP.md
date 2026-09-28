# 正式版看板本地服务端配置

这一步只建立 Next.js 服务端到 Supabase Postgres REST 接口的安全边界。它还没有注册、登录、活动 API 或文件上传页面，因此不能把当前本机看板标成“正式版可用”。

## 本地配置

在仓库根目录创建未提交的 `.env.local`，只在本机填写：

```text
SUPABASE_URL=https://<你的项目引用>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<Supabase 项目 API 页里的 service_role key>
```

`SUPABASE_SERVICE_ROLE_KEY` 是服务端高权限凭证：不能放到 `NEXT_PUBLIC_*`、浏览器代码、截图、日志、提交或聊天中。不要把它发给赤玉；你只需在自己的电脑本地填写。

服务端模块会拒绝非 HTTPS 地址、缺少配置的启动和无效表名；错误信息不会回显密钥。浏览器不能直接调用这层，后续 Route Handler 会在服务端完成 session、Membership 权限和审计。

## 已实现边界

- `supabase-rest.ts`：仅服务端使用的 Supabase REST 请求边界，默认 `cache: no-store`。
- `password.ts`：Node `scrypt` 强哈希与 timing-safe 校验；数据库只保存编码后的哈希，不保存明文。
- `session.ts`：高熵 session token、SHA-256 digest 和 HttpOnly cookie 选项。下一步才会把 digest 写入 `app_sessions`。

## 验收边界

当前可验证的是模块单测、类型检查和服务端配置拒绝逻辑；还没有验证真实业务 API、浏览器登录、附件授权或线上部署。只有完成 HK-300 认证 API 和 HK-301 看板 API 后，才进入两个独立桌面浏览器的真实验收。
