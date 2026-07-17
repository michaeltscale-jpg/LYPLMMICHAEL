#!/bin/bash

# 获取当前脚本所在目录，确保在任何位置执行都能找到项目文件
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=========================================================="
echo "    聚赫新材 PLM 生命周期管理平台 — 一键启动脚本"
echo "=========================================================="

# ── 步骤 0：检查 Python 是否安装 ──────────────────────────────
if ! command -v python3 &> /dev/null; then
    echo "【错误】未检测到 python3，请先安装 Python 后再运行此服务。"
    exit 1
fi

# ── 步骤 1：停止所有旧服务器进程，彻底释放端口 ───────────────
echo ""
echo "第一步：检测并清理旧服务进程（端口 8080）..."
OLD_PID=$(lsof -ti :8080 2>/dev/null)
if [ -n "$OLD_PID" ]; then
    echo "  发现旧进程 PID：$OLD_PID，正在终止..."
    kill -9 $OLD_PID 2>/dev/null
    sleep 1
    echo "  ✅ 旧进程已清理完毕"
else
    echo "  ✅ 端口 8080 干净，无需清理"
fi

# 同时清理所有可能残留的 server.py 进程
pkill -9 -f "python3 server.py" 2>/dev/null
sleep 1

# ── 步骤 2：重置数据库 ────────────────────────────────────────
echo ""
echo "第二步：重置并重新初始化数据库（含完整演示数据）..."
python3 init_db.py --force

if [ $? -ne 0 ]; then
    echo "【错误】数据库初始化失败，请检查 Python 及 SQLite 是否正常工作。"
    exit 1
fi
echo "  ✅ 数据库初始化成功"

# ── 步骤 3：启动服务器 ────────────────────────────────────────
echo ""
echo "第三步：正在启动 PLM 服务..."
echo "----------------------------------------------------------"
echo "  访问地址：http://localhost:8080"
echo "  如需停止服务，请按 Ctrl + C"
echo "=========================================================="
echo ""

# 稍等一秒再打开浏览器，确保服务器已启动
(sleep 2 && open "http://localhost:8080") &

python3 server.py
