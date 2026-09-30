#!/bin/bash
# Folia Music Player - Linux 部署脚本（橙云/华为云 ECS）
# 使用方式：
#   1. 将整个 folia-major 目录上传到服务器（scp 或 git clone）
#   2. chmod +x deploy.sh && ./deploy.sh
#   3. 按提示输入 Cloudflare Tunnel 配置路径（如已有则自动检测）

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_VERSION="24"

echo "============================================================"
echo "  Folia Music Player - Linux 部署"
echo "============================================================"
echo "  项目目录: $PROJECT_DIR"
echo ""

# —— 1. 检查 / 安装 Node.js ——
echo "[1/6] 检查 Node.js..."
if command -v node &>/dev/null && [ "$(node -v | cut -dv -f2 | cut -d. -f1)" -ge "$NODE_VERSION" ]; then
    echo "  Node.js $(node -v) 已安装"
else
    echo "  安装 Node.js $NODE_VERSION (通过 NodeSource)..."
    curl -fsSL "https://deb.nodesource.com/setup_$NODE_VERSION.x" | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# —— 2. 安装 PM2（进程管理）——
echo "[2/6] 检查 PM2..."
if ! command -v pm2 &>/dev/null; then
    echo "  安装 PM2..."
    sudo npm install -g pm2
else
    echo "  PM2 已安装"
fi

# —— 3. 安装项目依赖 ——
echo "[3/6] 安装前端依赖..."
cd "$PROJECT_DIR"
npm install

echo "  安装 sync-server 依赖..."
cd "$PROJECT_DIR/sync-server"
npm install

# —— 4. 构建前端 ——
echo "[4/6] 构建前端..."
cd "$PROJECT_DIR"
npm run build

# —— 5. 用 PM2 启动所有服务 ——
echo "[5/6] 启动服务..."

# Netease API (端口 3300)
pm2 delete folia-ncm-api 2>/dev/null || true
pm2 start --name folia-ncm-api -- npx cross-env PORT=3300 api

# 等待 NCM API 启动
sleep 3

# Sync Server (端口 8787) - 使用生产模式启动
pm2 delete folia-sync-server 2>/dev/null || true
cd "$PROJECT_DIR/sync-server"
pm2 start --name folia-sync-server -- npm run start:node

sleep 2

# Preview Server (端口 3000，静态文件 + API 代理)
pm2 delete folia-preview 2>/dev/null || true
cd "$PROJECT_DIR"
pm2 start --name folia-preview -- node preview-server.mjs

sleep 2

# —— 6. Cloudflare Tunnel ——
echo "[6/6] 检查 Cloudflare Tunnel..."
if [ -f "/usr/local/bin/cloudflared" ] || [ -f "$HOME/cloudflared" ]; then
    echo "  cloudflared 已安装"
    pm2 delete folia-tunnel 2>/dev/null || true
    if [ -f "$PROJECT_DIR/config.yml" ]; then
        # 检查 config.yml 中的路径是否为 Linux 格式
        CRED_PATH=$(grep 'credentials-file:' "$PROJECT_DIR/config.yml" | head -1 | sed 's/.*credentials-file:[[:space:]]*//' | tr -d '\r')
        if [ -f "$CRED_PATH" ]; then
            pm2 start --name folia-tunnel -- cloudflared tunnel --config "$PROJECT_DIR/config.yml" run
            echo "  Cloudflare Tunnel 已启动"
        elif [ -f "$PROJECT_DIR/config.linux.yml" ]; then
            # 尝试 Linux 配置模板
            CRED_PATH=$(grep 'credentials-file:' "$PROJECT_DIR/config.linux.yml" | head -1 | sed 's/.*credentials-file:[[:space:]]*//' | tr -d '\r')
            if [ -f "$CRED_PATH" ]; then
                pm2 start --name folia-tunnel -- cloudflared tunnel --config "$PROJECT_DIR/config.linux.yml" run
                echo "  Cloudflare Tunnel 已启动 (使用 config.linux.yml)"
            else
                echo "  [警告] Tunnel 凭证文件不存在: $CRED_PATH"
                echo "  请执行:"
                echo "    cloudflared tunnel login"
                echo "    cloudflared tunnel create folia"
                echo "  然后编辑 config.linux.yml 填入正确的 credentials-file 路径"
            fi
        else
            echo "  [警告] Tunnel 凭证文件不存在: $CRED_PATH"
            echo "  请将凭证 json 文件放到正确路径，或重新运行: cloudflared tunnel login"
        fi
    else
        echo "  [警告] config.yml 不存在，跳过 Tunnel 启动"
    fi
else
    echo "  cloudflared 未安装"
    echo "  如需通过域名访问，请安装:"
    echo "    curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared"
    echo "    chmod +x /usr/local/bin/cloudflared"
    echo "    cloudflared tunnel login"
    echo "    cloudflared tunnel create folia"
    echo "  然后修改 config.yml 中的 credentials-file 路径，重新运行本脚本"
fi

# —— 保存 PM2 配置，开机自启 ——
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup -u $(whoami) --hp "$HOME"

echo ""
echo "============================================================"
echo "  部署完成！"
echo "============================================================"
echo ""
echo "  服务状态:"
pm2 list
echo ""
echo "  本地访问:  http://localhost:3000"
echo "  外网访问:  https://music.aikun-bili.top (需 Tunnel 正常运行)"
echo ""
echo "  常用命令:"
echo "    pm2 list              查看服务状态"
echo "    pm2 logs              查看日志"
echo "    pm2 restart all       重启所有服务"
echo "    pm2 stop all           停止所有服务"
echo ""
echo "  同步数据存储在: $PROJECT_DIR/sync-server/folia-sync.db"
echo "  请定期备份此文件"
echo ""
