#!/bin/bash

# 获取当前脚本所在目录
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=========================================================="
echo "    GHZ 高频铜箔 NPI & PLM 生命周期管理平台一键启动脚本"
echo "=========================================================="

# 检查 Python 是否安装
if ! command -v python3 &> /dev/null
then
    echo "【错误】未检测到 python3，请先安装 Python 后再运行此服务。"
    exit 1
fi

echo "第一步：正在检查并加载 SQLite 数据库..."
python3 init_db.py

if [ $? -ne 0 ]; then
    echo "【错误】数据库初始化失败，请检查 Python 及 SQLite 是否正常工作。"
    exit 1
fi

echo "----------------------------------------------------------"
echo "第二步：正在启动 PLM 协同控制平台服务..."
echo "系统将自动在浏览器中打开：http://localhost:8080"
echo "您可以随时在右侧手机端进行“钉钉审批模拟器”的操作演示"
echo "如需停止运行，请在终端按 Ctrl + C"
echo "=========================================================="

python3 server.py
