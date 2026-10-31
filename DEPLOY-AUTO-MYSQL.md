# 自动部署项目与 MySQL（推荐新站点）

项目通过 Compose 一起启动 MySQL 8.4 LTS 和应用，自动生成密码、创建业务库和账号、设置访问权限，并等待真实数据库查询成功后启动后端。无需在宝塔另装 MySQL，无需手工填写来源 IP，也不开放数据库公网端口。

**这是启用新的项目专用数据库，不会自动导入旧 SQLite 或宝塔 MySQL 的数据。** 适合尚未创建管理员、没有正式业务数据的新站点。已有用户、余额、订单时先备份并迁移，不能把切换新库当成迁移。旧数据库和应用数据卷会保留。

## 1. 已拉取项目的新站点切换

在宝塔终端执行。如果之前手改过 `docker-compose.prod.yml`，先备份该文件，再恢复到仓库版本，以免阻止拉取；`.env` 不会被覆盖：

```bash
cd /opt/ace-api
mkdir -p backups
cp docker-compose.prod.yml "backups/compose-before-auto-mysql-$(date +%Y%m%d-%H%M%S).yml"
git restore --source=HEAD -- docker-compose.prod.yml
git pull --ff-only
bash scripts/deploy.sh --fresh-mysql
```

有其它文件冲突时先保留并检查，不要强制重置整个仓库。本步骤需要 Bash、Docker Compose v2 或更新、OpenSSL、Python 3。Ubuntu 24.04 通常具备这些工具。`--fresh-mysql` 是显式启用新数据库的选项，不删除已有库，也不重复生成已经存在的 `.env.mysql` 密码。

脚本复用现有 `.env` 的 `SITE_URL`、`SESSION_SECRET`、`CRYPTO_SECRET`。现有 `.env` 中指向宝塔 MySQL 的 `SQL_DSN` 被项目自带 MySQL 配置覆盖，不用再编辑它。首次镜像不存在时 Compose 自动构建；需要强制重新构建应用时加 `--build`。

启动成功后访问你的 HTTPS 域名 `/setup`，数据库检查应显示 MySQL，然后创建管理员。宝塔反向代理继续使用 `http://127.0.0.1:8088`，证书和域名设置不变。

## 2. 从零部署

```bash
mkdir -p /opt
cd /opt
git clone https://github.com/kimihalle/ace-api-console.git ace-api
cd ace-api
bash scripts/deploy.sh --fresh-mysql
```

没有 `.env` 时脚本会询问公网 HTTPS 地址，并生成固定会话和加密密钥。例如输入 `https://api.example.com`，不带末尾斜杠。再按 [宝塔文档第 5 节](DEPLOY-BAOTA.md#5-配置宝塔反向代理与-https) 配置反向代理和证书。

## 3. 日常命令

**启用自带 MySQL 后，统一使用脚本入口。** 它会根据 `.env.mysql` 自动加载三份 Compose 文件；只运行旧的基础 Compose 命令可能重新连回 SQLite 或宝塔数据库。

```bash
# 查看状态
bash scripts/compose.sh ps

# 查看数据库和后端日志
bash scripts/compose.sh logs --tail=100 mysql new-api

# 重启后端
bash scripts/compose.sh restart new-api

# 备份
bash scripts/backup.sh

# 备份成功后，更新代码和镜像
git pull --ff-only
bash scripts/deploy.sh --build
```

健康检查失败时脚本返回错误，查看日志处理。MySQL 使用 `mysql_data` 数据卷，应用 `/data` 继续使用原来的 `new_api_data` 数据卷；宿主机原有 MySQL 服务无需卸载或关闭。

## 4. 密码、备份与恢复

脚本生成 `.env.mysql`（权限 600），保存业务账号和 root 的独立随机密码。文件已由 Git 和 Docker 构建忽略，不能公开或提交。重复部署复用原密码；不要直接删除该文件、手动重置密码或执行 `down -v`。发现同项目 `mysql_data` 卷存在但密码文件缺失时，脚本会停止，要求恢复原文件。

`bash scripts/backup.sh` 会自动转到 MySQL 备份：短暂停止本应用写入，导出 SQL，复制 `.env`、`.env.mysql`、应用 `/data` 和当前提交号，然后恢复原本运行的后端。压缩 SQL 成功后才生成最终 `mysql.sql.gz`，失败时脚本报错并恢复后端，不把半截导出当成成功。

此备份流程假定应用是唯一写入者。若有其他程序写库，需要安排共同维护窗口。备份保存在 `backups/mysql-日期-随机后缀/`，包含密钥和用户数据，复制一份到服务器之外。计划任务可以执行 `cd /opt/ace-api && bash scripts/backup.sh`，先手动验证成功。

恢复应先在隔离环境执行：使用原 `.env`、`.env.mysql` 和相应提交，在新的空数据卷部署相同 MySQL 主版本，只启动数据库，导入 SQL 并恢复应用数据，再启动应用验证。以下命令在**已经准备好的隔离恢复项目目录**执行，不可直接对现有正式库导入：

```bash
# 确认已恢复原配置文件，且使用新的隔离 Compose 项目名：
export COMPOSE_PROJECT_NAME=ace-api-restore
bash scripts/compose.sh up -d --wait mysql
read -r -p '输入备份 mysql.sql.gz 的绝对路径：' archive_file
set -o pipefail
gzip -dc "$archive_file" | bash scripts/compose.sh exec -T mysql sh -ec '
  export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
  exec mysql -u root "$MYSQL_DATABASE"
'
```

仅在 SQL 导入成功、应用数据恢复完成后启动后端。恢复演练需另外的回环监听端口或独立主机，避免占用正式 8088 端口。核对管理员、用户余额、渠道、订单和调用日志后再考虑正式切换。

以前为宿主机 MySQL 添加的 Docker 放行规则，在确认不再有应用使用后，可在原防火墙中移除；不要关闭整个防火墙。此前创建的宝塔业务库先保留，确认不需要其中数据后再自行管理。
