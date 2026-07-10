import urllib.request
import json
import time

BASE_URL = "http://localhost:8080"

def test_three_modules_and_npi_workflow():
    print("开始高频铜箔 NPI 新品开发流程及三模块级联自动测试...")
    
    # 1. 验证产品详情是否深度集成了 TDS、BOM、Routing 和 NPI 流程
    try:
        response = urllib.request.urlopen(f"{BASE_URL}/api/products/1")
        prod = json.loads(response.read().decode('utf-8'))
        print(f"【成功】获取产品 {prod['code']} 详情，状态为: {prod['status']}")
        
        # 1.1 验证 NPI 联动数据结构存在
        assert "npi_workflow" in prod, "NPI 工作流数据未在详情中返回"
        npi = prod["npi_workflow"]
        assert "gate1" in npi and "gate2" in npi and "gate3" in npi and "gate4" in npi and "gate5" in npi, "NPI 门禁阶段不完整"
        print(f"【验证】NPI 5大门禁数据验证通过，当前 G1 状态: {npi['gate1']['status']}, G3 状态: {npi['gate3']['status']}")
        
        # 1.2 验证 Gate 1 里程碑负责人
        assert npi["gate1"]["data"]["owner"] == "李建国", "Gate 1 里程碑负责人联动异常"
        print(f"【验证】Gate 1 里程碑负责人联动正确: {npi['gate1']['data']['owner']}")
        
        # 1.3 验证配方 BOM 存在且有版本，并与 Gate 2 项目负责人联动
        assert "bom" in prod and prod["bom"] is not None, "活动 BOM 不存在"
        assert npi["gate2"]["data"]["owner"] == "张小贤", "Gate 2 里程碑负责人联动异常"
        print(f"【验证】Gate 2 里程碑负责人联动正确: {npi['gate2']['data']['owner']}")
        
        initial_bom_count = len(prod['bom_list'])
        initial_active_bom_id = prod['bom']['id']
    except Exception as e:
        print(f"【失败】NPI/TDS/BOM/Routing 模块联动性初验失败: {e}")
        return

    # 2. 模拟在“协同配置调试台”上批准配方设变 ECN-20260705-001
    try:
        approve_data = json.dumps({
            "instance_id": "MOCK-INSTANCE-ECN-002",
            "action": "AGREE",
            "approver": "高频研发部总监",
            "comment": "设变论证通过，予以批准并自动升级配方BOM版本。"
        }).encode('utf-8')
        
        req = urllib.request.Request(
            f"{BASE_URL}/api/dingtalk/approve",
            data=approve_data,
            headers={'Content-Type': 'application/json'}
        )
        response = urllib.request.urlopen(req)
        res_data = json.loads(response.read().decode('utf-8'))
        print(f"【成功】模拟设变审批通过: {res_data['message']}")
    except Exception as e:
        print(f"【失败】执行设变审批异常: {e}")
        return

    # 3. 验证 ECN 批准后的 NPI 模块级联响应
    try:
        time.sleep(0.5)
        response = urllib.request.urlopen(f"{BASE_URL}/api/products/1")
        prod = json.loads(response.read().decode('utf-8'))
        npi = prod["npi_workflow"]
        
        # 3.1 验证是否自动复制并生成了 V1.1 版本活动 BOM，并在 Gate 2 成功联动更新
        new_bom = prod['bom']
        print(f"新BOM版本: {new_bom['version']}，Gate 2 联动负责人: {npi['gate2']['data']['owner']}")
        assert new_bom['version'] == "V1.1", "配方BOM未自动完成版本升级"
        print("【成功】Gate 2 配方定型门禁数据同步升级至 V1.1 新参数！")
    except Exception as e:
        print(f"【失败】ECN批准后 NPI 级联验证异常: {e}")
        return

    # 4. 验证 NPI Gate 5 阶段“导入量产发布”动作与联结状态推进
    # 采用 HIS 载体铜箔 (产品 2) 来进行测试，因为其前 4 关已全部达标（有合格的质检报告）
    try:
        response = urllib.request.urlopen(f"{BASE_URL}/api/products/2")
        prod2 = json.loads(response.read().decode('utf-8'))
        
        print(f"【验证】产品 {prod2['code']} 当前状态为: {prod2['status']}，测试通过结论: {prod2['test_records'][0]['test_result']}")
        assert prod2["npi_workflow"]["gate5"]["status"] == "RUNNING", "量产导入 Gate 5 未就绪 (当前状态并非 RUNNING)"
        
        # 4.1 发起导入量产发布
        req = urllib.request.Request(
            f"{BASE_URL}/api/products/2/import_production",
            data=b"{}",
            headers={'Content-Type': 'application/json'}
        )
        response = urllib.request.urlopen(req)
        res_data = json.loads(response.read().decode('utf-8'))
        print(f"【成功】产品 {prod2['code']} 提报量产发布接口返回: {res_data['message']}")
        
        # 4.2 验证状态和 Gate 5 门禁归档
        response = urllib.request.urlopen(f"{BASE_URL}/api/products/2")
        prod2_updated = json.loads(response.read().decode('utf-8'))
        
        print(f"产品最新状态: {prod2_updated['status']}，Gate 5 状态: {prod2_updated['npi_workflow']['gate5']['status']}")
        assert prod2_updated["status"] == "量产中", "产品未成功推入 '量产中' 状态"
        assert prod2_updated["npi_workflow"]["gate5"]["status"] == "COMPLETED", "Gate 5 门禁未成功闭环归档"
        print("【成功】量产导入全流程流跑正常！NPI 第 5 里程碑门禁完成封档归档。")
    except Exception as e:
        print(f"【失败】NPI Gate 5 量产发布流程异常: {e}")
        return

    # 5. 验证点击 Gate 2 卡片弹窗在线编辑并保存配方的级联流转
    try:
        save_bom_data = json.dumps({
            "items": [
                { "material_code": "MAT-CU-001", "material_name": "高纯铜线", "material_spec": "99.99%级", "ratio_value": 99.80, "unit": "%" },
                { "material_code": "MAT-ACID-001", "material_name": "电子级硫酸", "material_spec": "98%浓度", "ratio_value": 0.20, "unit": "%" },
                { "material_code": "AD-GEL-01", "material_name": "特种明胶骨胶", "material_spec": "生箔添加剂", "ratio_value": 4.8, "unit": "ppm" },
                { "material_code": "AD-HEC-01", "material_name": "羟乙基纤维素", "material_spec": "生箔添加剂", "ratio_value": 3.5, "unit": "ppm" },
                { "material_code": "AD-SPS-01", "material_name": "活性硫整平剂", "material_spec": "生箔添加剂", "ratio_value": 8.5, "unit": "ppm" },
                { "material_code": "MAT-SILANE-203", "material_name": "常规硅烷偶联剂", "material_spec": "环保硅烷SL-203", "ratio_value": 0.75, "unit": "%" }
            ],
            "updater": "李工"
        }).encode('utf-8')
        
        req = urllib.request.Request(
            f"{BASE_URL}/api/products/1/save_bom",
            data=save_bom_data,
            headers={'Content-Type': 'application/json'}
        )
        response = urllib.request.urlopen(req)
        res_data = json.loads(response.read().decode('utf-8'))
        print(f"【成功】在线保存配方BOM接口返回: {res_data['message']}")
        
        # 再次获取产品，验证版本是否升级到了 V1.2 且参数应用
        response = urllib.request.urlopen(f"{BASE_URL}/api/products/1")
        prod1_updated = json.loads(response.read().decode('utf-8'))
        
        print(f"最新活动BOM版本: {prod1_updated['bom']['version']}，明胶: {prod1_updated['bom']['additive_gel']} ppm，活性硫: {prod1_updated['bom']['additive_s']} ppm")
        assert prod1_updated["bom"]["version"] == "V1.2", "配方在线保存后，BOM 版本未升级为 V1.2"
        assert prod1_updated["bom"]["additive_gel"] == 4.8, "在线修改的明胶值未生效"
        assert prod1_updated["bom"]["additive_s"] == 8.5, "在线修改的活性硫值未生效"
        print("【成功】Gate 2 点击穿透并就地在线编辑保存配方验证通过！BOM 成功版本升级。")
    except Exception as e:
        print(f"【失败】NPI Gate 2 在线修改配方流程异常: {e}")
        return

    # 6. 验证工艺路线 (Routing) 的在线设计发布与版本管控升级
    try:
        save_routing_data = json.dumps({
            "steps": [
                {
                    "stage_name": "溶铜工段",
                    "device_name": "主溶铜设备A",
                    "device_code": "EQ-溶铜-A",
                    "standard_params": { "Cu_conc": 86.5, "H2SO4_conc": 108.0, "temp": 82.0, "flow_rate": 460.0, "Cl_conc": 33.0 }
                },
                {
                    "stage_name": "生箔工段",
                    "device_name": "特种生箔设备B",
                    "device_code": "EQ-生箔-B",
                    "standard_params": { "voltage": 6.9, "current_density": 67.0, "drum_speed": 4.8 }
                }
            ]
        }).encode('utf-8')
        
        req = urllib.request.Request(
            f"{BASE_URL}/api/products/1/save_routing",
            data=save_routing_data,
            headers={'Content-Type': 'application/json'}
        )
        response = urllib.request.urlopen(req)
        res_data = json.loads(response.read().decode('utf-8'))
        print(f"【成功】在线设计发布工艺路线接口返回: {res_data['message']}")
        
        # 再次获取产品，验证活动版本是否升级为了 R1.1
        response = urllib.request.urlopen(f"{BASE_URL}/api/products/1")
        prod1_updated = json.loads(response.read().decode('utf-8'))
        
        active_routing = prod1_updated["routing"]
        routing_history = prod1_updated["routing_history"]
        
        print(f"当前活动工艺路线步骤数: {len(active_routing)}，已存在的所有工艺版本: {list(routing_history.keys())}")
        assert len(active_routing) == 2, "全新发布的工艺路线步骤数不匹配 (期待 2 步)"
        assert active_routing[0]["device_code"] == "EQ-溶铜-A", "第一步机台代号更新失败"
        assert "R1.1" in routing_history and "R1.0" in routing_history, "工艺历史版本链缺失"
        assert routing_history["R1.1"][0]["status"] == "活动", "新版本工艺状态非活动"
        assert routing_history["R1.0"][0]["status"] == "历史", "旧版本工艺状态未级联置为历史归档"
        print("【成功】工艺路线在线设计、保存升级与多版本回溯数据库联动验证通过！")
    except Exception as e:
        print(f"【失败】工艺路线版本保存升级流程异常: {e}")
        return

    # 7. 验证保存和更新 Gate 里程碑排期与负责人的 save_npi_plan 接口
    try:
        save_plan_data = json.dumps({
            "gate_key": "gate1",
            "start_date": "2026-07-02",
            "plan_end_date": "2026-07-06",
            "owner": "王经理"
        }).encode('utf-8')
        
        req = urllib.request.Request(
            f"{BASE_URL}/api/products/1/save_npi_plan",
            data=save_plan_data,
            headers={'Content-Type': 'application/json'}
        )
        response = urllib.request.urlopen(req)
        res_data = json.loads(response.read().decode('utf-8'))
        print(f"【成功】在线修改NPI里程碑排期负责人接口返回: {res_data['message']}")
        
        # 再次获取产品，验证 G1 负责人是否变更为“王经理”，排期是否生效
        response = urllib.request.urlopen(f"{BASE_URL}/api/products/1")
        prod1_updated = json.loads(response.read().decode('utf-8'))
        
        g1_data = prod1_updated["npi_workflow"]["gate1"]["data"]
        print(f"修改后的 G1 负责人: {g1_data['owner']}，排期: {g1_data['start_date']} 至 {g1_data['plan_end_date']}")
        assert g1_data["owner"] == "王经理", "G1 负责人更新失败"
        assert g1_data["start_date"] == "2026-07-02", "G1 开始时间更新失败"
        assert g1_data["plan_end_date"] == "2026-07-06", "G1 结束时间更新失败"
        print("【成功】NPI 门禁看板里程碑排期与负责人在线保存、级联响应验证成功！")
    except Exception as e:
        print(f"【失败】NPI里程碑计划排期更新流程异常: {e}")
        return

    # 8. 验证用户与角色权限管理模块的 API 接口 (CRUD 及演示数据保护)
    try:
        print("开始验证用户权限管理模块的 API 流程...")
        
        # 8.1 获取用户列表
        req = urllib.request.Request(
            f"{BASE_URL}/api/users",
            headers={'X-User-Role': 'Admin'}
        )
        response = urllib.request.urlopen(req)
        users = json.loads(response.read().decode('utf-8'))
        assert len(users) >= 5, "内置种子用户数量不正确"
        admin_user = next((u for u in users if u['username'] == 'admin'), None)
        assert admin_user is not None, "未找到内置 admin 用户"
        print(f"【成功】读取用户列表通过，当前系统共有 {len(users)} 个用户")

        # 8.2 新增临时测试用户
        add_user_data = json.dumps({
            "username": "pe_test",
            "display_name": "测试工艺员",
            "role": "Process Engineer"
        }).encode('utf-8')
        req = urllib.request.Request(
            f"{BASE_URL}/api/users",
            data=add_user_data,
            headers={'Content-Type': 'application/json', 'X-User-Role': 'Admin'}
        )
        response = urllib.request.urlopen(req)
        res_data = json.loads(response.read().decode('utf-8'))
        print(f"【成功】创建测试用户通过: {res_data['message']}")

        # 获取新增的测试用户 ID
        req = urllib.request.Request(
            f"{BASE_URL}/api/users",
            headers={'X-User-Role': 'Admin'}
        )
        response = urllib.request.urlopen(req)
        users = json.loads(response.read().decode('utf-8'))
        test_user = next((u for u in users if u['username'] == 'pe_test'), None)
        assert test_user is not None, "临时测试用户 pe_test 未成功入库"
        test_user_id = test_user['id']

        # 8.3 编辑测试用户
        edit_user_data = json.dumps({
            "display_name": "测试工程师(改)",
            "role": "Process Engineer",
            "status": "启用"
        }).encode('utf-8')
        req = urllib.request.Request(
            f"{BASE_URL}/api/users/{test_user_id}/edit",
            data=edit_user_data,
            headers={'Content-Type': 'application/json', 'X-User-Role': 'Admin'}
        )
        response = urllib.request.urlopen(req)
        res_data = json.loads(response.read().decode('utf-8'))
        print(f"【成功】编辑测试用户通过: {res_data['message']}")

        # 验证修改是否生效
        req = urllib.request.Request(
            f"{BASE_URL}/api/users",
            headers={'X-User-Role': 'Admin'}
        )
        response = urllib.request.urlopen(req)
        users = json.loads(response.read().decode('utf-8'))
        test_user = next((u for u in users if u['id'] == test_user_id), None)
        assert test_user['display_name'] == "测试工程师(改)", "用户显示名修改未生效"

        # 8.4 验证内置演示账号安全保护 (试图删除 pm_zhang 应被拒绝)
        pm_zhang_user = next((u for u in users if u['username'] == 'pm_zhang'), None)
        assert pm_zhang_user is not None, "未找到内置 pm_zhang 用户"
        try:
            req = urllib.request.Request(
                f"{BASE_URL}/api/users/{pm_zhang_user['id']}/delete",
                data=b"",
                headers={'X-User-Role': 'Admin'}
            )
            urllib.request.urlopen(req)
            assert False, "系统不应该允许删除内置演示种子账号"
        except urllib.error.HTTPError as e:
            assert e.code == 400, f"非预期的 HTTP 错误状态码: {e.code}"
            err_msg = json.loads(e.read().decode('utf-8'))
            print(f"【成功】内置演示账号删除保护验证通过，拦截提示: {err_msg['error']}")

        # 8.5 正常删除临时测试用户
        req = urllib.request.Request(
            f"{BASE_URL}/api/users/{test_user_id}/delete",
            data=b"",
            headers={'X-User-Role': 'Admin'}
        )
        response = urllib.request.urlopen(req)
        res_data = json.loads(response.read().decode('utf-8'))
        print(f"【成功】删除临时测试用户通过: {res_data['message']}")

        # 再次获取用户列表，验证已不存在该临时用户
        req = urllib.request.Request(
            f"{BASE_URL}/api/users",
            headers={'X-User-Role': 'Admin'}
        )
        response = urllib.request.urlopen(req)
        users = json.loads(response.read().decode('utf-8'))
        test_user_deleted = next((u for u in users if u['username'] == 'pe_test'), None)
        assert test_user_deleted is None, "临时测试用户 pe_test 删除后依旧残留"
        print("【成功】用户与角色权限管理模块 CRUD 接口及安全保护全流程验证通过！")

    except Exception as e:
        print(f"【失败】用户与角色权限管理 API 验证发生异常: {e}")
        return

    print("==========================================================")
    print(" 恭喜！高频铜箔 NPI 流程与三管控模块级联自动化测试全部合格 (PASS)！")
    print("==========================================================")

if __name__ == "__main__":
    test_three_modules_and_npi_workflow()
