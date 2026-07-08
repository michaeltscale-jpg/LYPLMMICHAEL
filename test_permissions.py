import urllib.request
import json

BASE_URL = "http://localhost:8080"

def request_with_role(url, data, role):
    req = urllib.request.Request(url)
    req.add_header('Content-Type', 'application/json')
    req.add_header('X-User-Role', role)
    jsondata = json.dumps(data).encode('utf-8')
    req.data = jsondata
    try:
        with urllib.request.urlopen(req) as response:
            return response.status, json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode('utf-8'))
        except:
            body = e.reason
        return e.code, body
    except Exception as e:
        return 999, str(e)

def run_tests():
    print(">>> 开始角色与权限控制系统后端集成测试...")

    # 用访客身份立项，预期被拦截 (403)
    code, res = request_with_role(f"{BASE_URL}/api/products", {
        "code": "TEST-PERM-01",
        "name": "测试权限铜箔",
        "category": "PTS AI 铜箔"
    }, "Viewer")
    print(f"【测试 1】访客立项 -> 状态码: {code}, 响应: {res}")
    assert code == 403, "【错误】只读访客未被权限拦截！"
    print("【成功】访客立项拦截通过！")

    # 用产品经理身份立项，预期通过 (200 或 400 冲突，但绝不能是 403 拦截)
    import time
    ts = int(time.time())
    code, res = request_with_role(f"{BASE_URL}/api/products", {
        "code": f"TP-{ts}",
        "name": f"测试权限铜箔 {ts}",
        "category": "PTS AI 铜箔"
    }, "Product Manager")
    print(f"【测试 2】产品经理立项 -> 状态码: {code}, 响应: {res}")
    assert code != 403, "【错误】产品经理立项被鉴权拦截！"
    print("【成功】产品经理立项权限通过！")

    # 用质量工程师保存 BOM，预期被拦截 (403)
    code, res = request_with_role(f"{BASE_URL}/api/products/1/save_npi_bom", {
        "bom_items": []
    }, "Quality Engineer")
    print(f"【测试 3】质量工程师修改 BOM -> 状态码: {code}, 响应: {res}")
    assert code == 403, "【错误】质量工程师修改 BOM 未被拦截！"
    print("【成功】质量工程师修改 BOM 拦截通过！")

    # 用工艺工程师保存 BOM，预期通过 (200)
    code, res = request_with_role(f"{BASE_URL}/api/products/1/save_npi_bom", {
        "bom_version": "V1.0",
        "bom_items": [
            {"material_code": "MAT-CU-001", "material_name": "高纯铜线", "material_spec": "99.99%级", "ratio_value": 90, "unit": "%"}
        ]
    }, "Process Engineer")
    print(f"【测试 4】工艺工程师修改 BOM -> 状态码: {code}, 响应: {res}")
    assert code == 200, "【错误】工艺工程师修改 BOM 被无故拦截！"
    print("【成功】工艺工程师修改 BOM 通过！")

    print("\n=============================================")
    print(" 恭喜！用户角色与 API 权限拦截规则测试全部 (PASS)！")
    print("=============================================")

if __name__ == "__main__":
    run_tests()
