# 连接宝塔已有的 MySQL

新装站点更推荐 [自动部署项目与 MySQL](DEPLOY-AUTO-MYSQL.md)，由 Compose 自动完成建库、密码和授权，无需手工处理宿主机网络权限。只有确实要复用现有宝塔数据库时才使用本文。

本仓库的 New API 后端已具备 MySQL 驱动。本步骤配置 Docker 连接宝塔安装在同一台 Linux 宿主机上的 MySQL，不创建另一个 MySQL 实例。

**适用于新装站点或空库初始化。更改连接串不会迁移 SQLite 里的用户、余额、订单和渠道；已有业务数据时先做迁移方案。** 配置目标为 MySQL 5.7.8 或更新版本；本文没有对服务器上具体版本做运行验收。现有 5.7 可以先连接，后续升级数据库要另做备份和兼容验证。

## 1. 创建业务数据库

宝塔「数据库 → MySQL → 添加数据库」，创建专用空库、专用用户和强密码，字符集选择 `utf8mb4`，例如数据库和用户名都叫 `aceapi`。业务账号只授权该库，不使用 MySQL root。

允许连接的来源应是项目 Docker 网络。查看当前后端所属网络和子网：

```bash
cd /opt/ace-api
backend_id=$(docker compose ps -a -q new-api)
docker inspect --format '{{range $name, $network := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$backend_id"
docker network ls
```

对上一步查到的项目网络执行 `docker network inspect 网络名称`，查看 `IPAM.Config.Subnet`。在宝塔中限制账号允许访问的来源到这个网段。MySQL 5.7 的 Host 支持 IP 通配符或 `网络地址/子网掩码`，不是所有版本都支持 CIDR 前缀写法。例如实际子网是 `172.18.0.0/16` 时，对应 Host 为 `172.18.%` 或 `172.18.0.0/255.255.0.0`；不要把示例当成自己服务器的实际网段。若宝塔界面不接受范围格式，使用其数据库管理工具配置该业务账号的 Host 和库权限。

数据库不需要对公网开放 3306；但宿主机防火墙要允许项目 Docker 内网访问数据库监听地址。

## 2. 检查 MySQL 监听

```bash
ss -lntp | grep ':3306'
ip -4 addr show docker0
```

如果 MySQL 仅监听 `127.0.0.1:3306`，容器无法从桥接网络连接。可在宝塔 MySQL 配置的 `[mysqld]` 中，让 `bind-address` 监听 Docker 可访问的宿主机私网地址，例如实际 `docker0` 地址；同时检查没有启用 `skip-networking`。若选择监听所有地址，应在主机和云防火墙明确拒绝公网 3306，并只放行所需内网来源。

修改监听需要重启 MySQL，会短暂影响该服务器所有使用此 MySQL 实例的网站。不要更改 MySQL 数据目录或删除现有数据库。

生产 Compose 的 `host.docker.internal:host-gateway` 默认指向 Docker 宿主机网关。自定义过 Docker 网关时，以容器内实际解析结果和服务器监听地址为准。

## 3. 配置连接串

用宝塔文件编辑器打开 `/opt/ace-api/.env`，设置唯一一条 `SQL_DSN`。以下为示例，替换密码，不要将实际值写入跟踪的 YAML、文档或 GitHub：

```dotenv
SQL_DSN='aceapi:数据库密码@tcp(host.docker.internal:3306)/aceapi?charset=utf8mb4&parseTime=true&loc=Local'
LOG_SQL_DSN=
```

保留现有 `SITE_URL`、`SESSION_SECRET`、`CRYPTO_SECRET`。连接串外层的单引号用于避免 Compose 对密码中的 `$` 做变量替换；含单引号或复杂分隔符的密码需要按 dotenv/驱动语法转义，首次配置可使用足够长的随机字母数字密码。

`SQL_DSN` 留空：继续 SQLite。`LOG_SQL_DSN` 留空：调用日志与主库使用同一数据库。不要填公网 IP 或容器自己的 `127.0.0.1` 来连接同机宝塔数据库。

## 4. 更新已有服务器的仓库

若此前按聊天指导手改过 `docker-compose.prod.yml`，它可能阻止 `git pull`。只将这个已知修改的文件备份并恢复到已提交版本，再拉取；`.env` 不受影响：

```bash
cd /opt/ace-api
mkdir -p backups
cp docker-compose.prod.yml "backups/docker-compose.prod.before-mysql-$(date +%Y%m%d-%H%M%S).yml"
git restore --source=HEAD -- docker-compose.prod.yml
git pull --ff-only
```

如提示其它文件也有本地修改，先检查并保留，不能用全仓库强制重置处理。其他自定义 Compose 参数需要从备份中有选择地合并回来。

## 5. 应用配置并验证

```bash
cd /opt/ace-api
chmod 600 .env
docker compose -f docker-compose.yml -f docker-compose.prod.yml config --quiet
```

确认没有配置报错，再执行：

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose ps
docker compose logs --tail=100 new-api
curl -fsS http://127.0.0.1:8088/api/setup
```

本次只改配置，已有镜像无需重新编译。日志应表明使用 MySQL，`/api/setup` 返回的 `data.database_type` 应为 `mysql`。打开 HTTPS 域名的 `/setup`，应显示 MySQL，然后完成管理员初始化。再验证登录、一次调用和账单记录，不能只凭首页可访问判断数据库配置成功。

| 错误 | 优先检查 |
| --- | --- |
| `connection refused` | 3306 是否监听可访问的宿主机地址，MySQL 是否启动 |
| 连接超时 / no route | 宿主机网关映射、主机防火墙、Docker 网络路由 |
| `Access denied` / Host is not allowed | 业务用户名密码，以及该账号 Host 是否匹配 Docker 容器来源 |
| `Unknown database` | 数据库是否已创建，名称是否与连接串一致 |
| 中文字符集检查失败 | 数据库与表的字符集/排序规则，建议新库使用 utf8mb4 |
| 初始化仍显示 SQLite | `.env` 是否有重复连接串、是否拉取新配置并执行 `up -d`；单纯 `restart` 不更新容器环境变量 |

## 6. MySQL 的备份和更新

MySQL 数据位于宝塔管理的数据库中，不在应用的 `new_api_data` 卷里。使用宝塔「计划任务 → 备份数据库」备份业务库，并保留 `.env`、当前代码提交号和应用 `/data` 中需要的文件。若配置独立日志库，也要备份该库。备份复制到服务器之外，并恢复到隔离空库验证。

外接宝塔数据库时，`scripts/backup.sh` 会报错退出，避免将应用 `/data` 误当成数据库备份。使用项目自带 MySQL（存在 `.env.mysql`）时，它会自动调用对应的 MySQL 导出脚本，见 [自动 MySQL 文档](DEPLOY-AUTO-MYSQL.md)。

后续更新先完成上述数据库备份，再运行：

```bash
cd /opt/ace-api
git pull --ff-only
docker compose -f docker-compose.yml -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

不要为了解决连接问题删除旧 SQLite 卷、重建业务库或重新生成会话/加密密钥。回滚代码不会自动回滚 MySQL 表结构，升级前保留可恢复的数据库备份。
