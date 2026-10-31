# ACE API 宝塔部署文档

本文档针对当前项目（React/Vite 前台 + `new-api-upstream` Go 后端 + Docker Compose）编写。推荐使用宝塔 Nginx 做 HTTPS 入口，Docker 服务只监听服务器本机。

## 一、部署架构

```text
用户浏览器
   │ HTTPS（宝塔 Nginx）
   ▼
127.0.0.1:8088  ── relay-console（前台静态页 + Nginx 反代）
                         │ Docker 网络
                         ▼
                    new-api:3000（New API 后端）
                         │
                    new_api_data（SQLite 数据卷）
```

不要直接把 3000 或 8088 暴露到公网；外网只开放 80/443。数据库数据在 Docker 卷 `new_api_data` 中，更新时不要删除该卷。

## 二、服务器准备（宝塔）

在宝塔「软件商店」安装：Nginx、Docker 管理器（包含 Docker Compose）、Git。建议服务器至少 2 核 / 4 GB 内存，开放 80 和 443 端口。

SSH 登录服务器后检查：

```bash
docker --version
docker compose version
git --version
```

## 三、GitHub 仓库与 Deploy Key

本项目仓库建议设为 **Private**。在宝塔服务器生成只读部署密钥（一路回车即可）：

```bash
ssh-keygen -t ed25519 -C "ace-api-baota" -f ~/.ssh/ace_api_deploy
cat ~/.ssh/ace_api_deploy.pub
```

把公钥添加到 GitHub 仓库「Settings → Deploy keys → Add deploy key」，只勾选 **Allow read-only access**。配置 SSH：

```bash
cat >> ~/.ssh/config <<'EOF'
Host github-ace-api
  HostName github.com
  User git
  IdentityFile ~/.ssh/ace_api_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config ~/.ssh/ace_api_deploy
ssh -T git@github-ace-api
```

下面的仓库地址以实际创建结果为准：

```bash
cd /opt
git clone git@github-ace-api:kimihalle/ace-api-console.git ace-api
cd /opt/ace-api
```

如果仓库设为公开，也可以使用 HTTPS clone，但私有仓库推荐 Deploy Key，不要把 GitHub Token 写进命令或 `.env`。

## 四、首次部署

```bash
cd /opt/ace-api
cp .env.example .env
nano .env
```

`.env` 中建议保持同源配置：

```dotenv
NEW_API_TARGET=http://127.0.0.1:8088
VITE_NEW_API_BASE_URL=
VITE_NEW_API_CONSOLE_URL=
```

不要把真实 SMTP、支付网关密钥、OAuth Secret 等提交到 GitHub。项目根目录的 `.env` 已被 `.gitignore` 忽略。

构建并启动（生产覆盖文件会启用 Secure Cookie）：

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

查看状态和日志：

```bash
docker compose ps
docker compose logs --tail=100 new-api
docker compose logs --tail=100 relay-console
curl -I http://127.0.0.1:8088/
```

首次启动后，New API 管理入口由前台反代到 `/newapi-admin/`；按页面提示创建/登录管理员账号。不要执行 `docker compose down -v`，否则会删除 `new_api_data` 数据卷。

## 五、宝塔网站与反向代理

1. 宝塔「网站 → 添加站点」，绑定你的域名（例如 `api.example.com`），PHP 版本选纯静态即可。
2. 在「反向代理」新增代理，目标 URL 填：`http://127.0.0.1:8088`。
3. 在代理高级设置/配置文件中确认包含以下内容（宝塔通常会自动生成其余配置）：

```nginx
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_read_timeout 600s;
proxy_send_timeout 600s;
client_max_body_size 32m;
```

4. 「SSL」申请 Let’s Encrypt 证书并开启强制 HTTPS。证书生效后，确认浏览器访问 `https://你的域名/`。
5. 如果宝塔模板覆盖了 WebSocket 配置，请确保 `/v1/`、`/v1beta/` 和 `/newapi-admin/` 请求仍带 Upgrade/Connection 头。

## 六、后台上线配置清单

按实际业务逐项配置并用小额/测试账号验证：

- 管理员账号、站点名称、公告与注册开关。
- 上游渠道、模型映射、分组倍率及失败重试策略。
- 成本价/销售倍率与利润统计口径。
- SMTP（邮箱注册、找回密码、验证码）；未配置 SMTP 时前台不应显示邮箱验证入口。
- 支付网关：回调地址必须使用 HTTPS 公网地址，检查异步通知签名和重复通知幂等。
- 商品/充值额度、直接加余额或兑换码交付方式、订单与账单明细。
- OAuth、Passkey、Turnstile 等功能只在已配置对应密钥后开启。

支付回调通常需要让网关访问站点的 `/api/` 路由；不要把回调地址写成 127.0.0.1。

## 七、更新发布

先备份，再拉取并重建：

```bash
cd /opt/ace-api
mkdir -p backups
# SQLite 数据卷备份（停止写入后执行）
docker compose stop new-api
docker run --rm -v ace-api_new_api_data:/data -v /opt/ace-api/backups:/backup alpine sh -c 'tar czf /backup/new_api_data_$(date +%F_%H%M%S).tgz -C /data .'
docker compose start new-api

git pull --ff-only
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker image prune -f
```

如果卷名因目录名不同而变化，用 `docker volume ls` 找到实际的 `*_new_api_data`；也可以直接执行：

```bash
docker run --rm -v <实际卷名>:/data -v /opt/ace-api/backups:/backup alpine sh -c 'tar czf /backup/new_api_data_manual.tgz -C /data .'
```

回滚到上一个提交：

```bash
git log --oneline -5
git checkout <已验证的提交号>
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## 八、故障排查

```bash
docker compose ps
docker compose logs -f --tail=200 new-api
docker compose logs -f --tail=200 relay-console
docker inspect $(docker compose ps -q new-api) --format '{{json .State.Health}}'
curl -fsS http://127.0.0.1:8088/ >/dev/null && echo OK
ss -lntp | grep -E ':80|:443|:8088|:3000'
```

- 页面 502：确认 `relay-console` 与 `new-api` 都是 running，且后端 healthcheck 为 healthy。
- 登录反复失效：确认全站 HTTPS、`SESSION_COOKIE_SECURE=true`，且宝塔传递 `X-Forwarded-Proto`。
- 支付回调失败：检查公网 DNS、证书、宝塔安全组及 `/api/` 反代日志。
- 更新后数据消失：立即停止操作，检查 Docker 卷；绝不要使用 `down -v`。

## 九、上线验收

- [ ] HTTPS、强制跳转、证书自动续期正常。
- [ ] `/`、`/login`、`/register`、`/forgot-password` 可访问。
- [ ] 前台调用、流式响应和 WebSocket 正常。
- [ ] New API 管理后台可登录，渠道/分组倍率正确。
- [ ] 邮箱注册/找回密码仅在 SMTP 开启时显示且可收信。
- [ ] 支付下单、异步回调、余额/兑换码交付、账单记录各完成一次测试。
- [ ] 已完成数据卷和 `.env` 备份，并确认备份可读取。
