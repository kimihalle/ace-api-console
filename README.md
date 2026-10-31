# FoxCoding Console

Linux 宝塔生产部署（含私有仓库拉取、HTTPS、数据迁移、备份和更新）：[部署文档](DEPLOY-BAOTA.md)。生产启动需要同时使用 `docker-compose.yml` 和 `docker-compose.prod.yml`。

数据库默认使用 SQLite；连接宝塔已安装的 MySQL 时，在根目录 `.env` 配置 `SQL_DSN`，参见[MySQL 部署步骤](DEPLOY-MYSQL.md)。生产配置已提供 Linux 宿主机访问地址 `host.docker.internal`，不需要另外安装 MySQL 容器。

FoxCoding Console is a custom React/Vite customer-facing frontend. This workspace also contains a full [New API](https://github.com/QuantumNous/new-api) source clone in `new-api-upstream`; its Go service is the backend, and its native console remains the admin UI. No other project's New API container is used.

## Run the workspace stack

Build and start the New API source clone and FoxCoding frontend together:

```bash
docker compose up -d --build
```

Open `http://localhost:8088/` for the whole application. FoxCoding pages and New API's setup wizard, native admin console, static assets, and API are routed through this single port. Complete the New API setup wizard at `http://localhost:8088/setup` before registering or signing in on the customer frontend. `/admin` in FoxCoding opens the native New API user-management page at `/users`.

The reverse proxy sends `/api`, `/v1`, `/v1beta`, New API routes, and New API assets to the `new-api` Compose service. By default, New API uses SQLite persisted in the `new_api_data` volume. Set `SQL_DSN` in the root `.env` to connect an existing MySQL database; production Compose maps `host.docker.internal` to the Linux host gateway. The backend is not published on a separate host port; the unrelated service on port 3000 is not used or modified.

## Frontend development

```bash
npm install
npm run dev
```

The Vite proxy targets the running same-origin stack at `http://127.0.0.1:8088` by default. Override `NEW_API_TARGET` in `.env` if needed. Set `VITE_NEW_API_CONSOLE_URL` only when the New API console is hosted on another origin.

## Connected functionality

User workspace:

- New API login, registration, session refresh, logout, and current-user data.
- Account quota, usage statistics, usage logs, API token creation/status/delete.
- Account model directory and subscription plans.
- Redemption and balance subscription purchase flows.

Admin workspace:

- `/admin` opens the native New API web console. User, channel, model, quota, redemption, subscription, system, and audit administration remain entirely in New API's own UI and backend.
- Set `VITE_NEW_API_CONSOLE_URL` at build time only when the New API console is hosted on a different origin.
