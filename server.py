import http.server
import socketserver
import webbrowser
import threading
import time
import os
import sqlite3
import json
import urllib.parse
import re
from datetime import datetime, timedelta

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(DIRECTORY, "plm.db")

class PLMRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def get_db(self):
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

    def send_json(self, data, status_code=200):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        
        if path.startswith("/api/"):
            self.handle_api_get(path, urllib.parse.parse_qs(parsed_url.query))
        else:
            super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        
        if path.startswith("/api/"):
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = b""
            if content_length > 0:
                post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8')) if post_data else {}
            except Exception as e:
                self.send_json({"error": f"Invalid JSON: {str(e)}"}, 400)
                return
                
            self.handle_api_post(path, data)
        else:
            self.send_error(404, "Not Found")

    # === API GET 请求处理 ===
    def handle_api_get(self, path, query_params):
        conn = self.get_db()
        cursor = conn.cursor()

        try:
            # 1. 获取所有产品列表
            if path == "/api/products":
                category = query_params.get('category', [None])[0]
                status = query_params.get('status', [None])[0]
                
                sql = "SELECT * FROM products WHERE 1=1"
                args = []
                if category:
                    sql += " AND category = ?"
                    args.append(category)
                if status:
                    sql += " AND status = ?"
                    args.append(status)
                sql += " ORDER BY id DESC"
                
                cursor.execute(sql, args)
                products = [dict(row) for row in cursor.fetchall()]
                self.send_json(products)

            # 2. 获取单个产品详情 (深度集成 TDS, BOM版本, Routing工艺路线)
            elif path.startswith("/api/products/"):
                try:
                    product_id = int(path.split("/")[-1])
                except ValueError:
                    self.send_json({"error": "Invalid product ID"}, 400)
                    return
                
                cursor.execute("SELECT * FROM products WHERE id = ?", (product_id,))
                prod_row = cursor.fetchone()
                if not prod_row:
                    self.send_json({"error": "Product not found"}, 404)
                    return
                
                product = dict(prod_row)
                
                # 反序列化 npi_project_plan 并处理向下兼容
                if product.get('npi_project_plan'):
                    try:
                        product['npi_project_plan'] = json.loads(product['npi_project_plan'])
                    except:
                        product['npi_project_plan'] = {}
                else:
                    product['npi_project_plan'] = {}
                
                # 向下兼容默认排期配置
                base_time = None
                created_val = product.get('created_at')
                if isinstance(created_val, datetime):
                    base_time = created_val
                elif isinstance(created_val, str):
                    try:
                        base_time = datetime.strptime(created_val.split('.')[0], "%Y-%m-%d %H:%M:%S")
                    except:
                        try:
                            base_time = datetime.strptime(created_val, "%Y-%m-%d")
                        except:
                            pass
                if not base_time:
                    base_time = datetime.now()
                default_plan = {
                    "gate1": { "start_date": base_time.strftime("%Y-%m-%d"), "plan_end_date": (base_time + timedelta(days=5)).strftime("%Y-%m-%d"), "owner": product['creator'] },
                    "gate2": { "start_date": (base_time + timedelta(days=6)).strftime("%Y-%m-%d"), "plan_end_date": (base_time + timedelta(days=12)).strftime("%Y-%m-%d"), "owner": "李建国" },
                    "gate3": { "start_date": (base_time + timedelta(days=13)).strftime("%Y-%m-%d"), "plan_end_date": (base_time + timedelta(days=25)).strftime("%Y-%m-%d"), "owner": "赵立功" },
                    "gate4": { "start_date": (base_time + timedelta(days=26)).strftime("%Y-%m-%d"), "plan_end_date": (base_time + timedelta(days=35)).strftime("%Y-%m-%d"), "owner": "钱品质" },
                    "gate5": { "start_date": (base_time + timedelta(days=36)).strftime("%Y-%m-%d"), "plan_end_date": (base_time + timedelta(days=45)).strftime("%Y-%m-%d"), "owner": "孙生产" }
                }
                for g_key, g_val in default_plan.items():
                    if g_key not in product['npi_project_plan']:
                        product['npi_project_plan'][g_key] = g_val
                
                # 获取该产品的所有工艺路线版本基准数据
                cursor.execute("SELECT * FROM product_routing WHERE product_id = ? ORDER BY routing_version DESC, step_no ASC", (product_id,))
                all_routings = []
                for row in cursor.fetchall():
                    item = dict(row)
                    try:
                        item['standard_params'] = json.loads(item['standard_params'])
                    except:
                        pass
                    try:
                        item['custom_params'] = json.loads(item.get('custom_params') or '[]')
                    except:
                        item['custom_params'] = []
                    all_routings.append(item)
                
                # 过滤当前活动版本
                product['routing'] = [r for r in all_routings if r['status'] == '活动']
                
                # 按版本聚合分组
                routing_history = {}
                for r in all_routings:
                    ver = r['routing_version']
                    if ver not in routing_history:
                        routing_history[ver] = []
                    routing_history[ver].append(r)
                product['routing_history'] = routing_history

                # 获取 TDS 版本历史
                cursor.execute("SELECT * FROM product_tds WHERE product_id = ? ORDER BY created_at DESC", (product_id,))
                tds_list = []
                for row in cursor.fetchall():
                    tds_item = dict(row)
                    try:
                        tds_item['tds_items'] = json.loads(tds_item['tds_items'])
                    except:
                        tds_item['tds_items'] = []
                    tds_list.append(tds_item)
                product['tds_list'] = tds_list
                product['tds'] = next((t for t in tds_list if t['status'] == '活动'), None)

                # 获取该产品的当前活动版本 BOM 配方
                cursor.execute("SELECT * FROM product_bom WHERE product_id = ? AND status = '活动' ORDER BY id DESC LIMIT 1", (product_id,))
                active_bom_row = cursor.fetchone()
                if active_bom_row:
                    bom_dict = dict(active_bom_row)
                    if bom_dict.get('bom_items'):
                        try:
                            bom_dict['bom_items'] = json.loads(bom_dict['bom_items'])
                        except:
                            bom_dict['bom_items'] = []
                    else:
                        bom_dict['bom_items'] = [
                            { "material_code": "MAT-CU-001", "material_name": "高纯铜线", "material_spec": "99.99%级", "ratio_value": bom_dict.get('copper_wire_ratio', 99.8), "unit": "%" },
                            { "material_code": "MAT-ACID-001", "material_name": "电子级硫酸", "material_spec": "98%浓度", "ratio_value": bom_dict.get('sulfuric_acid_ratio', 0.2), "unit": "%" },
                            { "material_code": "AD-GEL-01", "material_name": "特种明胶骨胶", "material_spec": "生箔添加剂", "ratio_value": bom_dict.get('additive_gel', 5.0), "unit": "ppm" },
                            { "material_code": "AD-HEC-01", "material_name": "羟乙基纤维素", "material_spec": "生箔添加剂", "ratio_value": bom_dict.get('additive_hec', 3.0), "unit": "ppm" },
                            { "material_code": "AD-SPS-01", "material_name": "活性硫整平剂", "material_spec": "生箔添加剂", "ratio_value": bom_dict.get('additive_s', 7.5), "unit": "ppm" },
                            { "material_code": "MAT-SILANE-203", "material_name": "常规硅烷偶联剂", "material_spec": bom_dict.get('silane_type', '常规硅烷-201'), "ratio_value": bom_dict.get('silane_conc', 0.8), "unit": "%" }
                        ]
                    product['bom'] = bom_dict
                else:
                    product['bom'] = None

                # 获取该产品的全部历史 BOM 版本
                cursor.execute("SELECT * FROM product_bom WHERE product_id = ? ORDER BY version DESC", (product_id,))
                bom_list = []
                for row in cursor.fetchall():
                    bom_dict = dict(row)
                    if bom_dict.get('bom_items'):
                        try:
                            bom_dict['bom_items'] = json.loads(bom_dict['bom_items'])
                        except:
                            bom_dict['bom_items'] = []
                    else:
                        bom_dict['bom_items'] = [
                            { "material_code": "MAT-CU-001", "material_name": "高纯铜线", "material_spec": "99.99%级", "ratio_value": bom_dict.get('copper_wire_ratio', 99.8), "unit": "%" },
                            { "material_code": "MAT-ACID-001", "material_name": "电子级硫酸", "material_spec": "98%浓度", "ratio_value": bom_dict.get('sulfuric_acid_ratio', 0.2), "unit": "%" },
                            { "material_code": "AD-GEL-01", "material_name": "特种明胶骨胶", "material_spec": "生箔添加剂", "ratio_value": bom_dict.get('additive_gel', 5.0), "unit": "ppm" },
                            { "material_code": "AD-HEC-01", "material_name": "羟乙基纤维素", "material_spec": "生箔添加剂", "ratio_value": bom_dict.get('additive_hec', 3.0), "unit": "ppm" },
                            { "material_code": "AD-SPS-01", "material_name": "活性硫整平剂", "material_spec": "生箔添加剂", "ratio_value": bom_dict.get('additive_s', 7.5), "unit": "ppm" },
                            { "material_code": "MAT-SILANE-203", "material_name": "常规硅烷偶联剂", "material_spec": bom_dict.get('silane_type', '常规硅烷-201'), "ratio_value": bom_dict.get('silane_conc', 0.8), "unit": "%" }
                        ]
                    bom_list.append(bom_dict)
                product['bom_list'] = bom_list

                # 获取该产品的工艺实际试制日志
                cursor.execute("SELECT * FROM development_logs WHERE product_id = ? ORDER BY created_at ASC", (product_id,))
                logs = []
                for row in cursor.fetchall():
                    log_item = dict(row)
                    try:
                        log_item['parameters'] = json.loads(log_item['parameters'])
                    except:
                        pass
                    logs.append(log_item)
                product['development_logs'] = logs

                # 获取物理与高频性能测试报告
                cursor.execute("SELECT * FROM test_records WHERE product_id = ? ORDER BY created_at DESC", (product_id,))
                product['test_records'] = [dict(row) for row in cursor.fetchall()]

                # 获取关联的 ECN 历史
                cursor.execute("SELECT * FROM ecn_records WHERE product_id = ? ORDER BY created_at DESC", (product_id,))
                ecns = []
                for row in cursor.fetchall():
                    ecn_item = dict(row)
                    try:
                        ecn_item['risk_assessment'] = json.loads(ecn_item['risk_assessment'])
                    except:
                        pass
                    ecns.append(ecn_item)
                product['ecn_records'] = ecns

                # 计算 NPI 门禁阶段动态数据 (与 TDS, BOM, Routing 深度联动)
                npi = {}
                prod_status = product['status']
                category = product['category']
                stages = ["立项", "溶铜工段", "生箔工段", "表面处理工段", "分切工段", "测试验证", "量产送样"]
                if category == "HIS 载体铜箔":
                    stages = ["立项", "溶铜工段", "溅镀工段", "生箔工段", "表面处理工段", "分切工段", "测试验证", "量产送样"]
                
                # 当前状态所在的工序索引
                active_idx = 0
                if prod_status == "立项中" or prod_status == "钉钉立项审批中":
                    active_idx = 0
                elif prod_status == "溶铜造液中":
                    active_idx = stages.index("溶铜工段")
                elif prod_status == "溅镀开发中" and "溅镀工段" in stages:
                    active_idx = stages.index("溅镀工段")
                elif prod_status == "生箔电镀中":
                    active_idx = stages.index("生箔工段")
                elif prod_status == "表面处理中":
                    active_idx = stages.index("表面处理工段")
                elif prod_status == "分切包装中":
                    active_idx = stages.index("分切工段")
                elif prod_status == "测试验证中":
                    active_idx = stages.index("测试验证")
                elif prod_status == "量产中":
                    active_idx = stages.index("量产送样")

                plan = product.get('npi_project_plan', {})
                def get_gate_data(g_key):
                    g_plan = plan.get(g_key, {})
                    return {
                        "start_date": g_plan.get("start_date", ""),
                        "plan_end_date": g_plan.get("plan_end_date", ""),
                        "owner": g_plan.get("owner", "")
                    }

                # 1. Gate 1: 概念设计与立项
                gate1 = {"status": "LOCKED", "title": "概念设计与立项", "data": get_gate_data("gate1")}
                if prod_status == "立项中":
                    gate1["status"] = "RUNNING"
                elif prod_status == "钉钉立项审批中":
                    gate1["status"] = "APPROVING"
                else:
                    gate1["status"] = "COMPLETED"
                npi["gate1"] = gate1

                # 2. Gate 2: 配方设计与定型
                gate2 = {"status": "LOCKED", "title": "添加剂配方定型", "data": get_gate_data("gate2")}
                if active_idx > 0:
                    cursor.execute("SELECT * FROM ecn_records WHERE product_id = ? AND status = '钉钉审批中' LIMIT 1", (product_id,))
                    ecn_running = cursor.fetchone()
                    if ecn_running:
                        gate2["status"] = "RUNNING"  # 设变进行中
                    else:
                        gate2["status"] = "COMPLETED"
                npi["gate2"] = gate2

                # 3. Gate 3: 工艺路线与现场中试
                gate3 = {"status": "LOCKED", "title": "工艺路径与中试", "data": get_gate_data("gate3")}
                if active_idx > 0:
                    if active_idx < stages.index("测试验证"):
                        gate3["status"] = "RUNNING"
                    else:
                        gate3["status"] = "COMPLETED"
                npi["gate3"] = gate3

                # 4. Gate 4: 理化与高频验证
                gate4 = {"status": "LOCKED", "title": "品质理化验证", "data": get_gate_data("gate4")}
                if active_idx >= stages.index("测试验证"):
                    gate4["status"] = "RUNNING"
                    if len(product['test_records']) > 0:
                        latest_test = product['test_records'][0]
                        if latest_test["test_result"] == "合格":
                            gate4["status"] = "COMPLETED"
                        else:
                            gate4["status"] = "FAILED"
                npi["gate4"] = gate4

                # 5. Gate 5: 客户送样与量产
                gate5 = {"status": "LOCKED", "title": "PPAP送样与量产", "data": {}}
                if prod_status == "量产中":
                    gate5["status"] = "COMPLETED"
                elif active_idx >= stages.index("测试验证") and len(product['test_records']) > 0 and product['test_records'][0]["test_result"] == "合格":
                    gate5["status"] = "RUNNING"
                npi["gate5"] = gate5

                product['npi_workflow'] = npi

                self.send_json(product)

            # 3. 获取所有 ECN 列表
            elif path == "/api/ecns":
                cursor.execute("""
                    SELECT e.*, p.code as product_code, p.name as product_name 
                    FROM ecn_records e 
                    JOIN products p ON e.product_id = p.id 
                    ORDER BY e.id DESC
                """)
                ecns = []
                for row in cursor.fetchall():
                    ecn_item = dict(row)
                    try:
                        ecn_item['risk_assessment'] = json.loads(ecn_item['risk_assessment'])
                    except:
                        pass
                    ecns.append(ecn_item)
                self.send_json(ecns)

            # 4. 获取钉钉配置
            elif path == "/api/dingtalk/settings":
                cursor.execute("SELECT * FROM dingtalk_settings ORDER BY id DESC LIMIT 1")
                settings = dict(cursor.fetchone())
                self.send_json(settings)

            # 5. 获取钉钉待处理与历史审批记录列表 (用于协同开发控制台)
            elif path == "/api/dingtalk/approvals":
                cursor.execute("SELECT * FROM dingtalk_logs ORDER BY created_at DESC")
                logs = []
                for row in cursor.fetchall():
                    item = dict(row)
                    try:
                        item['content'] = json.loads(item['content'])
                    except:
                        pass
                    logs.append(item)
                self.send_json(logs)
            
            else:
                self.send_json({"error": "Endpoint not found"}, 404)

        except Exception as e:
            self.send_json({"error": str(e)}, 500)
        finally:
            conn.close()

    # === API POST 请求处理 ===
    def handle_api_post(self, path, data):
        # 角色与权限控制逻辑
        user_role = self.headers.get('X-User-Role', 'Admin')
        
        # 默认只读访客拒绝所有写操作
        if user_role == 'Viewer':
            self.send_json({"error": "权限不足：当前角色【只读访客】无权进行任何写操作，请在右上角切换身份。"}, 403)
            return

        # 权限矩阵映射关系
        path_permissions = {
            "/api/products": {"Admin", "Product Manager"}, # 新品研发立项
        }

        # 包含判断的后缀权限映射
        has_permission = True
        required_roles = set()

        if path == "/api/products":
            required_roles = {"Admin", "Product Manager"}
        elif path.endswith("/save_plan") and "/products/" in path:
            required_roles = {"Admin", "Product Manager"}
        elif (path.endswith("/save_tds_rows") or path.endswith("/publish_tds") or path.endswith("/save_tds")) and "/products/" in path:
            required_roles = {"Admin", "Process Engineer", "Quality Engineer"}
        elif (path.endswith("/save_npi_bom") or path.endswith("/save_bom")) and "/products/" in path:
            required_roles = {"Admin", "Process Engineer"}
        elif (path.endswith("/save_routing") or path.endswith("/update_routing_step")) and "/products/" in path:
            required_roles = {"Admin", "Process Engineer"}
        elif path.endswith("/test") and "/products/" in path:
            required_roles = {"Admin", "Process Engineer", "Quality Engineer"}
        elif path.endswith("/log") and "/products/" in path:
            required_roles = {"Admin", "Process Engineer", "Quality Engineer"}
        elif path == "/api/ecns" or path.endswith("/submit_dingtalk"):
            required_roles = {"Admin", "Process Engineer"}
        elif "/dingtalk/" in path:
            required_roles = {"Admin"}

        if required_roles and user_role not in required_roles:
            role_names_map = {
                "Admin": "超级管理员",
                "Product Manager": "产品经理",
                "Process Engineer": "工艺工程师",
                "Quality Engineer": "质量工程师"
            }
            role_name_zh = role_names_map.get(user_role, user_role)
            self.send_json({"error": f"权限不足：当前角色【{role_name_zh}】无此操作权限，请切换到合适的角色重试。"}, 403)
            return

        conn = self.get_db()
        cursor = conn.cursor()

        try:
            # 1. 新品研发立项申请
            if path == "/api/products":
                code = data.get('code')
                name = data.get('name')
                category = data.get('category')
                spec_thickness = float(data.get('spec_thickness', 0))
                target_roughness = float(data.get('target_roughness', 0))
                target_peel = float(data.get('target_peel', 0))
                target_df = float(data.get('target_df', 0))
                target_tensile = float(data.get('target_tensile', 310.0))
                target_elongation = float(data.get('target_elongation', 2.5))
                creator = data.get('creator', '研发部')

                if not code or not name or not category:
                    self.send_json({"error": "产品代号、名称及类别不能为空"}, 400)
                    return

                try:
                    # 1.1 写入 products 产品主数据
                    cursor.execute("""
                    INSERT INTO products (code, name, category, spec_thickness, target_roughness, target_peel, target_df, target_tensile, target_elongation, status, creator, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (code, name, category, spec_thickness, target_roughness, target_peel, target_df, target_tensile, target_elongation, "立项中", creator, datetime.now(), datetime.now()))
                    product_id = cursor.lastrowid

                    # 1.2 写入 product_bom 初始默认配方 (BOM V1.0)
                    # 依据类别生成合理的添加剂基准配方值
                    gel_init = 5.2 if category == "PTS AI 铜箔" else (3.0 if category == "HIS 载体铜箔" else 5.5)
                    hec_init = 3.5 if category == "PTS AI 铜箔" else (4.0 if category == "HIS 载体铜箔" else 3.8)
                    s_init = 8.0 if category == "PTS AI 铜箔" else (6.5 if category == "HIS 载体铜箔" else 9.0)
                    silane_type = "环保硅烷SL-203" if category == "HIS 载体铜箔" else "常规硅烷-201"
                    silane_conc = 0.6 if category == "HIS 载体铜箔" else 0.8

                    cursor.execute("""
                    INSERT INTO product_bom (product_id, version, status, copper_wire_ratio, sulfuric_acid_ratio, additive_gel, additive_hec, additive_s, silane_type, silane_conc, updater, created_at)
                    VALUES (?, 'V1.0', '活动', 99.85, 0.15, ?, ?, ?, ?, ?, ?, ?)
                    """, (product_id, gel_init, hec_init, s_init, silane_type, silane_conc, creator, datetime.now()))

                    # 1.3 级联写入 product_routing 基准工艺路线工序步骤
                    # HIS 载体铜箔包含 5 道工段，其他的包含 4 道
                    if category == "HIS 载体铜箔":
                        routings = [
                            (1, "溶铜工段", "2#溶铜罐组", "EQ-溶铜-02", {"Cu_conc": 80.0, "H2SO4_conc": 120.0, "temp": 75.0, "flow_rate": 420.0, "Cl_conc": 30.0}),
                            (2, "溅镀工段", "磁控溅射镀膜机", "EQ-溅镀-01", {"vacuum": 0.0003, "power": 15.0, "speed": 8.0, "thickness": 50.0, "target_type": "高纯铜靶-镍铬阻挡层"}),
                            (3, "生箔工段", "4#超薄生箔机", "EQ-生箔-04", {"voltage": 7.0, "current_density": 60.0, "drum_speed": 8.0}),
                            (4, "表面处理工段", "3#表面处理机", "EQ-表处-03", {"line_speed": 8.0, "treat_current": 1200, "silane_conc": 0.6, "dry_temp": 120.0, "passivation_ph": 4.5}),
                            (5, "分切工段", "2#高精度分切机", "EQ-分切-02", {"tension": 150.0, "slit_speed": 100.0})
                        ]
                    else:
                        routings = [
                            (1, "溶铜工段", "1#溶铜罐组", "EQ-溶铜-01", {"Cu_conc": 85.0, "H2SO4_conc": 110.0, "temp": 80.0, "flow_rate": 450.0, "Cl_conc": 35.0}),
                            (2, "生箔工段", "2#生箔机阴极辊", "EQ-生箔-02", {"voltage": 6.8, "current_density": 65.0, "drum_speed": 5.0}),
                            (3, "表面处理工段", "2#表面处理机", "EQ-表处-02", {"line_speed": 12.0, "treat_current": 1800, "silane_conc": 0.8, "dry_temp": 130.0, "passivation_ph": 4.5}),
                            (4, "分切工段", "1#高精度分切机", "EQ-分切-01", {"tension": 220.0, "slit_speed": 150.0})
                        ]

                    for r in routings:
                        cursor.execute("""
                        INSERT INTO product_routing (product_id, step_no, stage_name, device_name, device_code, standard_params)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """, (product_id, r[0], r[1], r[2], r[3], json.dumps(r[4])))

                    conn.commit()
                    self.send_json({"message": "新品立项成功，TDS、初始BOM配方与工艺路线已自动级联配置", "product_id": product_id})
                except sqlite3.IntegrityError:
                    self.send_json({"error": f"产品代号 {code} 已存在，请重新输入"}, 400)

            # 2. 修改编辑产品 TDS 主数据限值
            elif path.endswith("/save_tds") and "/products/" in path:
                try:
                    product_id = int(path.split("/")[-2])
                except ValueError:
                    self.send_json({"error": "Invalid product ID"}, 400)
                    return

                target_roughness = float(data.get('target_roughness', 1.2))
                target_peel = float(data.get('target_peel', 0.7))
                target_df = float(data.get('target_df', 0.001))
                target_tensile = float(data.get('target_tensile', 310.0))
                target_elongation = float(data.get('target_elongation', 2.5))

                cursor.execute("""
                UPDATE products 
                SET target_roughness = ?, target_peel = ?, target_df = ?, target_tensile = ?, target_elongation = ?, updated_at = ?
                WHERE id = ?
                """, (target_roughness, target_peel, target_df, target_tensile, target_elongation, datetime.now(), product_id))
                conn.commit()
                self.send_json({"message": "产品 TDS 主数据限值保存成功"})

            # 3. 提交新品立项审批
            elif path.endswith("/submit_approval") and "/products/" in path:
                try:
                    product_id = int(path.split("/")[-2])
                except ValueError:
                    self.send_json({"error": "Invalid product ID"}, 400)
                    return

                cursor.execute("SELECT * FROM products WHERE id = ?", (product_id,))
                prod = cursor.fetchone()
                if not prod:
                    self.send_json({"error": "Product not found"}, 404)
                    return
                
                cursor.execute("UPDATE products SET status = '钉钉立项审批中', updated_at = ? WHERE id = ?", (datetime.now(), product_id))
                
                instance_id = f"DING-PROJ-{int(time.time())}-{product_id}"
                title = f"新品开发立项审批：{prod['name']} ({prod['code']})"
                content_dict = {
                    "code": prod['code'],
                    "name": prod['name'],
                    "category": prod['category'],
                    "spec_thickness": prod['spec_thickness'],
                    "target_roughness": prod['target_roughness'],
                    "target_peel": prod['target_peel'],
                    "target_df": prod['target_df'],
                    "creator": prod['creator'],
                    "submit_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                }
                
                cursor.execute("""
                INSERT INTO dingtalk_logs (instance_id, related_type, related_id, title, content, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (instance_id, "PRODUCT", product_id, title, json.dumps(content_dict), "RUNNING", datetime.now()))
                
                conn.commit()
                self.send_json({"message": "立项审批工作流已推送到钉钉", "instance_id": instance_id})

            # 4. 录入实际生产开发日志
            elif path.endswith("/logs") and "/products/" in path:
                try:
                    product_id = int(path.split("/")[-2])
                except ValueError:
                    self.send_json({"error": "Invalid product ID"}, 400)
                    return
                
                stage = data.get('stage')
                device_name = data.get('device_name')
                device_code = data.get('device_code')
                parameters = data.get('parameters', {})
                operator = data.get('operator', '操作工')
                remarks = data.get('remarks', '')

                if not stage or not device_name or not device_code:
                    self.send_json({"error": "工段、设备名和编码必填"}, 400)
                    return

                cursor.execute("""
                INSERT INTO development_logs (product_id, stage, device_name, device_code, parameters, operator, remarks, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (product_id, stage, device_name, device_code, json.dumps(parameters), operator, remarks, datetime.now()))
                
                status_map = {
                    "溶铜工段": "溶铜造液中",
                    "溅镀工段": "溅镀开发中",
                    "生箔工段": "生箔电镀中",
                    "表面处理工段": "表面处理中",
                    "分切工段": "分切包装中"
                }
                
                new_status = status_map.get(stage)
                if new_status:
                    cursor.execute("UPDATE products SET status = ?, updated_at = ? WHERE id = ?", (new_status, datetime.now(), product_id))

                conn.commit()
                self.send_json({"message": "生产工艺日志录入保存成功"})

            # 4.5 申请导入量产发布
            elif path.endswith("/import_production") and "/products/" in path:
                try:
                    product_id = int(path.split("/")[-2])
                except ValueError:
                    self.send_json({"error": "Invalid product ID"}, 400)
                    return

                cursor.execute("SELECT * FROM products WHERE id = ?", (product_id,))
                prod = cursor.fetchone()
                if not prod:
                    self.send_json({"error": "Product not found"}, 404)
                    return

                cursor.execute("UPDATE products SET status = '量产中', updated_at = ? WHERE id = ?", (datetime.now(), product_id))
                
                cursor.execute("""
                INSERT INTO development_logs (product_id, stage, device_name, device_code, parameters, operator, remarks, created_at)
                VALUES (?, '量产阶段', '研发部系统', 'SYS-NPI-RELEASE', '{"status":"APPROVED"}', '系统', 'NPI 5大门禁签核全部通过，产品正式发布导入量产交付阶段！', ?)
                """, (product_id, datetime.now()))

                conn.commit()
                self.send_json({"message": "NPI 门禁全部闭环，新品已成功导入量产并封档发布！"})

            # 4.6 在线保存/修改 BOM 并升级版本
            elif path.endswith("/save_bom") and "/products/" in path:
                try:
                    product_id = int(path.split("/")[-2])
                except ValueError:
                    self.send_json({"error": "Invalid product ID"}, 400)
                    return

                items = data.get('items')
                if not items:
                    copper_ratio = float(data.get('copper_wire_ratio', 99.85))
                    sulfuric_ratio = float(data.get('sulfuric_acid_ratio', 0.15))
                    gel_val = float(data.get('additive_gel', 5.0))
                    hec_val = float(data.get('additive_hec', 3.5))
                    s_val = float(data.get('additive_s', 8.0))
                    silane_type = data.get('silane_type', '常规硅烷-201')
                    silane_conc = float(data.get('silane_conc', 0.8))
                    items = [
                        { "material_code": "MAT-CU-001", "material_name": "高纯铜线", "material_spec": "99.99%级", "ratio_value": copper_ratio, "unit": "%" },
                        { "material_code": "MAT-ACID-001", "material_name": "电子级硫酸", "material_spec": "98%浓度", "ratio_value": sulfuric_ratio, "unit": "%" },
                        { "material_code": "AD-GEL-01", "material_name": "特种明胶骨胶", "material_spec": "生箔添加剂", "ratio_value": gel_val, "unit": "ppm" },
                        { "material_code": "AD-HEC-01", "material_name": "羟乙基纤维素", "material_spec": "生箔添加剂", "ratio_value": hec_val, "unit": "ppm" },
                        { "material_code": "AD-SPS-01", "material_name": "活性硫整平剂", "material_spec": "生箔添加剂", "ratio_value": s_val, "unit": "ppm" },
                        { "material_code": "MAT-SILANE-203", "material_name": "常规硅烷偶联剂", "material_spec": silane_type, "ratio_value": silane_conc, "unit": "%" }
                    ]

                copper_ratio = next((float(x['ratio_value']) for x in items if '铜' in x['material_name']), 99.8)
                sulfuric_ratio = next((float(x['ratio_value']) for x in items if '硫酸' in x['material_name']), 0.2)
                gel_val = next((float(x['ratio_value']) for x in items if '明胶' in x['material_name']), 5.0)
                hec_val = next((float(x['ratio_value']) for x in items if '纤维素' in x['material_name']), 3.0)
                s_val = next((float(x['ratio_value']) for x in items if '硫' in x['material_name'] and '酸' not in x['material_name']), 7.5)
                silane_type = next((x['material_spec'] for x in items if '硅烷' in x['material_name']), '环保硅烷SL-203')
                silane_conc = next((float(x['ratio_value']) for x in items if '硅烷' in x['material_name']), 0.8)
                updater = data.get('updater', '工艺部')
                bom_items_str = json.dumps(items, ensure_ascii=False)

                cursor.execute("SELECT * FROM product_bom WHERE product_id = ? AND status = '活动' ORDER BY id DESC LIMIT 1", (product_id,))
                current_bom = cursor.fetchone()

                if current_bom:
                    cursor.execute("UPDATE product_bom SET status = '历史' WHERE id = ?", (current_bom['id'],))
                    
                    v_match = re.search(r'V(\d+)\.(\d+)', current_bom['version'])
                    if v_match:
                        major, minor = int(v_match.group(1)), int(v_match.group(2))
                        new_version = f"V{major}.{minor + 1}"
                    else:
                        new_version = current_bom['version'] + ".1"
                else:
                    new_version = "V1.0"

                cursor.execute("""
                INSERT INTO product_bom (product_id, version, status, copper_wire_ratio, sulfuric_acid_ratio, additive_gel, additive_hec, additive_s, silane_type, silane_conc, bom_items, updater, created_at)
                VALUES (?, ?, '活动', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (product_id, new_version, copper_ratio, sulfuric_ratio, gel_val, hec_val, s_val, silane_type, silane_conc, bom_items_str, updater, datetime.now()))

                cursor.execute("""
                INSERT INTO development_logs (product_id, stage, device_name, device_code, parameters, operator, remarks, created_at)
                VALUES (?, '配方在线调整', '研发部系统', 'SYS-NPI-BOM-EDIT', ?, ?, ?, ?)
                """, (
                    product_id,
                    json.dumps({"version": new_version, "items_count": len(items)}),
                    updater,
                    f"在 NPI 流程中对产品配方进行了在线调整，生成新自定义配方版本 {new_version}。",
                    datetime.now()
                ))

                conn.commit()
                self.send_json({"message": f"NPI 配方参数保存成功，已自动升级配方至 {new_version} 版本并级联应用！", "new_version": new_version})

            # 4.6.1 在线修改并保存 NPI 阶段项目计划排期 (Start Date, End Date, Owner)
            elif path.endswith("/save_npi_plan") and "/products/" in path:
                try:
                    product_id = int(path.split("/")[-2])
                except ValueError:
                    self.send_json({"error": "Invalid product ID"}, 400)
                    return

                gate_key = data.get("gate_key")
                start_date = data.get("start_date")
                plan_end_date = data.get("plan_end_date")
                owner = data.get("owner")
                updater = data.get("updater", "项目管理部")

                if not gate_key:
                    self.send_json({"error": "Missing gate_key"}, 400)
                    return

                cursor.execute("SELECT npi_project_plan FROM products WHERE id = ?", (product_id,))
                row = cursor.fetchone()
                if not row:
                    self.send_json({"error": "Product not found"}, 404)
                    return

                plan_dict = {}
                if row['npi_project_plan']:
                    try:
                        plan_dict = json.loads(row['npi_project_plan'])
                    except:
                        pass

                plan_dict[gate_key] = {
                    "start_date": start_date or "",
                    "plan_end_date": plan_end_date or "",
                    "owner": owner or ""
                }

                plan_str = json.dumps(plan_dict, ensure_ascii=False)
                cursor.execute("UPDATE products SET npi_project_plan = ?, updated_at = ? WHERE id = ?", (plan_str, datetime.now(), product_id))
                
                cursor.execute("""
                INSERT INTO development_logs (product_id, stage, device_name, device_code, parameters, operator, remarks, created_at)
                VALUES (?, '里程碑计划变更', '项目部系统', 'SYS-NPI-PLAN-EDIT', ?, ?, ?, ?)
                """, (
                    product_id,
                    json.dumps({"gate_key": gate_key, "owner": owner}),
                    updater,
                    f"调整了 NPI 里程碑 {gate_key} 的排期节点，阶段负责人变更为: {owner}。",
                    datetime.now()
                ))
                
                conn.commit()
                self.send_json({"message": "NPI 门禁排期节点与负责人参数修改成功！"})

            # 4.7 在线保存并设计工艺路线 (Routing) 并升级版本
            elif path.endswith("/save_routing") and "/products/" in path:
                try:
                    product_id = int(path.split("/")[-2])
                except ValueError:
                    self.send_json({"error": "Invalid product ID"}, 400)
                    return

                steps = data.get('steps', [])
                if not steps:
                    self.send_json({"error": "Steps cannot be empty"}, 400)
                    return

                version_notes = data.get('notes', '')

                cursor.execute("SELECT routing_version FROM product_routing WHERE product_id = ? AND status = '活动' ORDER BY id DESC LIMIT 1", (product_id,))
                active_row = cursor.fetchone()
                
                if active_row:
                    current_version = active_row['routing_version']
                    cursor.execute("UPDATE product_routing SET status = '历史' WHERE product_id = ? AND status = '活动'", (product_id,))
                    
                    v_match = re.search(r'R(\d+)\.(\d+)', current_version)
                    if v_match:
                        major, minor = int(v_match.group(1)), int(v_match.group(2))
                        new_version = f"R{major}.{minor + 1}"
                    else:
                        new_version = current_version + ".1"
                else:
                    new_version = "R1.0"

                for index, step in enumerate(steps):
                    step_no = index + 1
                    stage_name = step.get('stage_name', '溶铜工段')
                    device_name = step.get('device_name', '')
                    device_code = step.get('device_code', '')
                    standard_params = step.get('standard_params', {})
                    custom_params = step.get('custom_params', [])
                    
                    cursor.execute("""
                    INSERT INTO product_routing (product_id, routing_version, status, step_no, stage_name, device_name, device_code, standard_params, custom_params, notes, created_at)
                    VALUES (?, ?, '活动', ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (product_id, new_version, step_no, stage_name, device_name, device_code,
                          json.dumps(standard_params), json.dumps(custom_params), version_notes, datetime.now()))

                cursor.execute("""
                INSERT INTO development_logs (product_id, stage, device_name, device_code, parameters, operator, remarks, created_at)
                VALUES (?, '工艺路线升级', '工艺部系统', 'SYS-NPI-ROUTING-EDIT', ?, '工艺主管', ?, ?)
                """, (
                    product_id,
                    json.dumps({"new_version": new_version, "steps_count": len(steps), "notes": version_notes}),
                    f"在线重新发布了工艺路线版本 {new_version}，共设计 {len(steps)} 道工序工步。变更说明：{version_notes or '无'}",
                    datetime.now()
                ))

                conn.commit()
                self.send_json({"message": f"工艺路线发布成功！已自增升级为 {new_version} 版本并设为活动状态。", "new_version": new_version})

            # 4.5 单工步就地参数微调（不升版本）
            elif path.endswith("/update_routing_step") and "/products/" in path:
                try:
                    product_id = int(path.split("/")[-2])
                except ValueError:
                    self.send_json({"error": "Invalid product ID"}, 400)
                    return

                step_id = data.get('step_id')
                if not step_id:
                    self.send_json({"error": "step_id is required"}, 400)
                    return

                stage_name = data.get('stage_name', '')
                device_name = data.get('device_name', '')
                device_code = data.get('device_code', '')
                standard_params = data.get('standard_params', {})
                custom_params = data.get('custom_params', [])

                cursor.execute("SELECT id, routing_version FROM product_routing WHERE id = ? AND product_id = ?", (step_id, product_id))
                step_row = cursor.fetchone()
                if not step_row:
                    self.send_json({"error": "Step not found"}, 404)
                    return

                cursor.execute("""
                UPDATE product_routing SET stage_name=?, device_name=?, device_code=?, standard_params=?, custom_params=?
                WHERE id=? AND product_id=?
                """, (stage_name, device_name, device_code, json.dumps(standard_params), json.dumps(custom_params), step_id, product_id))

                cursor.execute("""
                INSERT INTO development_logs (product_id, stage, device_name, device_code, parameters, operator, remarks, created_at)
                VALUES (?, '工艺参数微调', ?, ?, ?, '工艺工程师', ?, ?)
                """, (
                    product_id, device_name, device_code,
                    json.dumps({"step_id": step_id, "stage_name": stage_name, "standard_params": standard_params}),
                    f"对工步「{stage_name}」({device_name}) 进行了参数微调（未升版）。",
                    datetime.now()
                ))

                conn.commit()
                self.send_json({"message": f"工步「{stage_name}」参数微调成功，已更新基准参数（当前版本不变）。"})

            # 4.6 TDS 微调保存（不升版）
            elif path.endswith("/save_tds_rows") and "/products/" in path:
                try:
                    product_id = int(path.split("/")[-2])
                except ValueError:
                    self.send_json({"error": "Invalid product ID"}, 400)
                    return

                tds_items = data.get('tds_items', [])
                cursor.execute("SELECT id FROM product_tds WHERE product_id = ? AND status = '活动' ORDER BY id DESC LIMIT 1", (product_id,))
                row = cursor.fetchone()
                if not row:
                    # 若无活动版本则自动创建 T1.0
                    cursor.execute("""
                    INSERT INTO product_tds (product_id, tds_version, status, tds_items, notes, updater, created_at)
                    VALUES (?, 'T1.0', '活动', ?, '自动创建', '工艺工程师', ?)
                    """, (product_id, json.dumps(tds_items), datetime.now()))
                else:
                    cursor.execute("UPDATE product_tds SET tds_items=? WHERE id=?", (json.dumps(tds_items), row['id']))

                conn.commit()
                self.send_json({"message": "TDS 检验项更新成功（当前版本不变）。"})

            # 4.7 TDS 正式发布新版本
            elif path.endswith("/publish_tds") and "/products/" in path:
                try:
                    product_id = int(path.split("/")[-2])
                except ValueError:
                    self.send_json({"error": "Invalid product ID"}, 400)
                    return

                tds_items = data.get('tds_items', [])
                notes = data.get('notes', '')
                updater = data.get('updater', '工艺工程师')

                cursor.execute("SELECT tds_version FROM product_tds WHERE product_id = ? AND status = '活动' ORDER BY id DESC LIMIT 1", (product_id,))
                active_row = cursor.fetchone()

                if active_row:
                    cur_ver = active_row['tds_version']
                    import re as _re
                    m = _re.search(r'T(\d+)\.(\d+)', cur_ver)
                    if m:
                        new_ver = f"T{m.group(1)}.{int(m.group(2)) + 1}"
                    else:
                        new_ver = cur_ver + ".1"
                    cursor.execute("UPDATE product_tds SET status='历史' WHERE product_id=? AND status='活动'", (product_id,))
                else:
                    new_ver = "T1.0"

                cursor.execute("""
                INSERT INTO product_tds (product_id, tds_version, status, tds_items, notes, updater, created_at)
                VALUES (?, ?, '活动', ?, ?, ?, ?)
                """, (product_id, new_ver, json.dumps(tds_items), notes, updater, datetime.now()))

                conn.commit()
                self.send_json({"message": f"TDS 技术规格书已正式发布为版本 {new_ver}！", "new_version": new_ver})

            # 5. 录入质量测试数据
            elif path.endswith("/test") and "/products/" in path:
                try:
                    product_id = int(path.split("/")[-2])
                except ValueError:
                    self.send_json({"error": "Invalid product ID"}, 400)
                    return
                
                cursor.execute("SELECT * FROM products WHERE id = ?", (product_id,))
                prod = cursor.fetchone()
                if not prod:
                    self.send_json({"error": "Product not found"}, 404)
                    return

                actual_thickness = float(data.get('actual_thickness', 0))
                roughness_rz_m = float(data.get('roughness_rz_m', 0))
                roughness_rz_s = float(data.get('roughness_rz_s', 0))
                peel_strength = float(data.get('peel_strength', 0))
                df_10ghz = float(data.get('df_10ghz', 0))
                tensile_strength = float(data.get('tensile_strength', 320.0))
                elongation = float(data.get('elongation', 3.0))
                tester = data.get('tester', '测试组')

                is_ok = True
                reasons = []
                
                if roughness_rz_m > prod['target_roughness']:
                    is_ok = False
                    reasons.append(f"粗糙度 Rz {roughness_rz_m}μm 超过目标限值 {prod['target_roughness']}μm")
                if peel_strength < prod['target_peel']:
                    is_ok = False
                    reasons.append(f"结合力 {peel_strength}N/mm 低于目标限值 {prod['target_peel']}N/mm")
                if df_10ghz > prod['target_df']:
                    is_ok = False
                    reasons.append(f"高频 10GHz Df {df_10ghz} 超过指标 {prod['target_df']}")
                if tensile_strength < prod['target_tensile']:
                    is_ok = False
                    reasons.append(f"抗拉强度 {tensile_strength}MPa 低于指标 {prod['target_tensile']}MPa")
                if elongation < prod['target_elongation']:
                    is_ok = False
                    reasons.append(f"延伸率 {elongation}% 低于指标 {prod['target_elongation']}%")

                test_result = "合格" if is_ok else "不合格"
                batch_no = f"TEST-{prod['code']}-{int(time.time())}"

                cursor.execute("""
                INSERT INTO test_records (product_id, batch_no, actual_thickness, roughness_rz_m, roughness_rz_s, peel_strength, df_10ghz, tensile_strength, elongation, test_result, tester, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (product_id, batch_no, actual_thickness, roughness_rz_m, roughness_rz_s, peel_strength, df_10ghz, tensile_strength, elongation, test_result, tester, datetime.now()))

                cursor.execute("UPDATE products SET status = '测试验证中', updated_at = ? WHERE id = ?", (datetime.now(), product_id))
                conn.commit()
                self.send_json({
                    "message": "质量测试指标已提报归档",
                    "batch_no": batch_no,
                    "test_result": test_result,
                    "reasons": reasons
                })

            # 6. 新建 ECN 设变申请
            elif path == "/api/ecns":
                product_id = int(data.get('product_id'))
                change_type = data.get('change_type')
                change_reason = data.get('change_reason')
                change_before = data.get('change_before')
                change_after = data.get('change_after')
                risk_assessment = data.get('risk_assessment', {})
                creator = data.get('creator', '工艺部')

                if not product_id or not change_type or not change_reason:
                    self.send_json({"error": "产品、变更类型与原因必填"}, 400)
                    return

                ecn_no = f"ECN-{datetime.now().strftime('%Y%m%d')}-{int(time.time()) % 1000:03d}"

                cursor.execute("""
                INSERT INTO ecn_records (ecn_no, product_id, change_type, change_reason, change_before, change_after, risk_assessment, status, creator, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (ecn_no, product_id, change_type, change_reason, change_before, change_after, json.dumps(risk_assessment), "草稿", creator, datetime.now(), datetime.now()))
                
                conn.commit()
                self.send_json({"message": "设变单 ECN 创建成功", "ecn_no": ecn_no, "ecn_id": cursor.lastrowid})

            # 7. 提交 ECN 设变审批
            elif path.endswith("/submit_approval") and "/ecns/" in path:
                try:
                    ecn_id = int(path.split("/")[-2])
                except ValueError:
                    self.send_json({"error": "Invalid ECN ID"}, 400)
                    return

                cursor.execute("""
                    SELECT e.*, p.name as product_name, p.code as product_code 
                    FROM ecn_records e 
                    JOIN products p ON e.product_id = p.id 
                    WHERE e.id = ?
                """, (ecn_id,))
                ecn = cursor.fetchone()
                if not ecn:
                    self.send_json({"error": "ECN not found"}, 404)
                    return
                
                cursor.execute("UPDATE ecn_records SET status = '钉钉审批中', updated_at = ? WHERE id = ?", (datetime.now(), ecn_id))
                
                instance_id = f"DING-ECN-{int(time.time())}-{ecn_id}"
                title = f"工程设变 ECN 审批：{ecn['product_name']} ({ecn['change_type']})"
                content_dict = {
                    "ecn_no": ecn['ecn_no'],
                    "product": f"{ecn['product_name']} ({ecn['product_code']})",
                    "change_type": ecn['change_type'],
                    "change_reason": ecn['change_reason'],
                    "change_before": ecn['change_before'],
                    "change_after": ecn['change_after'],
                    "risk_assessment": json.loads(ecn['risk_assessment']) if ecn['risk_assessment'] else {},
                    "creator": ecn['creator'],
                    "submit_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                }

                cursor.execute("""
                INSERT INTO dingtalk_logs (instance_id, related_type, related_id, title, content, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (instance_id, "ECN", ecn_id, title, json.dumps(content_dict), "RUNNING", datetime.now()))
                
                conn.commit()
                self.send_json({"message": "设变审批已推送至调试台", "instance_id": instance_id})

            # 8. 核心业务协同回调：模拟审批通过 / 拒绝
            elif path == "/api/dingtalk/approve":
                instance_id = data.get('instance_id')
                action = data.get('action')
                approver = data.get('approver', '审批经理')
                comment = data.get('comment', '同意')

                if not instance_id or not action:
                    self.send_json({"error": "审批实例ID和决策必填"}, 400)
                    return

                cursor.execute("SELECT * FROM dingtalk_logs WHERE instance_id = ?", (instance_id,))
                ding_log = cursor.fetchone()
                if not ding_log:
                    self.send_json({"error": "Approval instance not found"}, 404)
                    return

                new_status = "COMPLETED" if action == "AGREE" else "REJECTED"
                cursor.execute("""
                UPDATE dingtalk_logs 
                SET status = ?, approver = ?, comment = ? 
                WHERE instance_id = ?
                """, (new_status, approver, comment, instance_id))

                related_type = ding_log['related_type']
                related_id = ding_log['related_id']

                # 8.1 审批类型为：新品开发立项
                if related_type == "PRODUCT":
                    if action == "AGREE":
                        # 立项成功，前推到第一道生产工序 “溶铜造液中”
                        cursor.execute("UPDATE products SET status = '溶铜造液中', updated_at = ? WHERE id = ?", (datetime.now(), related_id))
                        cursor.execute("""
                        INSERT INTO development_logs (product_id, stage, device_name, device_code, parameters, operator, remarks, created_at)
                        VALUES (?, '溶铜工段', '溶铜车间系统', 'SYS-溶铜-00', '{"info":"立项通过，系统开启配方研制"}', '系统', '钉钉立项审批通过，研发阶段开启。', ?)
                        """, (related_id, datetime.now()))
                    else:
                        cursor.execute("UPDATE products SET status = '立项中', updated_at = ? WHERE id = ?", (datetime.now(), related_id))

                # 8.2 审批类型为：工程设变 ECN
                elif related_type == "ECN":
                    ecn_status = "已批准" if action == "AGREE" else "已拒绝"
                    cursor.execute("UPDATE ecn_records SET status = ?, updated_at = ? WHERE id = ?", (ecn_status, datetime.now(), related_id))
                    
                    if action == "AGREE":
                        # 获取变更数据
                        cursor.execute("SELECT * FROM ecn_records WHERE id = ?", (related_id,))
                        ecn_data = cursor.fetchone()
                        prod_id = ecn_data['product_id']
                        
                        # --- 核心级联逻辑：配方 BOM 版本演进 ---
                        # 获取该产品目前处于 活动 状态的 BOM
                        cursor.execute("SELECT * FROM product_bom WHERE product_id = ? AND status = '活动' ORDER BY id DESC LIMIT 1", (prod_id,))
                        current_bom = cursor.fetchone()
                        
                        if current_bom:
                            # 1. 将现有的活动 BOM 改为 '历史' 失效状态
                            cursor.execute("UPDATE product_bom SET status = '历史' WHERE id = ?", (current_bom['id'],))
                            
                            # 2. 计算新版本号
                            v_match = re.search(r'V(\d+)\.(\d+)', current_bom['version'])
                            if v_match:
                                major, minor = int(v_match.group(1)), int(v_match.group(2))
                                new_version = f"V{major}.{minor + 1}"
                            else:
                                new_version = current_bom['version'] + ".1"
                            
                            # 3. 智能提取变更参数并生成新版本 BOM 记录
                            # 解析 change_after 文本内容：如“明胶添加量 4.2ppm，活性硫 9.0ppm”
                            gel_val = current_bom['additive_gel']
                            s_val = current_bom['additive_s']
                            silane_type = current_bom['silane_type']
                            silane_conc = current_bom['silane_conc']
                            
                            after_text = ecn_data['change_after']
                            
                            # 正则表达式模糊匹配明胶 ppm 数字
                            gel_match = re.search(r'明胶.*?(\d+\.?\d*)', after_text)
                            if gel_match:
                                gel_val = float(gel_match.group(1))
                            
                            # 正则匹配活性硫 SPS
                            s_match = re.search(r'(活性硫|SPS).*?(\d+\.?\d*)', after_text)
                            if s_match:
                                s_val = float(s_match.group(2))
                                
                            # 正则匹配硅烷偶联剂型号及浓度
                            silane_match = re.search(r'(硅烷|偶联剂)(型号)?(为)?([a-zA-Z0-9\-]+)', after_text)
                            if silane_match:
                                silane_type = silane_match.group(4)
                            
                            conc_match = re.search(r'浓度.*?(\d+\.?\d*)%', after_text)
                            if conc_match:
                                silane_conc = float(conc_match.group(1))

                            # 写入最新的 BOM 配方表，状态设为 '活动'
                            cursor.execute("""
                            INSERT INTO product_bom (product_id, version, status, copper_wire_ratio, sulfuric_acid_ratio, additive_gel, additive_hec, additive_s, silane_type, silane_conc, updater, created_at)
                            VALUES (?, ?, '活动', ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """, (prod_id, new_version, current_bom['copper_wire_ratio'], current_bom['sulfuric_acid_ratio'], gel_val, current_bom['additive_hec'], s_val, silane_type, silane_conc, approver, datetime.now()))
                            
                            # 4. --- 级联修改 Routing 工艺路线基准参数 ---
                            # 如果设变包含了生箔添加剂参数或者是表面处理偶联剂参数，我们需要更新工艺路线 product_routing 表里的标准参数 (JSON)
                            # 比如更新生箔工段或处理工段的基准 params
                            cursor.execute("SELECT * FROM product_routing WHERE product_id = ?", (prod_id,))
                            routings = cursor.fetchall()
                            for r in routings:
                                try:
                                    s_params = json.loads(r['standard_params'])
                                    modified = False
                                    if r['stage_name'] == "表面处理工段":
                                        if conc_match:
                                            s_params['silane_conc'] = silane_conc
                                            modified = True
                                    if modified:
                                        cursor.execute("UPDATE product_routing SET standard_params = ? WHERE id = ?", (json.dumps(s_params), r['id']))
                                except:
                                    pass
                            
                            # 5. 记入开发记录日志
                            cursor.execute("""
                            INSERT INTO development_logs (product_id, stage, device_name, device_code, parameters, operator, remarks, created_at)
                            VALUES (?, '设变应用', '工程技术部', 'SYS-ECN-APP', ?, ?, ?, ?)
                            """, (
                                prod_id, 
                                json.dumps({"ecn_no": ecn_data['ecn_no'], "new_bom_version": new_version, "gel_ppm": gel_val, "sps_ppm": s_val, "silane": silane_type}),
                                ecn_data['creator'],
                                f"钉钉审批通过，已批准工程变更({ecn_data['ecn_no']})，级联升级配方BOM至{new_version}并实时应用至工艺生产中。原因为: {ecn_data['change_reason']}",
                                datetime.now()
                            ))
                            
                            cursor.execute("UPDATE products SET updated_at = ? WHERE id = ?", (datetime.now(), prod_id))

                conn.commit()
                self.send_json({"message": f"工作流审批已决策：{'同意通过' if action == 'AGREE' else '驳回拒绝'}"})

            # 9. 保存钉钉配置
            elif path == "/api/dingtalk/settings":
                app_key = data.get('app_key')
                app_secret = data.get('app_secret')
                agent_id = data.get('agent_id')
                process_code_project = data.get('process_code_project')
                process_code_ecn = data.get('process_code_ecn')
                is_mock_mode = int(data.get('is_mock_mode', 1))

                cursor.execute("""
                UPDATE dingtalk_settings 
                SET app_key = ?, app_secret = ?, agent_id = ?, process_code_project = ?, process_code_ecn = ?, is_mock_mode = ?
                WHERE id = 1
                """)
                conn.commit()
                self.send_json({"message": "配置更新成功"})

            else:
                self.send_json({"error": "Endpoint not found"}, 404)

        except Exception as e:
            import traceback
            traceback.print_exc()
            self.send_json({"error": str(e)}, 500)
        finally:
            conn.close()

def open_browser():
    time.sleep(1.0)
    url = f"http://localhost:{PORT}"
    print(f"Opening browser at: {url}")
    webbrowser.open(url)

def run_server():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), PLMRequestHandler) as httpd:
        print(f"PLM Server with TDS, BOM & Routing is running at http://localhost:{PORT} ...")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
            httpd.shutdown()

if __name__ == "__main__":
    threading.Thread(target=open_browser, daemon=True).start()
    run_server()
