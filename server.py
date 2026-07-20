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

    def get_thickness_details(self, cursor, product_id):
        cursor.execute("SELECT thickness_details_json FROM products WHERE id = ?", (product_id,))
        row = cursor.fetchone()
        if not row or not row['thickness_details_json']:
            return []
        try:
            return json.loads(row['thickness_details_json'])
        except Exception:
            return []

    def save_thickness_details(self, cursor, product_id, details):
        js_str = json.dumps(details, ensure_ascii=False)
        cursor.execute("UPDATE products SET thickness_details_json = ?, updated_at = ? WHERE id = ?", 
                       (js_str, datetime.now().isoformat(), product_id))

    def get_thickness_info(self, cursor, product_id, spec_thickness):
        details = self.get_thickness_details(cursor, product_id)
        for d in details:
            if abs(float(d.get('spec_thickness', 0)) - float(spec_thickness)) < 0.0001:
                return d
        return None

    def update_thickness_info(self, cursor, product_id, spec_thickness, update_dict):
        details = self.get_thickness_details(cursor, product_id)
        found = False
        spec_val = float(spec_thickness)
        
        for d in details:
            if abs(float(d.get('spec_thickness', 0)) - spec_val) < 0.0001:
                d.update(update_dict)
                found = True
                break
                
        if not found:
            new_item = {
                "product_id": int(product_id),
                "spec_thickness": spec_val,
                "target_roughness": update_dict.get("target_roughness", 1.2),
                "target_peel": update_dict.get("target_peel", 0.8),
                "target_df": update_dict.get("target_df", 0.0012),
                "target_tensile": update_dict.get("target_tensile", 300.0),
                "target_elongation": update_dict.get("target_elongation", 2.5),
                "status": update_dict.get("status", "立项中"),
                "npi_project_plan": update_dict.get("npi_project_plan", "[]"),
                "g1_documents": update_dict.get("g1_documents", "")
            }
            details.append(new_item)
            
        self.save_thickness_details(cursor, product_id, details)

    def parse_query_params(self, path_str):
        parsed = urllib.parse.urlparse(path_str)
        return urllib.parse.parse_qs(parsed.query)

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
            content_type = self.headers.get('Content-Type', '')
            
            # 文件上传：multipart/form-data
            if 'multipart/form-data' in content_type:
                self.handle_file_upload(path, content_type)
                return
            
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

    def handle_file_upload(self, path, content_type):
        """处理 multipart/form-data 文件上传请求"""
        import cgi
        import io
        
        # 解析 multipart 表单数据
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            
            # 手动解析 boundary
            boundary_match = re.search(r'boundary=([^\s;]+)', content_type)
            if not boundary_match:
                self.send_json({"error": "No boundary in Content-Type"}, 400)
                return
            boundary = boundary_match.group(1).encode()
            
            # 解析每个 part
            parts = body.split(b'--' + boundary)
            file_data = None
            file_name = None
            
            for part in parts:
                if b'Content-Disposition' not in part:
                    continue
                header_end = part.find(b'\r\n\r\n')
                if header_end == -1:
                    continue
                headers_raw = part[:header_end].decode('utf-8', errors='replace')
                file_content = part[header_end + 4:]
                # 去掉尾部 \r\n
                if file_content.endswith(b'\r\n'):
                    file_content = file_content[:-2]
                
                if 'filename=' in headers_raw:
                    fname_match = re.search(r'filename="([^"]+)"', headers_raw)
                    if fname_match:
                        file_name = fname_match.group(1)
                        file_data = file_content
            
            if path == "/api/mqc/upload_certificate":
                if not file_data or not file_name:
                    self.send_json({"error": "未找到上传的文件"}, 400)
                    return
                
                # 校验格式，支持 PDF、Word、Excel、图片及压缩包
                allowed_exts = ('.pdf', '.docx', '.doc', '.xlsx', '.xls', '.png', '.jpg', '.jpeg', '.zip', '.rar')
                if not file_name.lower().endswith(allowed_exts):
                    self.send_json({"error": "不支持的文件格式。支持格式：PDF, Word, Excel, 图片, 压缩包"}, 400)
                    return
                
                # 确保目录存在
                cert_dir = os.path.join(DIRECTORY, "uploads", "certificates")
                os.makedirs(cert_dir, exist_ok=True)
                
                # 用时间戳避免文件名冲突
                safe_name = re.sub(r'[^\w\.\-\u4e00-\u9fff]', '_', file_name)
                ts = datetime.now().strftime("%Y%m%d%H%M%S")
                saved_name = f"{ts}_{safe_name}"
                save_path = os.path.join(cert_dir, saved_name)
                
                with open(save_path, 'wb') as f:
                    f.write(file_data)
                
                self.send_json({
                    "success": True,
                    "filename": saved_name,
                    "original_name": file_name,
                    "url": f"/uploads/certificates/{saved_name}"
                })
            else:
                self.send_json({"error": "未知的文件上传路径"}, 404)
        except Exception as e:
            self.send_json({"error": f"文件上传失败: {str(e)}"}, 500)

    # === API GET 请求处理 ===
    def handle_api_get(self, path, query_params):
        conn = self.get_db()
        cursor = conn.cursor()

        try:
            # 1. 获取所有产品列表
            if path == "/api/products":
                category = query_params.get('category', [None])[0]
                status = query_params.get('status', [None])[0]
                
                cursor.execute("SELECT * FROM products ORDER BY id")
                products = [dict(row) for row in cursor.fetchall()]
                
                # 为各大类级联装载可用厚度规格列表和对应的详细数据
                filtered_products = []
                for prod in products:
                    pid = prod['id']
                    t_rows = self.get_thickness_details(cursor, pid)
                    prod['thicknesses'] = [r['spec_thickness'] for r in t_rows]
                    prod['thickness_details'] = t_rows
                    
                    # 兼容前端旧的 status 过滤
                    if status:
                        if not any(r['status'] == status for r in t_rows):
                            continue
                    
                    # 默认附带第一个厚度的物理指标以防空指针崩溃
                    if t_rows:
                        first_t = t_rows[0]
                        prod['spec_thickness'] = first_t['spec_thickness']
                        prod['status'] = first_t['status']
                        prod['target_roughness'] = first_t['target_roughness']
                        prod['target_peel'] = first_t['target_peel']
                        prod['target_df'] = first_t['target_df']
                        prod['target_tensile'] = first_t['target_tensile']
                        prod['target_elongation'] = first_t['target_elongation']
                        prod['npi_project_plan'] = first_t['npi_project_plan']
                    else:
                        prod['spec_thickness'] = 12.0
                        prod['status'] = '立项中'
                        prod['target_roughness'] = 1.2
                        prod['target_peel'] = 0.8
                        prod['target_df'] = 0.0012
                        prod['target_tensile'] = 300.0
                        prod['target_elongation'] = 2.5
                        prod['npi_project_plan'] = '{}'
                        
                    filtered_products.append(prod)
                    
                self.send_json(filtered_products)
                return

            # 2. 获取单个产品详情 (深度集成 TDS, BOM版本, Routing工艺路线，接收 thickness 参数级联)
            elif path.startswith("/api/products/"):
                query_params_raw = query_params
                try:
                    # 去掉 query string 后的真正 path
                    real_path = path.split('?')[0]
                    product_id = int(real_path.split("/")[-1])
                except ValueError:
                    self.send_json({"error": "Invalid product ID"}, 400)
                    return
                
                cursor.execute("SELECT * FROM products WHERE id = ?", (product_id,))
                prod_row = cursor.fetchone()
                if not prod_row:
                    self.send_json({"error": "Product not found"}, 404)
                    return
                
                product = dict(prod_row)
                
                # 1. 解析指定的 thickness 厚度
                thickness_str = query_params_raw.get('thickness', [None])[0]
                if thickness_str:
                    try:
                        thickness = float(thickness_str)
                    except ValueError:
                        thickness = 12.0
                else:
                    # 默认取该品类下的最小厚度规格
                    t_rows = self.get_thickness_details(cursor, product_id)
                    if t_rows:
                        t_rows_sorted = sorted(t_rows, key=lambda x: float(x.get('spec_thickness', 999)))
                        thickness = float(t_rows_sorted[0]['spec_thickness'])
                    else:
                        thickness = 12.0
                
                # 2. 从 products 表级联 JSON 数据加载厚度元信息并合并
                t_dict = self.get_thickness_info(cursor, product_id, thickness)
                if t_dict:
                    product['spec_thickness'] = t_dict['spec_thickness']
                    product['status'] = t_dict['status']
                    product['target_roughness'] = t_dict['target_roughness']
                    product['target_peel'] = t_dict['target_peel']
                    product['target_df'] = t_dict['target_df']
                    product['target_tensile'] = t_dict['target_tensile']
                    product['target_elongation'] = t_dict['target_elongation']
                    
                    # 优先覆盖为特定的子规格代号和名称
                    if t_dict.get('code'):
                        product['code'] = t_dict['code']
                    else:
                        # 兼容降级合并
                        thick_str = str(thickness).rstrip('0').rstrip('.') if '.' in str(thickness) else str(thickness)
                        product['code'] = f"{prod_row['code']}-{thick_str}"
                        
                    if t_dict.get('name'):
                        product['name'] = t_dict['name']
                    else:
                        thick_str = str(thickness).rstrip('0').rstrip('.') if '.' in str(thickness) else str(thickness)
                        product['name'] = f"{prod_row['name']} {thick_str}um {prod_row['category']}"
                    
                    # 反序列化 npi_project_plan
                    plan_val = t_dict.get('npi_project_plan')
                    if isinstance(plan_val, str):
                        try:
                            product['npi_project_plan'] = json.loads(plan_val)
                        except:
                            product['npi_project_plan'] = {}
                    else:
                        product['npi_project_plan'] = plan_val or {}
                else:
                    product['spec_thickness'] = thickness
                    product['status'] = '立项中'
                    product['npi_project_plan'] = {}
                    product['target_roughness'] = 1.2
                    product['target_peel'] = 0.8
                    product['target_df'] = 0.0012
                    product['target_tensile'] = 300.0
                    product['target_elongation'] = 2.5
                    thick_str = str(thickness).rstrip('0').rstrip('.') if '.' in str(thickness) else str(thickness)
                    product['code'] = f"{prod_row['code']}-{thick_str}"
                    product['name'] = f"{prod_row['name']} {thick_str}um {prod_row['category']}"
                
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
                
                # 3. 按产品大类及厚度过滤，获取工艺路线
                cursor.execute("SELECT * FROM product_routing WHERE product_id = ? AND spec_thickness = ? ORDER BY routing_version DESC, step_no ASC", (product_id, thickness))
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
                
                product['routing'] = [r for r in all_routings if r['status'] == '活动']
                
                routing_history = {}
                for r in all_routings:
                    ver = r['routing_version']
                    if ver not in routing_history:
                        routing_history[ver] = []
                    routing_history[ver].append(r)
                product['routing_history'] = routing_history
                
                # 4. 按产品大类及厚度过滤，获取 TDS
                cursor.execute("SELECT * FROM product_tds WHERE product_id = ? AND spec_thickness = ? ORDER BY created_at DESC", (product_id, thickness))
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
                
                # 5. 按产品大类及厚度过滤，获取当前活动 BOM
                cursor.execute("SELECT * FROM product_bom WHERE product_id = ? AND spec_thickness = ? AND status = '活动' ORDER BY id DESC LIMIT 1", (product_id, thickness))
                active_bom_row = cursor.fetchone()
                if active_bom_row:
                    bom_dict = dict(active_bom_row)
                    if bom_dict.get('bom_items'):
                        try:
                            bom_dict['bom_items'] = json.loads(bom_dict['bom_items'])
                        except:
                            bom_dict['bom_items'] = []
                    else:
                        bom_dict['bom_items'] = []
                    product['bom'] = bom_dict
                else:
                    product['bom'] = None
                
                # 6. 按产品大类及厚度过滤，获取所有 BOM 历史
                cursor.execute("SELECT * FROM product_bom WHERE product_id = ? AND spec_thickness = ? ORDER BY version DESC", (product_id, thickness))
                bom_list = []
                for row in cursor.fetchall():
                    bom_dict = dict(row)
                    if bom_dict.get('bom_items'):
                        try:
                            bom_dict['bom_items'] = json.loads(bom_dict['bom_items'])
                        except:
                            bom_dict['bom_items'] = []
                    else:
                        bom_dict['bom_items'] = []
                    bom_list.append(bom_dict)
                product['bom_list'] = bom_list
                
                # 7. 按产品大类及厚度过滤，获取工艺日志
                cursor.execute("SELECT * FROM development_logs WHERE product_id = ? AND spec_thickness = ? ORDER BY created_at ASC", (product_id, thickness))
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
                cursor.execute("SELECT * FROM test_records WHERE product_id = ? AND spec_thickness = ? ORDER BY created_at DESC", (product_id, thickness))
                product['test_records'] = [dict(row) for row in cursor.fetchall()]

                # 获取关联的 ECN 历史
                cursor.execute("SELECT * FROM ecn_records WHERE product_id = ? AND spec_thickness = ? ORDER BY created_at DESC", (product_id, thickness))
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
                stages = ["立项", "溅镀工段", "电镀工段", "PA后处理", "PB涂布", "脱膜工段", "测试验证", "量产送样"]
                if category == "HIS 载体铜箔":
                    stages = ["立项", "溅镀工段", "电镀工段", "PA后处理", "PB涂布", "脱膜工段", "测试验证", "量产送样"]
                
                # 当前状态所在的工序索引
                active_idx = 0
                if prod_status == "立项中" or prod_status == "钉钉立项审批中":
                    active_idx = 0
                elif prod_status == "溅镀金属化中":
                    active_idx = stages.index("溅镀工段")
                elif prod_status == "溅镀开发中" and "溅镀工段" in stages:
                    active_idx = stages.index("溅镀工段")
                elif prod_status == "生箔电镀中":
                    active_idx = stages.index("电镀工段")
                elif prod_status == "PA后处理中":
                    active_idx = stages.index("PA后处理")
                elif prod_status == "PB涂布中":
                    active_idx = stages.index("PB涂布")
                elif prod_status == "脱膜中":
                    active_idx = stages.index("脱膜工段")
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

            # 6. 获取系统所有用户列表 (用户与角色管理)
            elif path == "/api/users":
                cursor.execute("SELECT * FROM users ORDER BY id ASC")
                users = [dict(row) for row in cursor.fetchall()]
                self.send_json(users)
            # ---- EMS 设备开发 GET ----
            elif path == "/api/equipments":
                cursor.execute("SELECT * FROM equipments ORDER BY id ASC")
                equipments = []
                for row in cursor.fetchall():
                    item = dict(row)
                    try:
                        item['parameters'] = json.loads(item['parameters_json'])
                    except:
                        item['parameters'] = {}
                    try:
                        item['project_plan'] = json.loads(item['project_plan_json'])
                    except:
                        item['project_plan'] = {}
                    equipments.append(item)
                self.send_json(equipments)
            # ---- MQC 物料承认 GET ----
            elif path == "/api/mqc/materials":
                mat_code = query_params.get('mat_code', [None])[0]
                query = """
                    SELECT m.*, 
                           EXISTS(
                               SELECT 1 FROM dingtalk_logs l 
                               WHERE l.related_type = 'MQC_MATERIAL' 
                                 AND l.related_id = m.id 
                                 AND l.status = 'COMPLETED'
                           ) as is_dingtalk_approved,
                           (
                               SELECT l.instance_id FROM dingtalk_logs l
                               WHERE l.related_type = 'MQC_MATERIAL'
                                 AND l.related_id = m.id
                               ORDER BY l.id DESC LIMIT 1
                           ) as dingtalk_instance_id,
                           (
                               SELECT l.status FROM dingtalk_logs l
                               WHERE l.related_type = 'MQC_MATERIAL'
                                 AND l.related_id = m.id
                               ORDER BY l.id DESC LIMIT 1
                           ) as dingtalk_flow_status
                    FROM mqc_materials m
                """
                if mat_code:
                    cursor.execute(query + " WHERE m.mat_code=? ORDER BY m.created_at DESC", (mat_code,))
                else:
                    cursor.execute(query + " ORDER BY m.created_at DESC")
                rows = [dict(r) for r in cursor.fetchall()]
                self.send_json(rows)

            elif path == "/api/mqc/suppliers":
                mat_code = query_params.get('mat_code', [None])[0]
                if mat_code:
                    cursor.execute("SELECT * FROM mqc_suppliers WHERE mat_code=? ORDER BY supplier_tier", (mat_code,))
                else:
                    cursor.execute("SELECT * FROM mqc_suppliers ORDER BY mat_code, supplier_tier")
                rows = [dict(r) for r in cursor.fetchall()]
                self.send_json(rows)

            # ---- 受控任务管控 GET ----
            elif path == "/api/tasks":
                q_params = query_params
                q = "SELECT t.*, p.name as product_name FROM tasks t LEFT JOIN products p ON t.product_id=p.id WHERE 1=1"
                args = []
                if q_params.get('product_id', [None])[0]:
                    q += " AND t.product_id=?"; args.append(q_params['product_id'][0])
                if q_params.get('category_5m', [None])[0]:
                    q += " AND t.category_5m=?"; args.append(q_params['category_5m'][0])
                if q_params.get('status', [None])[0]:
                    q += " AND t.status=?"; args.append(q_params['status'][0])
                q += " ORDER BY t.plan_start ASC, t.id DESC"
                cur2 = cursor.execute(q, args)
                cols = [d[0] for d in cur2.description]
                rows = cur2.fetchall()
                self.send_json([dict(zip(cols, r)) for r in rows])

            elif path.startswith("/api/tasks/") and path.endswith("/logs"):
                task_id = path.split("/")[3]
                cur2 = cursor.execute("SELECT * FROM task_logs WHERE task_id=? ORDER BY log_time DESC", [task_id])
                cols = [d[0] for d in cur2.description]
                rows = cur2.fetchall()
                self.send_json([dict(zip(cols, r)) for r in rows])

            else:
                self.send_json({"error": "Endpoint not found"}, 404)

        except Exception as e:
            import traceback
            traceback.print_exc()
            self.send_json({"error": str(e)}, 500)
        finally:
            conn.close()

    # === API POST 请求处理 ===
    def handle_api_post(self, path, data):
        # 角色与权限控制逻辑
        user_role = self.headers.get('X-User-Role', 'Admin')
        
        # 兼容中文角色名反向映射为英文，防止鉴权失效
        role_zh_to_en = {
            "管理员": "Admin",
            "超级管理员": "Admin",
            "产品经理": "Product Manager",
            "品质工程师": "Quality Engineer",
            "研发工程师": "R&D Engineer",
            "设备工程师": "Equipment Engineer",
            "工艺工程师": "Process Engineer",
            "只读访客": "Viewer",
            "访客": "Viewer"
        }
        if user_role in role_zh_to_en:
            user_role = role_zh_to_en[user_role]

        user_name_raw = self.headers.get('X-User-Name', '')
        user_display_name = urllib.parse.unquote(user_name_raw) if user_name_raw else '系统'
        
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
        elif path == "/api/products/clone_thickness":
            required_roles = {"Admin", "Product Manager"}
        elif path.endswith("/save_plan") and "/products/" in path:
            required_roles = {"Admin", "Product Manager"}
        elif (path.endswith("/save_tds_rows") or path.endswith("/publish_tds") or path.endswith("/save_tds")) and "/products/" in path:
            required_roles = {"Admin", "Process Engineer", "Quality Engineer", "R&D Engineer"}
        elif path.endswith("/save_g1_docs") and "/products/" in path:
            required_roles = {"Admin", "Product Manager", "R&D Engineer"}
        elif (path.endswith("/save_npi_bom") or path.endswith("/save_bom")) and "/products/" in path:
            required_roles = {"Admin", "Process Engineer", "R&D Engineer"}
        elif (path.endswith("/save_routing") or path.endswith("/update_routing_step")) and "/products/" in path:
            required_roles = {"Admin", "Process Engineer", "Equipment Engineer", "R&D Engineer"}
        elif path.endswith("/test") and "/products/" in path:
            required_roles = {"Admin", "Process Engineer", "Quality Engineer", "R&D Engineer"}
        elif path.endswith("/log") and "/products/" in path:
            required_roles = {"Admin", "Process Engineer", "Quality Engineer", "Equipment Engineer", "R&D Engineer"}
        elif path == "/api/ecns" or path.endswith("/submit_dingtalk"):
            required_roles = {"Admin", "Process Engineer", "R&D Engineer"}
        elif "/dingtalk/" in path:
            required_roles = {"Admin"}
        elif path == "/api/users" or ("/users/" in path):
            required_roles = {"Admin"}

        if required_roles and user_role not in required_roles:
            role_names_map = {
                "Admin": "管理员",
                "Product Manager": "产品经理",
                "Quality Engineer": "品质工程师",
                "R&D Engineer": "研发工程师",
                "Equipment Engineer": "设备工程师",
                "Process Engineer": "工艺工程师",
                "Viewer": "访客"
            }
            role_name_zh = role_names_map.get(user_role, user_role)
            self.send_json({"error": f"权限不足：当前角色【{role_name_zh}】无此操作权限，请切换到合适的角色重试。"}, 403)
            return

        conn = self.get_db()
        cursor = conn.cursor()

        try:
            # 1.1 一键引申克隆规格
            if path == "/api/products/clone_thickness":
                product_id = int(data.get('product_id'))
                source_thickness = float(data.get('source_thickness'))
                new_thickness = float(data.get('new_thickness'))
                creator = user_display_name

                if not product_id or not source_thickness or not new_thickness:
                    self.send_json({"error": "产品ID、源规格厚度与新规格厚度不能为空"}, 400)
                    return

                if source_thickness == new_thickness:
                    self.send_json({"error": "新规格厚度不能与源规格厚度相同"}, 400)
                    return

                try:
                    # 查询大类信息
                    cursor.execute("SELECT code, category FROM products WHERE id = ?", (product_id,))
                    prod_row = cursor.fetchone()
                    if not prod_row:
                        self.send_json({"error": "找不到指定的产品大类"}, 404)
                        return
                    code, category = prod_row[0], prod_row[1]

                    # 获取源规格厚度详情
                    t_info = self.get_thickness_info(cursor, product_id, source_thickness)
                    if not t_info:
                        self.send_json({"error": f"找不到源规格 {source_thickness}μm 的详细信息"}, 404)
                        return



                    base_time = datetime.now()
                    
                    # 重新生成默认排期（NPI 计划）
                    npi_project_plan = {
                        "gate1": {"owner": t_info.get('g1_owner') or creator, "plan_date": (base_time + timedelta(days=5)).strftime('%Y-%m-%d'), "actual_date": "", "status": "进行中"},
                        "gate2": {"owner": "李建国", "plan_date": (base_time + timedelta(days=15)).strftime('%Y-%m-%d'), "actual_date": "", "status": "未开始"},
                        "gate3": {"owner": "赵立功", "plan_date": (base_time + timedelta(days=30)).strftime('%Y-%m-%d'), "actual_date": "", "status": "未开始"},
                        "gate4": {"owner": "钱品质", "plan_date": (base_time + timedelta(days=45)).strftime('%Y-%m-%d'), "actual_date": "", "status": "未开始"},
                        "gate5": {"owner": "孙生产", "plan_date": (base_time + timedelta(days=60)).strftime('%Y-%m-%d'), "actual_date": "", "status": "未开始"}
                    }

                    new_t_dict = {
                        "spec_thickness": new_thickness,
                        "target_roughness": t_info.get('target_roughness', 1.20),
                        "target_peel": t_info.get('target_peel', 0.75),
                        "target_df": t_info.get('target_df', 0.0013),
                        "target_tensile": t_info.get('target_tensile', 310.0),
                        "target_elongation": t_info.get('target_elongation', 2.5),
                        "status": "立项中",
                        "npi_project_plan": npi_project_plan,
                        "g1_documents": ""
                    }
                    self.update_thickness_info(cursor, product_id, new_thickness, new_t_dict)

                    # 复制 BOM
                    cursor.execute("""
                        SELECT copper_wire_ratio, sulfuric_acid_ratio, additive_gel, additive_hec, additive_s, silane_type, silane_conc, bom_items
                        FROM product_bom
                        WHERE product_id = ? AND spec_thickness = ? AND status = '活动'
                        ORDER BY id DESC LIMIT 1
                    """, (product_id, source_thickness))
                    bom_row = cursor.fetchone()
                    if bom_row:
                        cursor.execute("""
                            INSERT INTO product_bom (product_id, spec_thickness, version, status, copper_wire_ratio, sulfuric_acid_ratio, additive_gel, additive_hec, additive_s, silane_type, silane_conc, bom_items, updater, created_at)
                            VALUES (?, ?, 'V1.0', '活动', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (product_id, new_thickness, bom_row[0], bom_row[1], bom_row[2], bom_row[3], bom_row[4], bom_row[5], bom_row[6], bom_row[7], creator, base_time.isoformat()))
                    else:
                        # 默认 BOM
                        gel_init = 5.2 if category == "PTS2 AI 铜箔" else (3.0 if category == "HIS 载体铜箔" else 5.5)
                        hec_init = 3.5 if category == "PTS2 AI 铜箔" else (4.0 if category == "HIS 载体铜箔" else 3.8)
                        s_init = 8.0 if category == "PTS2 AI 铜箔" else (6.5 if category == "HIS 载体铜箔" else 9.0)
                        silane_type = "环保硅烷SL-203" if category == "HIS 载体铜箔" else "常规硅烷-201"
                        silane_conc = 0.6 if category == "HIS 载体铜箔" else 0.8
                        bom_items = [
                            { "material_code": "MAT-CU-001", "material_name": "高纯铜线", "material_spec": "99.99%级", "ratio_value": 99.85, "unit": "%" },
                            { "material_code": "MAT-ACID-001", "material_name": "电子级硫酸", "material_spec": "98%浓度", "ratio_value": 0.15, "unit": "%" },
                            { "material_code": "AD-GEL-01", "material_name": "特种明胶骨胶", "material_spec": "生箔添加剂", "ratio_value": gel_init, "unit": "ppm" },
                            { "material_code": "AD-HEC-01", "material_name": "羟乙基纤维素", "material_spec": "生箔添加剂", "ratio_value": hec_init, "unit": "ppm" },
                            { "material_code": "AD-SPS-01", "material_name": "活性硫整平剂", "material_spec": "生箔添加剂", "ratio_value": s_init, "unit": "ppm" },
                            { "material_code": "MAT-SILANE-203", "material_name": "常规硅烷偶联剂", "material_spec": silane_type, "ratio_value": silane_conc, "unit": "%" }
                        ]
                        cursor.execute("""
                            INSERT INTO product_bom (product_id, spec_thickness, version, status, copper_wire_ratio, sulfuric_acid_ratio, additive_gel, additive_hec, additive_s, silane_type, silane_conc, bom_items, updater, created_at)
                            VALUES (?, ?, 'V1.0', '活动', 99.85, 0.15, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (product_id, new_thickness, gel_init, hec_init, s_init, silane_type, silane_conc, json.dumps(bom_items), creator, base_time.isoformat()))

                    # 复制 Routing
                    cursor.execute("""
                        SELECT step_no, stage_name, device_name, device_code, standard_params, remark, sop, sip, sop_image, sip_image, notes
                        FROM product_routing
                        WHERE product_id = ? AND spec_thickness = ? AND status = '活动'
                    """, (product_id, source_thickness))
                    routing_rows = cursor.fetchall()
                    if not routing_rows:
                        cursor.execute("""
                            SELECT step_no, stage_name, device_name, device_code, standard_params, remark, sop, sip, sop_image, sip_image, notes
                            FROM product_routing
                            WHERE product_id = ? AND spec_thickness = ?
                        """, (product_id, source_thickness))
                        routing_rows = cursor.fetchall()

                    if routing_rows:
                        for r in routing_rows:
                            cursor.execute("""
                                INSERT INTO product_routing (product_id, spec_thickness, step_no, stage_name, device_name, device_code, standard_params, remark, sop, sip, sop_image, sip_image, notes, status, updater, created_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '活动', ?, ?)
                            """, (product_id, new_thickness, r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], creator, base_time.isoformat()))
                    else:
                        routings = [
                            (1, "溅镀工段", "1#磁控溅镀线",   "EQ-溅镀-01", {"vacuum": 0.0002, "work_pressure": 0.35, "power": 12.0, "ar_flow": 80, "temp": 65, "speed": 15.0, "thickness": 20.0}),
                            (2, "电镀工段", "2#生箔机阴极辊",  "EQ-生箔-02", {"speed": 0.24, "ph": 7.0, "conductivity": 1.5, "cu_conc": 130.0, "acid_conc": 130.0, "cl_conc": 70.0, "rf_b": 2.0, "rf_c": 20.0, "rf_l": 10.0, "temp": 23.0, "xl_conc": 700.0, "anti_ph": 6.0, "anti_temp": 20.0, "anti_time": 15.0, "filter_pressure": 0.8, "wash_temp": 30.0, "oven_temp": 70.0}),
                            (3, "PA后处理", "2#PA后处理线",   "EQ-PA-02", {"vacuum": 0.0003, "work_pressure": 0.30, "power": 15.0, "ar_flow": 100.0, "speed": 10.0, "thickness": 30.0, "uniformity": 2.5, "target_life": 150}),
                            (4, "PB涂布",  "1#高精密PB涂布机", "EQ-PB-01", {"tension": 220.0, "slit_speed": 150.0}),
                            (5, "脱膜工段", "1#高速脱膜机",    "EQ-脱膜-05", {"speed": 5.0, "unwind_tension": 7.0, "rewind_left_tension": 0.0, "rewind_right_tension": 6.0, "trim_left_tension": 0.1, "trim_right_tension": 0.1})
                        ]
                        for r in routings:
                            cursor.execute("""
                                INSERT INTO product_routing (product_id, spec_thickness, step_no, stage_name, device_name, device_code, standard_params)
                                VALUES (?, ?, ?, ?, ?, ?, ?)
                            """, (product_id, new_thickness, r[0], r[1], r[2], r[3], json.dumps(r[4])))

                    # 复制 TDS
                    cursor.execute("""
                        SELECT tds_items, notes
                        FROM product_tds
                        WHERE product_id = ? AND spec_thickness = ? AND status = '活动'
                        ORDER BY id DESC LIMIT 1
                    """, (product_id, source_thickness))
                    tds_row = cursor.fetchone()
                    if tds_row:
                        try:
                            tds_items_list = json.loads(tds_row[0])
                            for item in tds_items_list:
                                if "厚度" in item.get('name_zh', ''):
                                    item['spec'] = f"{new_thickness}±2"
                            tds_items_json = json.dumps(tds_items_list)
                        except:
                            tds_items_json = tds_row[0]

                        cursor.execute("""
                            INSERT INTO product_tds (product_id, spec_thickness, tds_version, status, tds_items, notes, updater, created_at)
                            VALUES (?, ?, 'V1.0', '活动', ?, ?, ?, ?)
                        """, (product_id, new_thickness, tds_items_json, tds_row[1], creator, base_time.isoformat()))
                    else:
                        default_tds_items_pts = [
                            {"item_no": 1, "name_zh": "铜箔厚度(Avg.)", "name_en": "Thickness", "unit": "um", "spec": f"{new_thickness}±2", "test_standard": "Micro Meter", "group": ""},
                            {"item_no": 2, "name_zh": "厚度(oz)", "name_en": "Thickness", "unit": "oz", "spec": "1/3", "test_standard": "IPC-TM-650 2.2.12", "group": ""},
                            {"item_no": 3, "name_zh": "宽幅", "name_en": "Width", "unit": "mm", "spec": "+3,-0", "test_standard": "直辊尺", "group": ""},
                            {"item_no": 4, "name_zh": "长度", "name_en": "Length", "unit": "M", "spec": "+1/-0", "test_standard": "计米器", "group": ""},
                            {"item_no": 5, "name_zh": "接箔数", "name_en": "Splice Count", "unit": "个", "spec": "不可有", "test_standard": "***", "group": ""},
                            {"item_no": 6, "name_zh": "铜纯度", "name_en": "Copper Purity", "unit": "%", "spec": "≥99.5", "test_standard": "IPC-TM-650 2.3.15", "group": ""},
                            {"item_no": 7, "name_zh": "粗糙度 Rz", "name_en": "Roughness (Rz)", "unit": "um", "spec": "<0.2", "test_standard": "Keyence VK3000 雷射共拟顕微鏡(50x)", "group": "Matte side"},
                            {"item_no": 8, "name_zh": "粗糙度 Sa", "name_en": "Roughness (Sa)", "unit": "um", "spec": "<0.05", "test_standard": "Keyence VK3000 雷射共拟顕微鏡(50x)", "group": "Matte side"},
                            {"item_no": 9, "name_zh": "粗糙度 Sdr", "name_en": "Roughness (Sdr)", "unit": "-", "spec": "<0.03", "test_standard": "Keyence VK3000 雷射共拟顕微鏡(50x)", "group": "Matte side"},
                            {"item_no": 10, "name_zh": "粗糙度 Rz", "name_en": "Roughness (Rz)", "unit": "um", "spec": "<0.4", "test_standard": "Keyence VK3000 雷射共拟顕微鏡(50x)", "group": "Shiny side"},
                            {"item_no": 11, "name_zh": "粗糙度 Sa", "name_en": "Roughness (Sa)", "unit": "um", "spec": "<0.05", "test_standard": "Keyence VK3000 雷射共拟顕微鏡(50x)", "group": "Shiny side"},
                            {"item_no": 12, "name_zh": "粗糙度 Sdr", "name_en": "Roughness (Sdr)", "unit": "-", "spec": "<0.03", "test_standard": "Keyence VK3000 雷射共拟顕微鏡(50x)", "group": "Shiny side"},
                            {"item_no": 13, "name_zh": "抗张强度", "name_en": "Tensile Strength (180℃/60min)", "unit": "MPa", "spec": ">270", "test_standard": "IPC-TM-650 2.4.18", "group": ""},
                            {"item_no": 14, "name_zh": "延伸率", "name_en": "Elongation (180℃/60min)", "unit": "%", "spec": ">4", "test_standard": "IPC-TM-650 2.4.18", "group": ""},
                            {"item_no": 15, "name_zh": "抗撕强度", "name_en": "Tear Strength (Panasonic M8 or EM892)", "unit": "kgf/cm", "spec": "≥0.35", "test_standard": "IPC-TM-650 2.4.8", "group": ""},
                            {"item_no": 16, "name_zh": "外观检验", "name_en": "Visual Inspection", "unit": "-", "spec": "参照外观检验标准", "test_standard": "IPC-TM-650 2.1.5", "group": ""}
                        ]
                        cursor.execute("""
                            INSERT INTO product_tds (product_id, spec_thickness, tds_version, status, tds_items, notes, updater, created_at)
                            VALUES (?, ?, 'V1.0', '活动', ?, '', ?, ?)
                        """, (product_id, new_thickness, json.dumps(default_tds_items_pts), creator, base_time.isoformat()))

                    conn.commit()
                    self.send_json({"success": True, "message": f"成功基于 {source_thickness}μm 规格引申创建了新规格 {new_thickness}μm，BOM、工艺路线与TDS已一键同步继承。"})
                    return
                except Exception as e:
                    conn.rollback()
                    self.send_json({"error": f"克隆创建规格失败: {str(e)}"}, 500)
                    return

            # 1.2 普通新品研发立项申请
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
                creator = user_display_name

                if not code or not category:
                    self.send_json({"error": "产品型号与产品类别不能为空"}, 400)
                    return

                try:
                    # 1.1 依据“产品型号”(code)在 products 表中检索已有大类行
                    cursor.execute("SELECT id FROM products WHERE code = ?", (code,))
                    row = cursor.fetchone()
                    if row:
                        product_id = row[0]
                    else:
                        # 全新产品大类，自动在 products 主表中插入创建主行！
                        # name 设为型号名(code)，category 设为产品类别
                        cursor.execute("""
                            INSERT INTO products (code, name, category, thickness_details_json, creator)
                            VALUES (?, ?, ?, '[]', ?)
                        """, (code, code, category, creator))
                        product_id = cursor.lastrowid
                        
                    # 校验该品类下是否已存在该厚度规格。如果已存在，则静默更新该厚度的核心性能指标和项目负责人，不报错打断
                    t_info = self.get_thickness_info(cursor, product_id, spec_thickness)
                    
                    # 1.2 级联更新 products 表的 thickness_details_json 字段
                    # 动态格式化厚度，去除多余的 .0 小数，例如 12.0 -> 12，1.5 -> 1.5
                    thick_str = str(spec_thickness).rstrip('0').rstrip('.') if '.' in str(spec_thickness) else str(spec_thickness)
                    code_for_thick = f"{code}-{thick_str}" # 例如 PTS2-12
                    name_for_thick = f"{code} {thick_str}um {category}" # 例如 PTS2 12um 高频铜箔
                    base_time = datetime.now()
                    npi_owners = data.get('npi_owners', {})
                    g1_owner = npi_owners.get('gate1') or creator
                    g2_owner = npi_owners.get('gate2') or "李建国"
                    g3_owner = npi_owners.get('gate3') or "赵立功"
                    g4_owner = npi_owners.get('gate4') or "钱品质"
                    g5_owner = npi_owners.get('gate5') or "孙生产"
                    
                    # 如果原厚度已存在项目排期计划，保留排期时间和各阶段状态，只更新负责人
                    if t_info and t_info.get('npi_project_plan'):
                        try:
                            if isinstance(t_info['npi_project_plan'], str):
                                default_plan = json.loads(t_info['npi_project_plan'])
                            else:
                                default_plan = t_info['npi_project_plan']
                        except:
                            default_plan = {}
                        
                        for gk in ["gate1", "gate2", "gate3", "gate4", "gate5"]:
                            if gk not in default_plan:
                                default_plan[gk] = { "start_date": "", "plan_end_date": "", "owner": "", "status": "未开始", "actual_end_date": "" }
                            owner_map = { "gate1": g1_owner, "gate2": g2_owner, "gate3": g3_owner, "gate4": g4_owner, "gate5": g5_owner }
                            default_plan[gk]["owner"] = owner_map[gk]
                    else:
                        default_plan = {
                            "gate1": { "start_date": base_time.strftime("%Y-%m-%d"), "plan_end_date": (base_time + timedelta(days=5)).strftime("%Y-%m-%d"), "owner": g1_owner, "status": "进行中", "actual_end_date": "" },
                            "gate2": { "start_date": (base_time + timedelta(days=6)).strftime("%Y-%m-%d"), "plan_end_date": (base_time + timedelta(days=12)).strftime("%Y-%m-%d"), "owner": g2_owner, "status": "未开始", "actual_end_date": "" },
                            "gate3": { "start_date": (base_time + timedelta(days=13)).strftime("%Y-%m-%d"), "plan_end_date": (base_time + timedelta(days=25)).strftime("%Y-%m-%d"), "owner": g3_owner, "status": "未开始", "actual_end_date": "" },
                            "gate4": { "start_date": (base_time + timedelta(days=26)).strftime("%Y-%m-%d"), "plan_end_date": (base_time + timedelta(days=35)).strftime("%Y-%m-%d"), "owner": g4_owner, "status": "未开始", "actual_end_date": "" },
                            "gate5": { "start_date": (base_time + timedelta(days=36)).strftime("%Y-%m-%d"), "plan_end_date": (base_time + timedelta(days=45)).strftime("%Y-%m-%d"), "owner": g5_owner, "status": "未开始", "actual_end_date": "" }
                        }
                    
                    update_dict = {
                        "code": code_for_thick,
                        "name": name_for_thick,
                        "target_roughness": target_roughness,
                        "target_peel": target_peel,
                        "target_df": target_df,
                        "target_tensile": target_tensile,
                        "target_elongation": target_elongation,
                        "status": t_info.get('status') if (t_info and t_info.get('status')) else "立项中",
                        "npi_project_plan": default_plan,
                        "g1_documents": t_info.get('g1_documents') if (t_info and t_info.get('g1_documents')) else ""
                    }
                    self.update_thickness_info(cursor, product_id, spec_thickness, update_dict)
                    
                    # 1.3 写入 product_bom 初始默认配方 (BOM V1.0)
                    gel_init = 5.2 if category == "PTS2 AI 铜箔" else (3.0 if category == "HIS 载体铜箔" else 5.5)
                    hec_init = 3.5 if category == "PTS2 AI 铜箔" else (4.0 if category == "HIS 载体铜箔" else 3.8)
                    s_init = 8.0 if category == "PTS2 AI 铜箔" else (6.5 if category == "HIS 载体铜箔" else 9.0)
                    silane_type = "环保硅烷SL-203" if category == "HIS 载体铜箔" else "常规硅烷-201"
                    silane_conc = 0.6 if category == "HIS 载体铜箔" else 0.8
                    
                    bom_items = [
                        { "material_code": "MAT-CU-001", "material_name": "高纯铜线", "material_spec": "99.99%级", "ratio_value": 99.85, "unit": "%" },
                        { "material_code": "MAT-ACID-001", "material_name": "电子级硫酸", "material_spec": "98%浓度", "ratio_value": 0.15, "unit": "%" },
                        { "material_code": "AD-GEL-01", "material_name": "特种明胶骨胶", "material_spec": "生箔添加剂", "ratio_value": gel_init, "unit": "ppm" },
                        { "material_code": "AD-HEC-01", "material_name": "羟乙基纤维素", "material_spec": "生箔添加剂", "ratio_value": hec_init, "unit": "ppm" },
                        { "material_code": "AD-SPS-01", "material_name": "活性硫整平剂", "material_spec": "生箔添加剂", "ratio_value": s_init, "unit": "ppm" },
                        { "material_code": "MAT-SILANE-203", "material_name": "常规硅烷偶联剂", "material_spec": silane_type, "ratio_value": silane_conc, "unit": "%" }
                    ]
                    bom_items_json = json.dumps(bom_items)

                    cursor.execute("""
                    INSERT INTO product_bom (product_id, spec_thickness, version, status, copper_wire_ratio, sulfuric_acid_ratio, additive_gel, additive_hec, additive_s, silane_type, silane_conc, bom_items, updater, created_at)
                    VALUES (?, ?, 'V1.0', '活动', 99.85, 0.15, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (product_id, spec_thickness, gel_init, hec_init, s_init, silane_type, silane_conc, bom_items_json, creator, base_time.isoformat()))

                    # 1.4 级联写入 product_routing 基准工艺路线工序步骤
                    if category == "HIS 载体铜箔":
                        routings = [
                            (1, "溅镀工段", "1#磁控溅镀线",   "EQ-溅镀-01", {"vacuum": 0.0002, "work_pressure": 0.35, "power": 12.0, "ar_flow": 80, "temp": 65, "speed": 15.0, "thickness": 20.0}),
                            (2, "溅镀工段", "磁控溅射镀膜机",  "EQ-溅镀-01", {"vacuum": 0.0003, "power": 15.0, "speed": 8.0, "thickness": 50.0, "target_type": "高纯铜靶-镍铬阻挡层"}),
                            (3, "电镀工段", "4#超薄生箔机",   "EQ-生箔-04", {"voltage": 7.0, "current_density": 60.0, "drum_speed": 8.0}),
                            (4, "PA后处理", "3#PA后处理线",   "EQ-PA-03", {"vacuum": 0.0003, "work_pressure": 0.30, "power": 15.0, "ar_flow": 100.0, "speed": 10.0, "thickness": 30.0, "uniformity": 2.5, "target_life": 150}),
                            (5, "PB涂布",  "2#高精密PB涂布机", "EQ-PB-02", {"tension": 150.0, "slit_speed": 100.0}),
                            (6, "脱膜工段", "1#高速脱膜机",    "EQ-脱膜-05", {"speed": 5.0, "unwind_tension": 7.0, "rewind_left_tension": 0.0, "rewind_right_tension": 6.0, "trim_left_tension": 0.1, "trim_right_tension": 0.1})
                        ]
                    else:
                        routings = [
                            (1, "溅镀工段", "1#磁控溅镀线",   "EQ-溅镀-01", {"vacuum": 0.0002, "work_pressure": 0.35, "power": 12.0, "ar_flow": 80, "temp": 65, "speed": 15.0, "thickness": 20.0}),
                                                         (2, "电镀工段", "2#生箔机阴极辊",  "EQ-生箔-02", {"speed": 0.24, "ph": 7.0, "conductivity": 1.5, "cu_conc": 130.0, "acid_conc": 130.0, "cl_conc": 70.0, "rf_b": 2.0, "rf_c": 20.0, "rf_l": 10.0, "temp": 23.0, "xl_conc": 700.0, "anti_ph": 6.0, "anti_temp": 20.0, "anti_time": 15.0, "filter_pressure": 0.8, "wash_temp": 30.0, "oven_temp": 70.0}),
                            (3, "PA后处理", "2#PA后处理线",   "EQ-PA-02", {"vacuum": 0.0003, "work_pressure": 0.30, "power": 15.0, "ar_flow": 100.0, "speed": 10.0, "thickness": 30.0, "uniformity": 2.5, "target_life": 150}),
                            (4, "PB涂布",  "1#高精密PB涂布机", "EQ-PB-01", {"tension": 220.0, "slit_speed": 150.0}),
                            (5, "脱膜工段", "1#高速脱膜机",    "EQ-脱膜-05", {"speed": 5.0, "unwind_tension": 7.0, "rewind_left_tension": 0.0, "rewind_right_tension": 6.0, "trim_left_tension": 0.1, "trim_right_tension": 0.1})
                        ]

                    for r in routings:
                        cursor.execute("""
                        INSERT INTO product_routing (product_id, spec_thickness, routing_version, status, step_no, stage_name, device_name, device_code, standard_params)
                        VALUES (?, ?, 'R1.0', '活动', ?, ?, ?, ?, ?)
                        """, (product_id, spec_thickness, r[0], r[1], r[2], r[3], json.dumps(r[4])))

                    # 1.5 级联写入默认 TDS
                    default_tds_items_pts = [
                        {"item_no": 1, "name_zh": "铜箔厚度(Avg.)", "name_en": "Thickness", "unit": "um", "spec": f"{spec_thickness}±2", "test_standard": "Micro Meter", "group": ""},
                        {"item_no": 2, "name_zh": "厚度(oz)", "name_en": "Thickness", "unit": "oz", "spec": "1/3", "test_standard": "IPC-TM-650 2.2.12", "group": ""},
                        {"item_no": 3, "name_zh": "宽幅", "name_en": "Width", "unit": "mm", "spec": "+3,-0", "test_standard": "直辊尺", "group": ""},
                        {"item_no": 4, "name_zh": "长度", "name_en": "Length", "unit": "M", "spec": "+1/-0", "test_standard": "计米器", "group": ""},
                        {"item_no": 5, "name_zh": "接箔数", "name_en": "Splice Count", "unit": "个", "spec": "不可有", "test_standard": "***", "group": ""},
                        {"item_no": 6, "name_zh": "铜纯度", "name_en": "Copper Purity", "unit": "%", "spec": "≥99.5", "test_standard": "IPC-TM-650 2.3.15", "group": ""},
                        {"item_no": 7, "name_zh": "粗糙度 Rz", "name_en": "Roughness (Rz)", "unit": "um", "spec": "<0.2", "test_standard": "Keyence VK3000 雷射共拟顕微鏡(50x)", "group": "Matte side"},
                        {"item_no": 8, "name_zh": "粗糙度 Sa", "name_en": "Roughness (Sa)", "unit": "um", "spec": "<0.05", "test_standard": "Keyence VK3000 雷射共拟顕微鏡(50x)", "group": "Matte side"},
                        {"item_no": 9, "name_zh": "粗糙度 Sdr", "name_en": "Roughness (Sdr)", "unit": "-", "spec": "<0.03", "test_standard": "Keyence VK3000 雷射共拟顕微鏡(50x)", "group": "Matte side"},
                        {"item_no": 10, "name_zh": "粗糙度 Rz", "name_en": "Roughness (Rz)", "unit": "um", "spec": "<0.4", "test_standard": "Keyence VK3000 雷射共拟顕微鏡(50x)", "group": "Shiny side"},
                        {"item_no": 11, "name_zh": "粗糙度 Sa", "name_en": "Roughness (Sa)", "unit": "um", "spec": "<0.05", "test_standard": "Keyence VK3000 雷射共拟顕微鏡(50x)", "group": "Shiny side"},
                        {"item_no": 12, "name_zh": "粗糙度 Sdr", "name_en": "Roughness (Sdr)", "unit": "-", "spec": "<0.03", "test_standard": "Keyence VK3000 雷射共拟顕微鏡(50x)", "group": "Shiny side"},
                        {"item_no": 13, "name_zh": "抗张强度", "name_en": "Tensile Strength (180℃/60min)", "unit": "MPa", "spec": ">270", "test_standard": "IPC-TM-650 2.4.18", "group": ""},
                        {"item_no": 14, "name_zh": "延伸率", "name_en": "Elongation (180℃/60min)", "unit": "%", "spec": ">4", "test_standard": "IPC-TM-650 2.4.18", "group": ""},
                        {"item_no": 15, "name_zh": "抗撕强度", "name_en": "Tear Strength (Panasonic M8 or EM892)", "unit": "kgf/cm", "spec": "≥0.35", "test_standard": "IPC-TM-650 2.4.8", "group": ""},
                        {"item_no": 16, "name_zh": "外观检验", "name_en": "Visual Inspection", "unit": "-", "spec": "参照外观检验标准", "test_standard": "IPC-TM-650 2.1.5", "group": ""}
                    ]
                    default_tds_items_his = [
                        {"item_no": 1, "name_zh": "载体铜箔厚度", "name_en": "Carrier Thickness", "unit": "um", "spec": "18±1", "test_standard": "Micro Meter", "group": ""},
                        {"item_no": 2, "name_zh": "超薄铜层厚度", "name_en": "Ultra-thin Layer", "unit": "um", "spec": f"{spec_thickness}±0.3", "test_standard": "XRF", "group": ""},
                        {"item_no": 3, "name_zh": "宽幅", "name_en": "Width", "unit": "mm", "spec": "+3,-0", "test_standard": "直辊尺", "group": ""},
                        {"item_no": 4, "name_zh": "粗糙度 Rz (超薄层)", "name_en": "Roughness Rz (ultra-thin)", "unit": "um", "spec": "<0.3", "test_standard": "Keyence VK3000", "group": ""},
                        {"item_no": 5, "name_zh": "剥离强度", "name_en": "Peel Strength", "unit": "N/mm", "spec": "≥0.50", "test_standard": "IPC-TM-650 2.4.8", "group": ""},
                        {"item_no": 6, "name_zh": "铜纯度", "name_en": "Copper Purity", "unit": "%", "spec": "≥99.5", "test_standard": "IPC-TM-650 2.3.15", "group": ""},
                        {"item_no": 7, "name_zh": "Df 介质损耗 @10GHz", "name_en": "Dielectric Loss Df", "unit": "-", "spec": "≤0.0010", "test_standard": "IPC-TM-650 2.5.5", "group": ""}
                    ]
                    tds_items = default_tds_items_his if category == "HIS 载体铜箔" else default_tds_items_pts
                    cursor.execute("""
                    INSERT INTO product_tds (product_id, spec_thickness, tds_version, status, tds_items, notes, updater, created_at)
                    VALUES (?, ?, 'T1.0', '活动', ?, '初始版本', '工艺工程师', ?)
                    """, (product_id, spec_thickness, json.dumps(tds_items), base_time.isoformat()))

                    conn.commit()
                    self.send_json({"message": "新品立项成功，已在所选类别中开通厚度规格，TDS、初始BOM配方与工艺路线已自动级联配置", "product_id": product_id, "spec_thickness": spec_thickness})
                except sqlite3.IntegrityError as e:
                    self.send_json({"error": f"发生数据库唯一性错误: {str(e)}"}, 400)

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
                
                # 获取指定的厚度
                query_params_local = self.parse_query_params(self.path)
                thickness_str = data.get('thickness') or query_params_local.get('thickness', [None])[0]
                try:
                    thickness = float(thickness_str) if thickness_str else 12.0
                except ValueError:
                    thickness = 12.0

                update_dict = {
                    "target_roughness": target_roughness,
                    "target_peel": target_peel,
                    "target_df": target_df,
                    "target_tensile": target_tensile,
                    "target_elongation": target_elongation
                }
                self.update_thickness_info(cursor, product_id, thickness, update_dict)
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
                
                # 获取指定的厚度
                query_params_local = self.parse_query_params(self.path)
                thickness_str = data.get('thickness') or query_params_local.get('thickness', [None])[0]
                try:
                    thickness = float(thickness_str) if thickness_str else 12.0
                except ValueError:
                    thickness = 12.0

                t_row = self.get_thickness_info(cursor, product_id, thickness)
                if not t_row:
                    self.send_json({"error": f"该产品大类下未开通 {thickness}μm 厚度规格"}, 404)
                    return
                
                self.update_thickness_info(cursor, product_id, thickness, {"status": "钉钉立项审批中"})
                
                instance_id = f"DING-PROJ-{int(time.time())}-{product_id}-{int(thickness * 10)}"
                title = f"新品开发立项审批：{prod['name']}({thickness}μm)"
                content_dict = {
                    "code": f"{prod['code']}-{thickness}um",
                    "name": f"{prod['name']}({thickness}μm)",
                    "category": prod['category'],
                    "spec_thickness": thickness,
                    "target_roughness": t_row['target_roughness'],
                    "target_peel": t_row['target_peel'],
                    "target_df": t_row['target_df'],
                    "creator": prod['creator'],
                    "submit_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                }
                
                cursor.execute("""
                INSERT INTO dingtalk_logs (instance_id, related_type, related_id, title, content, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (instance_id, "PRODUCT", product_id, title, json.dumps(content_dict), "RUNNING", datetime.now()))
                
                conn.commit()
                self.send_json({"message": "立项审批工作流已推送到钉钉", "instance_id": instance_id, "spec_thickness": thickness})

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

                # 获取指定的厚度
                query_params_local = self.parse_query_params(self.path)
                thickness_str = data.get('thickness') or query_params_local.get('thickness', [None])[0]
                try:
                    thickness = float(thickness_str) if thickness_str else 12.0
                except ValueError:
                    thickness = 12.0

                if not stage or not device_name or not device_code:
                    self.send_json({"error": "工段、设备名和编码必填"}, 400)
                    return

                cursor.execute("""
                INSERT INTO development_logs (product_id, spec_thickness, stage, device_name, device_code, parameters, operator, remarks, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (product_id, thickness, stage, device_name, device_code, json.dumps(parameters), operator, remarks, datetime.now().isoformat()))
                
                status_map = {
                    "溅镀工段": "溅镀金属化中",
                    "电镀工段": "生箔电镀中",
                    "PA后处理": "PA后处理中",
                    "PB涂布": "PB涂布中",
                    "脱膜工段": "脱膜中"
                }
                
                new_status = status_map.get(stage)
                if new_status:
                    self.update_thickness_info(cursor, product_id, thickness, {"status": new_status})

                conn.commit()
                self.send_json({"message": "生产工艺日志录入保存成功", "spec_thickness": thickness})

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

                # 获取指定的厚度
                query_params_local = self.parse_query_params(self.path)
                thickness_str = data.get('thickness') or query_params_local.get('thickness', [None])[0]
                try:
                    thickness = float(thickness_str) if thickness_str else 12.0
                except ValueError:
                    thickness = 12.0

                t_row = self.get_thickness_info(cursor, product_id, thickness)
                if not t_row:
                    self.send_json({"error": f"该产品大类下未找到 {thickness}μm 的厚度规格"}, 404)
                    return

                # 读取并更新 NPI 里程碑计划中的 Gate 5 实际完成状态与日期
                plan_val = t_row.get('npi_project_plan')
                plan_dict = {}
                if plan_val:
                    if isinstance(plan_val, str):
                        try:
                            plan_dict = json.loads(plan_val)
                        except:
                            pass
                    else:
                        plan_dict = plan_val

                # 确保 5 大 Gate 排期数据存在时更新 gate5 属性
                if "gate5" not in plan_dict:
                    plan_dict["gate5"] = {}
                plan_dict["gate5"]["status"] = "已通过"
                plan_dict["gate5"]["actual_end_date"] = datetime.now().strftime("%Y-%m-%d")

                # 级联更新主状态为量产中与里程碑实际结束时间
                self.update_thickness_info(cursor, product_id, thickness, {
                    "status": "量产中",
                    "npi_project_plan": plan_dict
                })
                
                cursor.execute("""
                INSERT INTO development_logs (product_id, spec_thickness, stage, device_name, device_code, parameters, operator, remarks, created_at)
                VALUES (?, ?, '量产阶段', '研发部系统', 'SYS-NPI-RELEASE', '{"status":"APPROVED"}', '系统', 'NPI 5大门禁签核全部通过，产品正式发布导入量产交付阶段！', ?)
                """, (product_id, thickness, datetime.now().isoformat()))

                conn.commit()
                self.send_json({"message": "NPI 门禁全部闭环，新品已成功导入量产并封档发布！", "spec_thickness": thickness})

            # 4.6 在线保存/修改 BOM 并升级版本
            elif path.endswith("/save_bom") and "/products/" in path:
                try:
                    product_id = int(path.split("/")[-2])
                except ValueError:
                    self.send_json({"error": "Invalid product ID"}, 400)
                    return

                items = data.get('items')
                
                # 获取指定的厚度
                query_params_local = self.parse_query_params(self.path)
                thickness_str = data.get('thickness') or query_params_local.get('thickness', [None])[0]
                try:
                    thickness = float(thickness_str) if thickness_str else 12.0
                except ValueError:
                    thickness = 12.0

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
                updater = user_display_name
                bom_items_str = json.dumps(items, ensure_ascii=False)

                cursor.execute("SELECT * FROM product_bom WHERE product_id = ? AND spec_thickness = ? AND status = '活动' ORDER BY id DESC LIMIT 1", (product_id, thickness))
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
                INSERT INTO product_bom (product_id, spec_thickness, version, status, copper_wire_ratio, sulfuric_acid_ratio, additive_gel, additive_hec, additive_s, silane_type, silane_conc, bom_items, updater, created_at)
                VALUES (?, ?, ?, '活动', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (product_id, thickness, new_version, copper_ratio, sulfuric_ratio, gel_val, hec_val, s_val, silane_type, silane_conc, bom_items_str, updater, datetime.now().isoformat()))

                cursor.execute("""
                INSERT INTO development_logs (product_id, spec_thickness, stage, device_name, device_code, parameters, operator, remarks, created_at)
                VALUES (?, ?, '配方在线调整', '研发部系统', 'SYS-NPI-BOM-EDIT', ?, ?, ?, ?)
                """, (
                    product_id,
                    thickness,
                    json.dumps({"version": new_version, "items_count": len(items)}),
                    updater,
                    f"在 NPI 流程中对产品配方进行了在线调整，生成新自定义配方版本 {new_version}。",
                    datetime.now().isoformat()
                ))

                conn.commit()
                self.send_json({"message": f"NPI 配方参数保存成功，已自动升级配方至 {new_version} 版本并级联应用！", "new_version": new_version, "spec_thickness": thickness})

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
                updater = user_display_name

                # 获取指定的厚度
                query_params_local = self.parse_query_params(self.path)
                thickness_str = data.get('thickness') or query_params_local.get('thickness', [None])[0]
                try:
                    thickness = float(thickness_str) if thickness_str else 12.0
                except ValueError:
                    thickness = 12.0

                if not gate_key:
                    self.send_json({"error": "Missing gate_key"}, 400)
                    return

                t_row = self.get_thickness_info(cursor, product_id, thickness)
                if not t_row:
                    self.send_json({"error": f"该产品大类下未找到 {thickness}μm 的厚度信息"}, 404)
                    return

                plan_val = t_row.get('npi_project_plan')
                plan_dict = {}
                if plan_val:
                    if isinstance(plan_val, str):
                        try:
                            plan_dict = json.loads(plan_val)
                        except:
                            pass
                    else:
                        plan_dict = plan_val

                plan_dict[gate_key] = {
                    "start_date": start_date or "",
                    "plan_end_date": plan_end_date or "",
                    "owner": owner or ""
                }

                self.update_thickness_info(cursor, product_id, thickness, {"npi_project_plan": plan_dict})
                
                cursor.execute("""
                INSERT INTO development_logs (product_id, spec_thickness, stage, device_name, device_code, parameters, operator, remarks, created_at)
                VALUES (?, ?, '里程碑计划变更', '项目部系统', 'SYS-NPI-PLAN-EDIT', ?, ?, ?, ?)
                """, (
                    product_id,
                    thickness,
                    json.dumps({"gate_key": gate_key, "owner": owner}),
                    updater,
                    f"调整了 NPI 里里程碑 {gate_key} 的排期节点，阶段负责人变更为: {owner}。",
                    datetime.now().isoformat()
                ))
                
                conn.commit()
                self.send_json({"message": "NPI 门禁排期节点与负责人参数修改成功！", "spec_thickness": thickness})

            # 4.6.2 保存 G1 立项三份文件内容（立项申请书 / TDS / 可行性分析报告）
            elif path.endswith("/save_g1_docs") and "/products/" in path:
                try:
                    product_id = int(path.split("/")[-2])
                except ValueError:
                    self.send_json({"error": "Invalid product ID"}, 400)
                    return

                # 获取指定的厚度
                query_params_local = self.parse_query_params(self.path)
                thickness_str = data.get('thickness') or query_params_local.get('thickness', [None])[0]
                try:
                    thickness = float(thickness_str) if thickness_str else 12.0
                except ValueError:
                    thickness = 12.0

                g1_docs = data.get("g1_documents", {})
                self.update_thickness_info(cursor, product_id, thickness, {"g1_documents": g1_docs})
                conn.commit()
                self.send_json({"message": "G1 立项文件已保存成功！", "spec_thickness": thickness})

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

                # 获取指定的厚度
                query_params_local = self.parse_query_params(self.path)
                thickness_str = data.get('thickness') or query_params_local.get('thickness', [None])[0]
                try:
                    thickness = float(thickness_str) if thickness_str else 12.0
                except ValueError:
                    thickness = 12.0

                cursor.execute("SELECT routing_version FROM product_routing WHERE product_id = ? AND spec_thickness = ? AND status = '活动' ORDER BY id DESC LIMIT 1", (product_id, thickness))
                active_row = cursor.fetchone()
                
                if active_row:
                    current_version = active_row['routing_version']
                    cursor.execute("UPDATE product_routing SET status = '历史' WHERE product_id = ? AND spec_thickness = ? AND status = '活动'", (product_id, thickness))
                    
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
                    stage_name = step.get('stage_name', '溅镀工段')
                    device_name = step.get('device_name', '')
                    device_code = step.get('device_code', '')
                    standard_params = step.get('standard_params', {})
                    custom_params = step.get('custom_params', [])
                    step_remark = step.get('remark', '')
                    sop = step.get('sop', '')
                    sip = step.get('sip', '')
                    sop_image = step.get('sop_image', '')
                    sip_image = step.get('sip_image', '')
                    
                    cursor.execute("""
                    INSERT INTO product_routing (product_id, spec_thickness, routing_version, status, step_no, stage_name, device_name, device_code, standard_params, custom_params, notes, remark, sop, sip, sop_image, sip_image, created_at)
                    VALUES (?, ?, ?, '活动', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (product_id, thickness, new_version, step_no, stage_name, device_name, device_code,
                          json.dumps(standard_params), json.dumps(custom_params), version_notes, remark, sop, sip, sop_image, sip_image, datetime.now().isoformat()))

                cursor.execute("""
                INSERT INTO development_logs (product_id, spec_thickness, stage, device_name, device_code, parameters, operator, remarks, created_at)
                VALUES (?, ?, '工艺路线升级', '工艺部系统', 'SYS-NPI-ROUTING-EDIT', ?, '工艺主管', ?, ?)
                """, (
                    product_id,
                    thickness,
                    json.dumps({"new_version": new_version, "steps_count": len(steps), "notes": version_notes}),
                    f"在线重新发布了工艺路线版本 {new_version}，共设计 {len(steps)} 道工序工步。变更说明：{version_notes or '无'}",
                    datetime.now().isoformat()
                ))

                conn.commit()
                self.send_json({"message": f"工艺路线发布成功！已自增升级为 {new_version} 版本并设为活动状态。", "new_version": new_version, "spec_thickness": thickness})

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
                remark = data.get('remark') or data.get('step_remark') or ''
                sop = data.get('sop', '')
                sip = data.get('sip', '')
                sop_image = data.get('sop_image', '')
                sip_image = data.get('sip_image', '')

                cursor.execute("SELECT id, routing_version, spec_thickness FROM product_routing WHERE id = ? AND product_id = ?", (step_id, product_id))
                step_row = cursor.fetchone()
                if not step_row:
                    self.send_json({"error": "Step not found"}, 404)
                    return

                thickness = step_row['spec_thickness']

                cursor.execute("""
                UPDATE product_routing SET stage_name=?, device_name=?, device_code=?, standard_params=?, custom_params=?, remark=?, sop=?, sip=?, sop_image=?, sip_image=?
                WHERE id=? AND product_id=?
                """, (stage_name, device_name, device_code, json.dumps(standard_params), json.dumps(custom_params), remark, sop, sip, sop_image, sip_image, step_id, product_id))

                cursor.execute("""
                INSERT INTO development_logs (product_id, spec_thickness, stage, device_name, device_code, parameters, operator, remarks, created_at)
                VALUES (?, ?, '工艺参数微调', ?, ?, ?, '工艺工程师', ?, ?)
                """, (
                    product_id, thickness, device_name, device_code,
                    json.dumps({"step_id": step_id, "stage_name": stage_name, "standard_params": standard_params}),
                    f"对工步「{stage_name}」({device_name}) 进行了参数微调（未升版）。",
                    datetime.now().isoformat()
                ))

                conn.commit()
                self.send_json({"message": f"工步「{stage_name}」参数微调成功，已更新基准参数（当前版本不变）。", "spec_thickness": thickness})

            # 4.6 TDS 微调保存（不升版）
            elif path.endswith("/save_tds_rows") and "/products/" in path:
                try:
                    product_id = int(path.split("/")[-2])
                except ValueError:
                    self.send_json({"error": "Invalid product ID"}, 400)
                    return

                tds_items = data.get('tds_items', [])

                # 获取指定的厚度
                query_params_local = self.parse_query_params(self.path)
                thickness_str = data.get('thickness') or query_params_local.get('thickness', [None])[0]
                try:
                    thickness = float(thickness_str) if thickness_str else 12.0
                except ValueError:
                    thickness = 12.0

                cursor.execute("SELECT id FROM product_tds WHERE product_id = ? AND spec_thickness = ? AND status = '活动' ORDER BY id DESC LIMIT 1", (product_id, thickness))
                row = cursor.fetchone()
                if not row:
                    # 若无活动版本则自动创建 T1.0
                    cursor.execute("""
                    INSERT INTO product_tds (product_id, spec_thickness, tds_version, status, tds_items, notes, updater, created_at)
                    VALUES (?, ?, 'T1.0', '活动', ?, '自动创建', '工艺工程师', ?)
                    """, (product_id, thickness, json.dumps(tds_items), datetime.now().isoformat()))
                else:
                    cursor.execute("UPDATE product_tds SET tds_items=? WHERE id=?", (json.dumps(tds_items), row['id']))

                conn.commit()
                self.send_json({"message": "TDS 检验项更新成功（当前版本不变）。", "spec_thickness": thickness})

            # 4.7 TDS 正式发布新版本
            elif path.endswith("/publish_tds") and "/products/" in path:
                try:
                    product_id = int(path.split("/")[-2])
                except ValueError:
                    self.send_json({"error": "Invalid product ID"}, 400)
                    return

                tds_items = data.get('tds_items', [])
                old_tds_items = data.get('old_tds_items', None)  # 前端传来的旧版本快照
                notes = data.get('notes', '')
                updater = user_display_name

                # 获取指定的厚度
                query_params_local = self.parse_query_params(self.path)
                thickness_str = data.get('thickness') or query_params_local.get('thickness', [None])[0]
                try:
                    thickness = float(thickness_str) if thickness_str else 12.0
                except ValueError:
                    thickness = 12.0

                cursor.execute("SELECT id, tds_version FROM product_tds WHERE product_id = ? AND spec_thickness = ? AND status = '活动' ORDER BY id DESC LIMIT 1", (product_id, thickness))
                active_row = cursor.fetchone()

                if active_row:
                    cur_ver = active_row['tds_version']
                    import re as _re
                    m = _re.search(r'T(\d+)\.(\d+)', cur_ver)
                    if m:
                        new_ver = f"T{m.group(1)}.{int(m.group(2)) + 1}"
                    else:
                        new_ver = cur_ver + ".1"

                    # 关键修复：在标记为历史之前，先将旧版本恢复为发布前未被修改的快照
                    if old_tds_items is not None:
                        cursor.execute(
                            "UPDATE product_tds SET tds_items=? WHERE id=?",
                            (json.dumps(old_tds_items, ensure_ascii=False), active_row['id'])
                        )

                    cursor.execute("UPDATE product_tds SET status='历史' WHERE product_id=? AND spec_thickness=? AND status='活动'", (product_id, thickness))
                else:
                    new_ver = "T1.0"

                cursor.execute("""
                INSERT INTO product_tds (product_id, spec_thickness, tds_version, status, tds_items, notes, updater, created_at)
                VALUES (?, ?, ?, '活动', ?, ?, ?, ?)
                """, (product_id, thickness, new_ver, json.dumps(tds_items), notes, updater, datetime.now().isoformat()))

                conn.commit()
                self.send_json({"message": f"TDS 技术规格书已正式发布为版本 {new_ver}！", "new_version": new_ver, "spec_thickness": thickness})

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

                # 获取指定的厚度
                query_params_local = self.parse_query_params(self.path)
                thickness_str = data.get('thickness') or query_params_local.get('thickness', [None])[0]
                try:
                    thickness = float(thickness_str) if thickness_str else 12.0
                except ValueError:
                    thickness = 12.0

                t_row = self.get_thickness_info(cursor, product_id, thickness)
                if not t_row:
                    self.send_json({"error": f"该产品大类下未开通 {thickness}μm 厚度规格的物理指标定义"}, 404)
                    return

                actual_thickness = float(data.get('actual_thickness', 0))
                roughness_rz_m = float(data.get('roughness_rz_m', 0))
                roughness_rz_s = float(data.get('roughness_rz_s', 0))
                peel_strength = float(data.get('peel_strength', 0))
                df_10ghz = float(data.get('df_10ghz', 0))
                tensile_strength = float(data.get('tensile_strength', 320.0))
                elongation = float(data.get('elongation', 3.0))
                tester = user_display_name

                is_ok = True
                reasons = []
                
                if roughness_rz_m > t_row['target_roughness']:
                    is_ok = False
                    reasons.append(f"粗糙度 Rz {roughness_rz_m}μm 超过目标限值 {t_row['target_roughness']}μm")
                if peel_strength < t_row['target_peel']:
                    is_ok = False
                    reasons.append(f"结合力 {peel_strength}N/mm 低于目标限值 {t_row['target_peel']}N/mm")
                if df_10ghz > t_row['target_df']:
                    is_ok = False
                    reasons.append(f"高频 10GHz Df {df_10ghz} 超过指标 {t_row['target_df']}")
                if tensile_strength < t_row['target_tensile']:
                    is_ok = False
                    reasons.append(f"抗拉强度 {tensile_strength}MPa 低于指标 {t_row['target_tensile']}MPa")
                if elongation < t_row['target_elongation']:
                    is_ok = False
                    reasons.append(f"延伸率 {elongation}% 低于指标 {t_row['target_elongation']}%")

                remarks = data.get('remarks', '') or ("; ".join(reasons) if reasons else "指标均符合TDS规范要求")
                is_bom = data.get('is_bom_material_test', False) or "【新物料承认】" in remarks
                
                if is_bom:
                    # 如果是新物料承认，则状态先挂起为“钉钉审批中”
                    test_result = "钉钉审批中"
                    # 修改 remarks 内的结论指示为“钉钉审批中”以供页面一致性渲染
                    if "结论：" in remarks:
                        parts = remarks.split("结论：")
                        remarks = parts[0] + "结论：钉钉审批中;" + ";".join(parts[1].split(";")[1:])
                    
                    batch_no = f"MAT-{prod['code']}-{int(time.time())}"
                    instance_id = f"DING-MAT-{int(time.time())}-{product_id}-{int(thickness * 10)}"
                    title = f"新物料承认审批：{prod['name']}({thickness}μm) 原材料中试承认"
                    
                    supplier_val = "未知供应商"
                    purity_val = "未知纯度"
                    if "供应商：" in remarks:
                        supplier_val = remarks.split("供应商：")[1].split(";")[0]
                    if "规格纯度：" in remarks:
                        purity_val = remarks.split("规格纯度：")[1].split(";")[0]
                        
                    content_dict = {
                        "product_code": f"{prod['code']}-{thickness}um",
                        "product_name": f"{prod['name']}({thickness}μm)",
                        "supplier": supplier_val,
                        "purity": purity_val,
                        "tester": tester,
                        "submit_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    }
                    cursor.execute("""
                    INSERT INTO dingtalk_logs (instance_id, related_type, related_id, title, content, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (instance_id, "MATERIAL", product_id, title, json.dumps(content_dict), "RUNNING", datetime.now()))
                else:
                    test_result = "合格" if is_ok else "不合格"
                    batch_no = f"TEST-{prod['code']}-{int(time.time())}"

                cursor.execute("""
                INSERT INTO test_records (product_id, spec_thickness, batch_no, actual_thickness, roughness_rz_m, roughness_rz_s, peel_strength, df_10ghz, tensile_strength, elongation, test_result, tester, remarks, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (product_id, thickness, batch_no, actual_thickness, roughness_rz_m, roughness_rz_s, peel_strength, df_10ghz, tensile_strength, elongation, test_result, tester, remarks, datetime.now().isoformat()))

                if not is_bom:
                    self.update_thickness_info(cursor, product_id, thickness, {"status": "测试验证中"})
                
                conn.commit()
                self.send_json({
                    "message": "物料承认已送审，已生成钉钉待办审批" if is_bom else "质量测试指标已提报归档",
                    "batch_no": batch_no,
                    "test_result": test_result,
                    "reasons": reasons,
                    "spec_thickness": thickness
                })

            # 6. 新建 ECN 设变申请
            elif path == "/api/ecns":
                product_id = int(data.get('product_id'))
                spec_thickness = float(data.get('spec_thickness') or data.get('thickness', 12.0))
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
                INSERT INTO ecn_records (ecn_no, product_id, spec_thickness, change_type, change_reason, change_before, change_after, risk_assessment, status, creator, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (ecn_no, product_id, spec_thickness, change_type, change_reason, change_before, change_after, json.dumps(risk_assessment), "草稿", creator, datetime.now().isoformat(), datetime.now().isoformat()))
                
                conn.commit()
                self.send_json({"message": "设变单 ECN 创建成功", "ecn_no": ecn_no, "ecn_id": cursor.lastrowid, "spec_thickness": spec_thickness})

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
                    # 解析 thickness
                    try:
                        content_dict = json.loads(ding_log['content'])
                        thickness = float(content_dict.get('spec_thickness', 12.0))
                    except:
                        thickness = 12.0

                    if action == "AGREE":
                        # 立项成功，前推到第一道生产工序
                        cursor.execute("SELECT category FROM products WHERE id = ?", (related_id,))
                        p_row = cursor.fetchone()
                        category = p_row['category'] if p_row else "PTS2 AI 铜箔"
                        
                        first_status = "溅镀金属化中" if category == "HIS 载体铜箔" else "生箔电镀中"
                        self.update_thickness_info(cursor, related_id, thickness, {"status": first_status})
                        
                        cursor.execute("""
                        INSERT INTO development_logs (product_id, spec_thickness, stage, device_name, device_code, parameters, operator, remarks, created_at)
                        VALUES (?, ?, '溅镀工段' if ? == 'HIS 载体铜箔' else '电镀工段', '系统默认', 'SYS-AUTO', '{"info":"立项通过，系统开启研发阶段"}', '系统', '钉钉立项审批通过，研发阶段开启。', ?)
                        """, (related_id, thickness, category, datetime.now().isoformat()))
                    else:
                        self.update_thickness_info(cursor, related_id, thickness, {"status": "立项中"})

                # 8.3 审批类型为：物料承认 MATERIAL
                elif related_type == "MATERIAL":
                    # 解析 thickness
                    try:
                        content_dict = json.loads(ding_log['content'])
                        thickness = float(content_dict.get('spec_thickness', 12.0))
                    except:
                        thickness = 12.0

                    cursor.execute("""
                    SELECT * FROM test_records 
                    WHERE product_id = ? AND spec_thickness = ? AND test_result = '钉钉审批中' AND remarks LIKE '%【新物料承认】%'
                    ORDER BY id DESC LIMIT 1
                    """, (related_id, thickness))
                    record = cursor.fetchone()
                    if record:
                        raw_remarks = record['remarks']
                        if action == "AGREE":
                            new_res = "合格"
                            if "结论：钉钉审批中" in raw_remarks:
                                raw_remarks = raw_remarks.replace("结论：钉钉审批中", "结论：合格 (已由钉钉批准放行)")
                            else:
                                raw_remarks = raw_remarks.replace("结论：特采", "结论：特采 (已由钉钉特采批准)")
                        else:
                            new_res = "不合格"
                            if "结论：" in raw_remarks:
                                raw_remarks = raw_remarks.replace("结论：钉钉审批中", "结论：不合格 (已由钉钉拒绝)")
                                raw_remarks = raw_remarks.replace("结论：合格", "结论：不合格 (已由钉钉拒绝)")
                                raw_remarks = raw_remarks.replace("结论：特采", "结论：不合格 (已由钉钉拒绝)")
                        
                        cursor.execute("""
                        UPDATE test_records 
                        SET test_result = ?, remarks = ? 
                        WHERE id = ?
                        """, (new_res, raw_remarks, record['id']))

                # 8.4 审批类型为：MQC新物料承认 MQC_MATERIAL
                elif related_type == "MQC_MATERIAL":
                    if action == "AGREE":
                        # 检查 PDF 承认书是否已上传
                        cursor.execute("SELECT apply_by FROM mqc_materials WHERE id = ?", (related_id,))
                        m_row = cursor.fetchone()
                        has_pdf = m_row and m_row['apply_by'] and m_row['apply_by'].lower().endswith('.pdf')
                        
                        new_status = "承认通过" if has_pdf else "测试中"
                        cursor.execute("UPDATE mqc_materials SET status = ? WHERE id = ?", (new_status, related_id))
                    else:
                        cursor.execute("UPDATE mqc_materials SET status = ? WHERE id = ?", ("承认拒绝", related_id))

                # 8.2 审批类型为：工程设变 ECN
                elif related_type == "ECN":
                    ecn_status = "已批准" if action == "AGREE" else "已拒绝"
                    cursor.execute("UPDATE ecn_records SET status = ?, updated_at = ? WHERE id = ?", (ecn_status, datetime.now().isoformat(), related_id))
                    
                    if action == "AGREE":
                        # 获取变更数据
                        cursor.execute("SELECT * FROM ecn_records WHERE id = ?", (related_id,))
                        ecn_data = cursor.fetchone()
                        prod_id = ecn_data['product_id']
                        thickness = ecn_data['spec_thickness']
                        
                        # --- 核心级联逻辑：配方 BOM 版本演进 ---
                        cursor.execute("SELECT * FROM product_bom WHERE product_id = ? AND spec_thickness = ? AND status = '活动' ORDER BY id DESC LIMIT 1", (prod_id, thickness))
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
                            gel_val = current_bom['additive_gel']
                            s_val = current_bom['additive_s']
                            silane_type = current_bom['silane_type']
                            silane_conc = current_bom['silane_conc']
                            
                            after_text = ecn_data['change_after']
                            
                            gel_match = re.search(r'明胶.*?(\d+\.?\d*)', after_text)
                            if gel_match:
                                gel_val = float(gel_match.group(1))
                            
                            s_match = re.search(r'(活性硫|SPS).*?(\d+\.?\d*)', after_text)
                            if s_match:
                                s_val = float(s_match.group(2))
                                
                            silane_match = re.search(r'(硅烷|偶联剂)(型号)?(为)?([a-zA-Z0-9\-]+)', after_text)
                            if silane_match:
                                silane_type = silane_match.group(4)
                            
                            conc_match = re.search(r'浓度.*?(\d+\.?\d*)%', after_text)
                            if conc_match:
                                silane_conc = float(conc_match.group(1))

                            # 级联更新 bom_items
                            try:
                                bom_items = json.loads(current_bom['bom_items'])
                                for bi in bom_items:
                                    if '明胶' in bi['material_name']:
                                        bi['ratio_value'] = gel_val
                                    elif '硫' in bi['material_name'] and '酸' not in bi['material_name']:
                                        bi['ratio_value'] = s_val
                                    elif '硅烷' in bi['material_name']:
                                        bi['material_spec'] = silane_type
                                        bi['ratio_value'] = silane_conc
                                bom_items_json = json.dumps(bom_items)
                            except:
                                bom_items_json = current_bom['bom_items']

                            # 写入最新的 BOM 配方表
                            cursor.execute("""
                            INSERT INTO product_bom (product_id, spec_thickness, version, status, copper_wire_ratio, sulfuric_acid_ratio, additive_gel, additive_hec, additive_s, silane_type, silane_conc, bom_items, updater, created_at)
                            VALUES (?, ?, ?, '活动', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """, (prod_id, thickness, new_version, current_bom['copper_wire_ratio'], current_bom['sulfuric_acid_ratio'], gel_val, current_bom['additive_hec'], s_val, silane_type, silane_conc, bom_items_json, approver, datetime.now().isoformat()))
                            
                            # 4. --- 级联修改 Routing 工艺路线基准参数 ---
                            cursor.execute("SELECT * FROM product_routing WHERE product_id = ? AND spec_thickness = ?", (prod_id, thickness))
                            routings = cursor.fetchall()
                            for r in routings:
                                try:
                                    s_params = json.loads(r['standard_params'])
                                    modified = False
                                    if r['stage_name'] == "PA后处理":
                                        if conc_match:
                                            s_params['silane_conc'] = silane_conc
                                            modified = True
                                    if modified:
                                        cursor.execute("UPDATE product_routing SET standard_params = ? WHERE id = ?", (json.dumps(s_params), r['id']))
                                except:
                                    pass
                            
                            # 5. 记入开发记录日志
                            cursor.execute("""
                            INSERT INTO development_logs (product_id, spec_thickness, stage, device_name, device_code, parameters, operator, remarks, created_at)
                            VALUES (?, ?, '设变应用', '工程技术部', 'SYS-ECN-APP', ?, ?, ?, ?)
                            """, (
                                prod_id, thickness,
                                json.dumps({"ecn_no": ecn_data['ecn_no'], "new_bom_version": new_version, "gel_ppm": gel_val, "sps_ppm": s_val, "silane": silane_type}),
                                ecn_data['creator'],
                                f"钉钉审批通过，已批准工程变更({ecn_data['ecn_no']})，级联升级配方BOM至{new_version}并实时应用至工艺生产中。原因为: {ecn_data['change_reason']}",
                                datetime.now().isoformat()
                            ))
                            
                            self.update_thickness_info(cursor, prod_id, thickness, {})

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

            # 10. 新增用户 (用户与角色管理)
            elif path == "/api/users":
                username = data.get('username')
                display_name = data.get('display_name')
                role = data.get('role', 'Viewer')
                status = data.get('status', '启用')

                if not username or not display_name or not role:
                    self.send_json({"error": "用户名、显示名、系统角色不能为空"}, 400)
                    return

                try:
                    cursor.execute("""
                    INSERT INTO users (username, display_name, role, status)
                    VALUES (?, ?, ?, ?)
                    """, (username, display_name, role, status))
                    conn.commit()
                    self.send_json({"message": "新增用户成功！"})
                except sqlite3.IntegrityError:
                    self.send_json({"error": f"用户名 '{username}' 已存在，请重新输入。"}, 400)

            # 11. 编辑用户 (用户与角色管理)
            elif path.startswith("/api/users/") and path.endswith("/edit"):
                try:
                    user_id = int(path.split("/")[-2])
                except ValueError:
                    self.send_json({"error": "Invalid user ID"}, 400)
                    return

                display_name = data.get('display_name')
                role = data.get('role')
                status = data.get('status')

                if not display_name or not role:
                    self.send_json({"error": "显示名和系统角色不能为空"}, 400)
                    return

                cursor.execute("SELECT username FROM users WHERE id = ?", (user_id,))
                row = cursor.fetchone()
                if not row:
                    self.send_json({"error": "用户不存在"}, 404)
                    return

                username = row['username']
                # 保护内置超级管理员，防止编辑其角色
                if username == "admin" and role != "Admin":
                    self.send_json({"error": "内置超级管理员的安全角色无法被更改。"}, 400)
                    return

                cursor.execute("""
                UPDATE users 
                SET display_name = ?, role = ?, status = ? 
                WHERE id = ?
                """, (display_name, role, status, user_id))
                conn.commit()
                self.send_json({"message": "用户信息更新成功！"})

            # 12. 删除用户 (用户与角色管理)
            elif path.startswith("/api/users/") and path.endswith("/delete"):
                try:
                    user_id = int(path.split("/")[-2])
                except ValueError:
                    self.send_json({"error": "Invalid user ID"}, 400)
                    return

                cursor.execute("SELECT username FROM users WHERE id = ?", (user_id,))
                row = cursor.fetchone()
                if not row:
                    self.send_json({"error": "用户不存在"}, 404)
                    return

                username = row['username']
                # 保护超级管理员账号，禁止删除
                if username == 'admin':
                    self.send_json({"error": "安全限制：超级管理员账号无法被删除。"}, 400)
                    return

                cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
                conn.commit()
                self.send_json({"message": "用户已成功从系统中删除！"})

            # ---- MQC 物料承认 POST ----
            elif path == "/api/mqc/materials/save":
                rid = data.get('id')
                status = data.get('status', '需求提出')
                apply_by = data.get('apply_by', '').strip()
                has_pdf = apply_by and apply_by.lower().endswith('.pdf')
                
                is_dingtalk_approved = False
                if rid:
                    cursor.execute("""
                        SELECT 1 FROM dingtalk_logs 
                        WHERE related_type = 'MQC_MATERIAL' AND related_id = ? AND status = 'COMPLETED'
                    """, (rid,))
                    is_dingtalk_approved = bool(cursor.fetchone())
                
                if has_pdf and is_dingtalk_approved:
                    status = '承认通过'
                elif status == '承认通过':
                    if not has_pdf:
                        self.send_json({"error": "物料承认状态要变更为“承认通过”，必须先上传 PDF 格式的承认书。"}, 400)
                        return
                    if not is_dingtalk_approved:
                        self.send_json({"error": "物料承认状态要变更为“承认通过”，必须经过钉钉承认流程审批通过。"}, 400)
                        return
                
                data['status'] = status
                now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                fields = [
                    'mat_code','mat_name','mat_spec','mat_category','supplier_name',
                    'apply_date','apply_by','status',
                    'test_start','test_end','test_result',
                    'conclusion','conclusion_by','conclusion_date','remark',
                    'test_record','test_report','supplier_doc','tds_doc'
                ]
                vals = [data.get(f,'') for f in fields]
                if rid:
                    set_clause = ', '.join(f"{f}=?" for f in fields)
                    cursor.execute(f"UPDATE mqc_materials SET {set_clause} WHERE id=?", vals + [rid])
                else:
                    placeholders = ', '.join('?' * len(fields))
                    col_clause = ', '.join(fields)
                    cursor.execute(
                        f"INSERT INTO mqc_materials ({col_clause}, created_at) VALUES ({placeholders}, ?)",
                        vals + [now]
                    )
                conn.commit()
                new_id = rid or cursor.lastrowid
                self.send_json({'ok': True, 'id': new_id, 'mat_id': None if rid else new_id})

            elif path == "/api/mqc/materials/submit_dingtalk":
                mat_id   = data.get('mat_id')
                mat_code = data.get('mat_code', '')
                mat_name = data.get('mat_name', '')
                if not mat_id:
                    self.send_json({'error': '缺少 mat_id'}, 400); return

                instance_id = f"DING-MQC-{int(time.time())}-{mat_id}"
                title = f"新物料承认审批：{mat_name}（{mat_code}）"
                content_dict = {
                    "mat_id": mat_id,
                    "mat_code": mat_code,
                    "mat_name": mat_name,
                    "submit_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "flow_type": "新物料承认"
                }
                cursor.execute("""
                    INSERT INTO dingtalk_logs
                        (instance_id, related_type, related_id, title, content, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (instance_id, "MQC_MATERIAL", mat_id,
                       title, json.dumps(content_dict, ensure_ascii=False),
                       "RUNNING", datetime.now()))
                # 同步将承认状态改为"审批中"
                cursor.execute(
                    "UPDATE mqc_materials SET status=? WHERE id=?",
                    ("审批中", mat_id)
                )
                conn.commit()
                self.send_json({
                    'ok': True,
                    'instance_id': instance_id,
                    'message': '钉钉新物料审批流程已启动'
                })

            elif path == "/api/mqc/materials/delete":
                rid = data.get('id')
                if not rid:
                    self.send_json({'error': 'Missing id'}, 400); return
                cursor.execute("DELETE FROM mqc_materials WHERE id=?", (rid,))
                cursor.execute("DELETE FROM mqc_suppliers WHERE mat_code=(SELECT mat_code FROM mqc_materials WHERE id=?)", (rid,))
                conn.commit()
                self.send_json({'ok': True})

            elif path == "/api/mqc/suppliers/save":
                rid = data.get('id')
                fields = [
                    'mat_code','supplier_name','supplier_tier','contact',
                    'phone','risk_level','risk_note','approved_date','status',
                    'approval_status','apply_by','test_start','test_end','test_result'
                ]
                vals = [data.get(f,'') for f in fields]
                if rid:
                    set_clause = ', '.join(f"{f}=?" for f in fields)
                    cursor.execute(f"UPDATE mqc_suppliers SET {set_clause} WHERE id=?", vals + [rid])
                else:
                    placeholders = ', '.join('?' * len(fields))
                    col_clause = ', '.join(fields)
                    cursor.execute(
                        f"INSERT INTO mqc_suppliers ({col_clause}) VALUES ({placeholders})",
                        vals
                    )
                conn.commit()
                self.send_json({'ok': True, 'id': rid or cursor.lastrowid})

            elif path == "/api/mqc/suppliers/delete":
                rid = data.get('id')
                if not rid:
                    self.send_json({'error': 'Missing id'}, 400); return
                cursor.execute("DELETE FROM mqc_suppliers WHERE id=?", (rid,))
                conn.commit()
                self.send_json({'ok': True})

            # ---- 受控任务管控 POST ----
            elif path == "/api/tasks/save":
                from datetime import datetime as _dt
                now = _dt.now().strftime("%Y-%m-%d %H:%M")
                tid = data.get('id')
                conn2 = conn
                if tid:
                    conn2.execute("""
                        UPDATE tasks SET title=?, product_id=?, category_5m=?, priority=?,
                            owner=?, plan_start=?, plan_end=?, actual_end=?, status=?, remark=?, updated_at=?
                        WHERE id=?
                    """, [data.get('title'), data.get('product_id'), data.get('category_5m'),
                          data.get('priority','中'), data.get('owner'), data.get('plan_start'),
                          data.get('plan_end'), data.get('actual_end'), data.get('status','待启动'),
                          data.get('remark'), now, tid])
                    conn2.commit()
                    self.send_json({'ok': True, 'id': tid})
                else:
                    date_str = _dt.now().strftime("%Y%m%d")
                    count = conn2.execute("SELECT COUNT(*) FROM tasks WHERE task_no LIKE ?",
                                         [f'TASK-{date_str}-%']).fetchone()[0]
                    task_no = f"TASK-{date_str}-{(count+1):03d}"
                    cur2 = conn2.execute("""
                        INSERT INTO tasks (task_no, title, product_id, category_5m, priority,
                            owner, plan_start, plan_end, actual_end, status, remark, created_at, updated_at)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """, [task_no, data.get('title'), data.get('product_id'), data.get('category_5m'),
                          data.get('priority','中'), data.get('owner'), data.get('plan_start'),
                          data.get('plan_end'), data.get('actual_end'), data.get('status','待启动'),
                          data.get('remark'), now, now])
                    conn2.commit()
                    self.send_json({'ok': True, 'id': cur2.lastrowid, 'task_no': task_no})

            elif path == "/api/tasks/delete":
                tid = data.get('id')
                conn.execute("DELETE FROM tasks WHERE id=?", [tid])
                conn.execute("DELETE FROM task_logs WHERE task_id=?", [tid])
                conn.commit()
                self.send_json({'ok': True})

            elif path.startswith("/api/tasks/") and path.endswith("/logs"):
                task_id = path.split("/")[3]
                from datetime import datetime as _dt
                now = _dt.now().strftime("%Y-%m-%d %H:%M")
                conn.execute("INSERT INTO task_logs (task_id, log_time, log_by, content) VALUES (?,?,?,?)",
                             [task_id, now, data.get('log_by',''), data.get('content','')])
                conn.commit()
                self.send_json({'ok': True})

            # ---- EMS 设备开发 POST ----
            elif path == "/api/equipments/save":
                rid = data.get('id')
                device_code = data.get('device_code', '').strip()
                device_name = data.get('device_name', '').strip()
                stage_name = data.get('stage_name', '').strip()
                status = data.get('status', '运行中')
                oee = float(data.get('oee', 85.0))
                next_maintenance = data.get('next_maintenance')
                parameters_json = data.get('parameters_json', '{}')
                project_plan_json = data.get('project_plan_json')
                operator = user_display_name
                using_unit = data.get('using_unit', '').strip() or None

                if not device_code or not device_name or not stage_name:
                    self.send_json({"error": "设备代号、设备名称与所属工段不能为空"}, 400)
                    return

                if rid:
                    cursor.execute("""
                        UPDATE equipments 
                        SET device_code = ?, device_name = ?, stage_name = ?, status = ?, oee = ?, next_maintenance = ?, operator = ?, using_unit = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    """, (device_code, device_name, stage_name, status, oee, next_maintenance, operator, using_unit, rid))
                else:
                    # 自动生成默认的 6 阶段项目进度
                    if not project_plan_json:
                        stages = [
                            ("stage1_plan", "立项", "设备组"),
                            ("stage2_scheme", "拟定技术方案", "工艺组"),
                            ("stage3_bidding", "请购发包", "采购委"),
                            ("stage4_make", "制作中", "制造部"),
                            ("stage5_install", "安装调试中", "现场工程组"),
                            ("stage6_accept", "验收交付使用", "项目部")
                        ]
                        plan = {}
                        base = datetime.now()
                        for idx, (s_key, s_title, s_owner) in enumerate(stages):
                            s_status = "进行中" if idx == 0 else "未开始"
                            start_date = base.strftime("%Y-%m-%d") if idx == 0 else ""
                            end_date = ""
                            plan[s_key] = {
                                "title": s_title,
                                "status": s_status,
                                "start_date": start_date,
                                "end_date": end_date,
                                "owner": s_owner,
                                "remark": ""
                            }
                        project_plan_json = json.dumps(plan, ensure_ascii=False)
                    
                    cursor.execute("""
                        INSERT INTO equipments (device_code, device_name, stage_name, status, oee, next_maintenance, parameters_json, project_plan_json, operator, using_unit)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (device_code, device_name, stage_name, status, oee, next_maintenance, parameters_json, project_plan_json, operator, using_unit))
                conn.commit()
                self.send_json({'ok': True, 'id': rid or cursor.lastrowid})

            elif path == "/api/equipments/status":
                rid = data.get('id')
                status = data.get('status', '运行中')
                if not rid:
                    self.send_json({'error': '缺少设备 id'}, 400); return
                cursor.execute("UPDATE equipments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (status, rid))
                conn.commit()
                self.send_json({'ok': True})

            elif path == "/api/equipments/parameters":
                rid = data.get('id')
                parameters_json = data.get('parameters_json', '{}')
                if not rid:
                    self.send_json({'error': '缺少设备 id'}, 400); return
                cursor.execute("UPDATE equipments SET parameters_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (parameters_json, rid))
                conn.commit()
                self.send_json({'ok': True})

            elif path == "/api/equipments/project_plan":
                rid = data.get('id')
                project_plan_json = data.get('project_plan_json', '{}')
                if not rid:
                    self.send_json({'error': '缺少设备 id'}, 400); return
                cursor.execute("UPDATE equipments SET project_plan_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (project_plan_json, rid))
                conn.commit()
                self.send_json({'ok': True})

            elif path == "/api/equipments/delete":
                rid = data.get('id')
                if not rid:
                    self.send_json({'error': '缺少设备 id'}, 400); return
                cursor.execute("DELETE FROM equipments WHERE id = ?", (rid,))
                conn.commit()
                self.send_json({'ok': True})

            else:
                self.send_json({"error": "Endpoint not found"}, 404)

        except Exception as e:
            import traceback
            traceback.print_exc()
            self.send_json({"error": str(e)}, 500)
        finally:
            conn.close()

def init_mqc_tables():
    """初始化 MQC 物料承认数据库表"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS mqc_materials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mat_code TEXT NOT NULL,
            mat_name TEXT,
            mat_spec TEXT,
            mat_category TEXT,
            apply_date TEXT,
            apply_by TEXT,
            supplier_name TEXT,
            status TEXT DEFAULT '需求提出',
            test_start TEXT,
            test_end TEXT,
            test_result TEXT,
            conclusion TEXT,
            conclusion_by TEXT,
            conclusion_date TEXT,
            remark TEXT,
            test_record TEXT,
            test_report TEXT,
            supplier_doc TEXT,
            tds_doc TEXT,
            created_at TEXT
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS mqc_suppliers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mat_code TEXT NOT NULL,
            supplier_name TEXT,
            supplier_tier TEXT DEFAULT '一供',
            contact TEXT,
            phone TEXT,
            risk_level TEXT DEFAULT '中',
            risk_note TEXT,
            approved_date TEXT,
            status TEXT DEFAULT '活跃',
            approval_status TEXT DEFAULT '需求提出',
            apply_by TEXT,
            test_start TEXT,
            test_end TEXT,
            test_result TEXT
        )
    ''')
    
    # 动态迁移 mqc_materials 专属文件列
    c.execute("PRAGMA table_info(mqc_materials)")
    m_cols = [col[1] for col in c.fetchall()]
    if "supplier_name" not in m_cols:
        c.execute("ALTER TABLE mqc_materials ADD COLUMN supplier_name TEXT")
    if "test_record" not in m_cols:
        c.execute("ALTER TABLE mqc_materials ADD COLUMN test_record TEXT")
    if "test_report" not in m_cols:
        c.execute("ALTER TABLE mqc_materials ADD COLUMN test_report TEXT")
    if "supplier_doc" not in m_cols:
        c.execute("ALTER TABLE mqc_materials ADD COLUMN supplier_doc TEXT")
    if "tds_doc" not in m_cols:
        c.execute("ALTER TABLE mqc_materials ADD COLUMN tds_doc TEXT")

    # 动态迁移 mqc_suppliers 专属承认与测试信息字段
    c.execute("PRAGMA table_info(mqc_suppliers)")
    cols = [col[1] for col in c.fetchall()]
    if "approval_status" not in cols:
        c.execute("ALTER TABLE mqc_suppliers ADD COLUMN approval_status TEXT DEFAULT '需求提出'")
    if "apply_by" not in cols:
        c.execute("ALTER TABLE mqc_suppliers ADD COLUMN apply_by TEXT")
    if "test_start" not in cols:
        c.execute("ALTER TABLE mqc_suppliers ADD COLUMN test_start TEXT")
    if "test_end" not in cols:
        c.execute("ALTER TABLE mqc_suppliers ADD COLUMN test_end TEXT")
    if "test_result" not in cols:
        c.execute("ALTER TABLE mqc_suppliers ADD COLUMN test_result TEXT")
        
    conn.commit()
    conn.close()
    print("[MQC] 物料承认数据库表已就绪")


def init_task_tables():
    """初始化受控任务管控数据库表"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            task_no     TEXT,
            title       TEXT NOT NULL,
            product_id  INTEGER,
            category_5m TEXT DEFAULT '法',
            priority    TEXT DEFAULT '中',
            owner       TEXT,
            plan_start  TEXT,
            plan_end    TEXT,
            actual_end  TEXT,
            status      TEXT DEFAULT '待启动',
            remark      TEXT,
            created_at  TEXT,
            updated_at  TEXT
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS task_logs (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id  INTEGER NOT NULL,
            log_time TEXT,
            log_by   TEXT,
            content  TEXT
        )
    """)
    conn.commit()
    conn.close()
    print("[TASK] 受控任务数据库表已就绪")

def open_browser():
    time.sleep(1.0)
    url = f"http://localhost:{PORT}"
    print(f"Opening browser at: {url}")
    webbrowser.open(url)

def run_server():
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("", PORT), PLMRequestHandler) as httpd:
        print(f"PLM Server with TDS, BOM & Routing is running at http://localhost:{PORT} ...")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
            httpd.shutdown()

def migrate_ems_database():
    """将设备表 equipments 的 project_plan_json 从旧版 8 阶段无缝迁移到新版 6 阶段，保护用户数据不丢失"""
    import sqlite3
    import json
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 检查 equipments 表是否存在
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='equipments'")
    if not cursor.fetchone():
        conn.close()
        return
        
    # 检查并自动迁移添加 using_unit 字段
    cursor.execute("PRAGMA table_info(equipments)")
    columns = [col[1] for col in cursor.fetchall()]
    if "using_unit" not in columns:
        cursor.execute("ALTER TABLE equipments ADD COLUMN using_unit VARCHAR(100)")
        conn.commit()
        print("[EMS] 成功为 equipments 表迁移并添加 using_unit 字段")
        
    cursor.execute("SELECT id, device_code, project_plan_json FROM equipments")
    rows = cursor.fetchall()
    
    updated_count = 0
    for rid, device_code, plan_json in rows:
        try:
            plan = json.loads(plan_json)
        except Exception:
            continue
            
        # 如果包含 stage1_design 且不包含 stage1_plan，说明需要迁移
        if "stage1_design" in plan and "stage1_plan" not in plan:
            new_plan = {}
            
            # 1. 立项
            s1 = plan.get("stage1_design", {})
            new_plan["stage1_plan"] = {
                "title": "立项",
                "status": s1.get("status", "已完成"),
                "start_date": s1.get("start_date", ""),
                "end_date": s1.get("end_date", ""),
                "owner": s1.get("owner", "赵工"),
                "remark": s1.get("remark", "设备设计开发及立项计划"),
                "attachment_name": s1.get("attachment_name", "设备设计任务书与大纲.pdf"),
                "attachment_url": s1.get("attachment_url", "/docs/eq_design_draft.pdf")
            }
            
            # 2. 拟定技术方案
            s2 = plan.get("stage2_scheme", {})
            new_plan["stage2_scheme"] = {
                "title": "拟定技术方案",
                "status": s2.get("status", "已完成"),
                "start_date": s2.get("start_date", ""),
                "end_date": s2.get("end_date", ""),
                "owner": s2.get("owner", "工艺组"),
                "remark": s2.get("remark", "技术方案评审确定"),
                "attachment_name": s2.get("attachment_name", "设备技术方案评审意见.pdf"),
                "attachment_url": s2.get("attachment_url", "/docs/eq_technical_scheme.pdf")
            }
            
            # 3. 请购发包
            s3_sel = plan.get("stage3_selection", {})
            s4_spl = plan.get("stage4_supplier", {})
            s5_bid = plan.get("stage5_bidding", {})
            
            bid_status = "未开始"
            if s5_bid.get("status") == "已完成":
                bid_status = "已完成"
            elif s3_sel.get("status") == "进行中" or s4_spl.get("status") == "进行中" or s5_bid.get("status") == "进行中":
                bid_status = "进行中"
            elif s3_sel.get("status") == "已完成" or s4_spl.get("status") == "已完成":
                bid_status = "进行中"
                
            new_plan["stage3_bidding"] = {
                "title": "请购发包",
                "status": bid_status,
                "start_date": s3_sel.get("start_date", s5_bid.get("start_date", "")),
                "end_date": s5_bid.get("end_date", ""),
                "owner": s5_bid.get("owner", "采购委"),
                "remark": s5_bid.get("remark", "发包采购合同签署"),
                "attachment_name": s5_bid.get("attachment_name", "发包技术协议与中标通知.pdf"),
                "attachment_url": s5_bid.get("attachment_url", "/docs/eq_bidding_contract.pdf")
            }
            
            # 4. 制作中
            s6_ins = plan.get("stage6_install", {})
            make_status = "未开始"
            if s6_ins.get("status") == "已完成" or s6_ins.get("status") == "进行中":
                make_status = "已完成"
            elif s5_bid.get("status") == "已完成":
                make_status = "进行中"
                
            new_plan["stage4_make"] = {
                "title": "制作中",
                "status": make_status,
                "start_date": s5_bid.get("end_date", ""),
                "end_date": s6_ins.get("start_date", ""),
                "owner": "制造部",
                "remark": "设备厂内制作与监造",
                "attachment_name": "设备制作进度与出厂检核表.pdf" if make_status != "未开始" else "",
                "attachment_url": "/docs/eq_make_log.pdf" if make_status != "未开始" else ""
            }
            
            # 5. 安装调试中
            s7_tst = plan.get("stage7_test", {})
            ins_status = "未开始"
            if s7_tst.get("status") == "已完成":
                ins_status = "已完成"
            elif s6_ins.get("status") == "进行中" or s6_ins.get("status") == "已完成" or s7_tst.get("status") == "进行中":
                ins_status = "进行中"
                
            new_plan["stage5_install"] = {
                "title": "安装调试中",
                "status": ins_status,
                "start_date": s6_ins.get("start_date", ""),
                "end_date": s7_tst.get("end_date", ""),
                "owner": s6_ins.get("owner", "现场工程组"),
                "remark": s6_ins.get("remark", "设备现场安装调试"),
                "attachment_name": s6_ins.get("attachment_name", "现场安装调试自检报告.pdf") if ins_status != "未开始" else "",
                "attachment_url": s6_ins.get("attachment_url", "/docs/eq_install_log.pdf") if ins_status != "未开始" else ""
            }
            
            # 6. 验收交付使用
            s8_acp = plan.get("stage8_accept", {})
            new_plan["stage6_accept"] = {
                "title": "验收交付使用",
                "status": s8_acp.get("status", "未开始"),
                "start_date": s8_acp.get("start_date", ""),
                "end_date": s8_acp.get("end_date", ""),
                "owner": s8_acp.get("owner", "项目部"),
                "remark": s8_acp.get("remark", "设备验收交付投产"),
                "attachment_name": s8_acp.get("attachment_name", "竣工验收签收单与合格证.pdf") if s8_acp.get("status") != "未开始" else "",
                "attachment_url": s8_acp.get("attachment_url", "/docs/eq_acceptance_sheet.pdf") if s8_acp.get("status") != "未开始" else ""
            }
            
            cursor.execute("UPDATE equipments SET project_plan_json = ? WHERE id = ?", [json.dumps(new_plan, ensure_ascii=False), rid])
            updated_count += 1
            
    conn.commit()
    conn.close()
    if updated_count > 0:
        print(f"[EMS] 成功将 {updated_count} 台设备的 8 阶段项目计划无缝迁移至 6 阶段")

if __name__ == "__main__":
    init_mqc_tables()
    init_task_tables()
    migrate_ems_database()
    threading.Thread(target=open_browser, daemon=True).start()
    run_server()
