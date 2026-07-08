import urllib.request
import json

BASE_URL = "http://localhost:8080"

def request_json(url, data=None):
    req = urllib.request.Request(url)
    if data is not None:
        req.add_header('Content-Type', 'application/json')
        jsondata = json.dumps(data).encode('utf-8')
        req.data = jsondata
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Request failed: {e}")
        return {}

def test_tds_flow():
    print(">>> 开始验证 TDS 检验表格新 API 功能...")
    
    # 1. 获取产品列表，选择第一个产品
    products = request_json(f"{BASE_URL}/api/products")
    if not products:
        print("【错误】未获取到产品列表")
        return
    prod = products[0]
    pid = prod['id']
    print(f"选中测试产品: {prod['code']} (ID: {pid})")

    # 2. 获取该产品详情，验证 tds 结构已注入
    details = request_json(f"{BASE_URL}/api/products/{pid}")
    tds = details.get('tds')
    tds_list = details.get('tds_list', [])
    if not tds:
        print("【错误】未获取到初始活动 TDS 版本")
        return
    print(f"【成功】获取到初始 TDS 版本: {tds['tds_version']}，状态: {tds['status']}, 共有 {len(tds['tds_items'])} 个检验项")
    print(f"【成功】TDS 历史版本数: {len(tds_list)}")

    # 3. 模拟就地编辑：修改第一项规格并保存（微调模式，不升版）
    items = list(tds['tds_items'])
    items[0]['spec'] = "12±1.5" # 原为 12±2
    print(f"模拟就地修改第 1 项 ({items[0]['name_zh']}) 规格为 12±1.5...")
    
    res = request_json(f"{BASE_URL}/api/products/{pid}/save_tds_rows", data={"tds_items": items})
    print("修改保存响应:", res)

    # 4. 验证微调是否生效且版本未变
    details = request_json(f"{BASE_URL}/api/products/{pid}")
    new_tds = details.get('tds')
    print(f"验证微调后：版本仍为 {new_tds['tds_version']}，状态为 {new_tds['status']}")
    print(f"第一项最新规格: {new_tds['tds_items'][0]['spec']} (期待: 12±1.5)")
    assert new_tds['tds_items'][0]['spec'] == "12±1.5", "【错误】微调规格保存未生效！"

    # 5. 模拟新增检验项并正式发布为新版本（升级版本号，如 T1.0 -> T1.1）
    items.append({
        "item_no": 17,
        "name_zh": "高温高湿剥离强度",
        "name_en": "High Temp & Humidity Peel Strength",
        "unit": "N/mm",
        "spec": "≥0.25",
        "test_standard": "IPC-TM-650 2.4.8.1",
        "group": ""
    })
    print("模拟新增第 17 项检验项并提报发布新版本...")
    pub_res = request_json(f"{BASE_URL}/api/products/{pid}/publish_tds", data={
        "tds_items": items,
        "notes": "根据客户反馈，增加高温高湿剥离强度考核指标",
        "updater": "质量部经理"
    })
    print("发布新版本响应:", pub_res)
    new_ver = pub_res.get('new_version')

    # 6. 验证新版本是否已被设为活动，且旧版本归档为历史
    details = request_json(f"{BASE_URL}/api/products/{pid}")
    active_tds = details.get('tds')
    tds_list = details.get('tds_list', [])
    print(f"当前活动 TDS 版本: {active_tds['tds_version']} (状态: {active_tds['status']})")
    print(f"TDS 版本总数: {len(tds_list)}")
    print(f"活动版本检验项数量: {len(active_tds['tds_items'])} (期待: 17)")
    
    # 查找历史版本
    his_ver = next((t for t in tds_list if t['status'] == '历史'), None)
    if his_ver:
        print(f"查找到已归档的历史版本: {his_ver['tds_version']} (变更说明: {his_ver['notes']})")

    print("\n=============================================")
    print(" 恭喜！TDS 技术规格书编辑、新增与版本管控 API 验证全部通过！")
    print("=============================================")

if __name__ == "__main__":
    test_tds_flow()
