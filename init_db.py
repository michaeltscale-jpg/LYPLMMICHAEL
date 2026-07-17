import sqlite3
import json
import os
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "plm.db")

def make_bom_items_json(copper, acid, gel, hec, s, silane_type, silane_conc):
    items = [
        { "material_code": "MAT-CU-001", "material_name": "高纯铜线", "material_spec": "99.99%级", "material_category": "氧化铜粉", "ratio_value": copper, "unit": "%" },
        { "material_code": "MAT-ACID-001", "material_name": "电子级硫酸", "material_spec": "98%浓度", "material_category": "辅料", "ratio_value": acid, "unit": "%" },
        { "material_code": "AD-GEL-01", "material_name": "特种明胶骨胶", "material_spec": "生箔添加剂", "material_category": "添加剂", "ratio_value": gel, "unit": "ppm" },
        { "material_code": "AD-HEC-01", "material_name": "羟乙基纤维素", "material_spec": "生箔添加剂", "material_category": "添加剂", "ratio_value": hec, "unit": "ppm" },
        { "material_code": "AD-SPS-01", "material_name": "活性硫整平剂", "material_spec": "生箔添加剂", "material_category": "添加剂", "ratio_value": s, "unit": "ppm" },
        { "material_code": "MAT-SILANE-203", "material_name": "常规硅烷偶联剂", "material_spec": silane_type, "material_category": "添加剂", "ratio_value": silane_conc, "unit": "%" }
    ]
    return json.dumps(items, ensure_ascii=False)

def make_default_project_plan(created_time, creator):
    base_time = created_time
    g1_start = base_time.strftime("%Y-%m-%d")
    g1_end = (base_time + timedelta(days=5)).strftime("%Y-%m-%d")
    
    g2_start = (base_time + timedelta(days=6)).strftime("%Y-%m-%d")
    g2_end = (base_time + timedelta(days=12)).strftime("%Y-%m-%d")
    
    g3_start = (base_time + timedelta(days=13)).strftime("%Y-%m-%d")
    g3_end = (base_time + timedelta(days=25)).strftime("%Y-%m-%d")
    
    g4_start = (base_time + timedelta(days=26)).strftime("%Y-%m-%d")
    g4_end = (base_time + timedelta(days=35)).strftime("%Y-%m-%d")
    
    g5_start = (base_time + timedelta(days=36)).strftime("%Y-%m-%d")
    g5_end = (base_time + timedelta(days=45)).strftime("%Y-%m-%d")
    
    plan = {
        "gate1": { "start_date": g1_start, "plan_end_date": g1_end, "owner": creator },
        "gate2": { "start_date": g2_start, "plan_end_date": g2_end, "owner": "李建国" if creator != "李建国" else "张小贤" },
        "gate3": { "start_date": g3_start, "plan_end_date": g3_end, "owner": "赵立功" },
        "gate4": { "start_date": g4_start, "plan_end_date": g4_end, "owner": "钱品质" },
        "gate5": { "start_date": g5_start, "plan_end_date": g5_end, "owner": "孙生产" }
    }
    return json.dumps(plan, ensure_ascii=False)

def make_default_equipment_project_plan(active_stage_idx=6):
    stages = [
        ("stage1_plan", "立项", "赵工", -50, -45, "设备设计任务书与大纲.pdf", "/docs/eq_design_draft.pdf"),
        ("stage2_scheme", "拟定技术方案", "工艺组", -44, -38, "设备技术方案评审意见.pdf", "/docs/eq_technical_scheme.pdf"),
        ("stage3_bidding", "请购发包", "采购委", -37, -30, "发包技术协议与中标通知.pdf", "/docs/eq_bidding_contract.pdf"),
        ("stage4_make", "制作中", "制造部", -29, -15, "设备制作进度与出厂检核表.pdf", "/docs/eq_make_log.pdf"),
        ("stage5_install", "安装调试中", "现场工程组", -14, 5, "安装调试规范与自检报告.pdf", "/docs/eq_install_log.pdf"),
        ("stage6_accept", "验收交付使用", "项目部", 6, 12, "竣工验收签收单与合格证.pdf", "/docs/eq_acceptance_sheet.pdf")
    ]
    
    plan = {}
    base = datetime.now()
    
    for idx, (s_key, s_title, s_owner, start_offset, end_offset, att_name, att_url) in enumerate(stages):
        s_status = "已完成"
        if idx == active_stage_idx:
            s_status = "进行中"
        elif idx > active_stage_idx:
            s_status = "未开始"
            
        start_date = (base + timedelta(days=start_offset)).strftime("%Y-%m-%d")
        end_date = (base + timedelta(days=end_offset)).strftime("%Y-%m-%d")
        
        plan[s_key] = {
            "title": s_title,
            "status": s_status,
            "start_date": start_date,
            "end_date": end_date,
            "owner": s_owner,
            "remark": f"{s_title}阶段正常进展" if s_status != "未开始" else "",
            "attachment_name": att_name if s_status != "未开始" else "",
            "attachment_url": att_url if s_status != "未开始" else ""
        }
    return json.dumps(plan, ensure_ascii=False)

def init_database(force_reset=False):
    if os.path.exists(DB_PATH):
        if not force_reset:
            print("【保护】数据库已存在，跳过初始化以保护现有数据。")
            return False
        os.remove(DB_PATH)
        print("【重置】已删除旧数据库，重新初始化中...")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 1. 创建产品生命周期与大类表（将厚度信息以 JSON 数组形式级联存储于 thickness_details_json，实现非独立存储）
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        category VARCHAR(50) NOT NULL,
        thickness_details_json TEXT, -- 以 JSON 字符串存储所有厚度的列表、状态、TDS、NPI五闸口计划等详细字段
        creator VARCHAR(50) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 3. 创建产品配方 BOM 表（包含多版本控制，下沉 spec_thickness）
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS product_bom (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        spec_thickness REAL NOT NULL,
        version VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL, -- '活动' / '历史' / '草稿'
        copper_wire_ratio REAL, -- 铜料配比 %
        sulfuric_acid_ratio REAL, -- 硫酸配比 %
        additive_gel REAL, -- 生箔添加剂：明胶 ppm
        additive_hec REAL, -- 生箔添加剂：HEC ppm
        additive_s REAL, -- 生箔添加剂：活性硫 ppm
        silane_type VARCHAR(50), -- PA后处理：硅烷偶联剂型号
        silane_conc REAL, -- PA后处理：硅烷涂覆浓度 %
        bom_items TEXT, -- JSON 格式存储的柔性物料配方清单
        updater VARCHAR(50) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
    """)

    # 4. 创建产品基准工艺路线表 (Routing，下沉 spec_thickness)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS product_routing (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        spec_thickness REAL NOT NULL,
        routing_version VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL, -- '活动' / '历史'
        step_no INTEGER NOT NULL,
        stage_name VARCHAR(50) NOT NULL,
        device_name VARCHAR(100) NOT NULL,
        device_code VARCHAR(50) NOT NULL,
        standard_params TEXT NOT NULL, -- 以 JSON 格式存储推荐的工艺控制基准值
        custom_params TEXT DEFAULT '[]', -- 自定义参数键值对（JSON 数组）
        notes TEXT DEFAULT '', -- 版本变更说明（类似 commit message）
        remark TEXT DEFAULT '', -- 工步备注说明
        sop TEXT DEFAULT '', -- 标准作业程序 SOP
        sip TEXT DEFAULT '', -- 标准检验程序 SIP
        sop_image TEXT DEFAULT '', -- SOP 附图
        sip_image TEXT DEFAULT '', -- 标准检验程序 SIP
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
    """)

    # 5. 创建工艺开发实际录入日志表 (development_logs，下沉 spec_thickness)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS development_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        spec_thickness REAL NOT NULL,
        stage VARCHAR(50) NOT NULL,
        device_name VARCHAR(100) NOT NULL,
        device_code VARCHAR(50) NOT NULL,
        parameters TEXT NOT NULL,
        operator VARCHAR(50) NOT NULL,
        remarks TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
    """)

    # 6. 创建中试检测记录表 (test_records，下沉 spec_thickness)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS test_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        spec_thickness REAL NOT NULL,
        batch_no VARCHAR(50) NOT NULL,
        actual_thickness REAL,
        roughness_rz_m REAL,
        roughness_rz_s REAL,
        peel_strength REAL,
        df_10ghz REAL,
        tensile_strength REAL,
        elongation REAL,
        test_result VARCHAR(20) NOT NULL,
        tester VARCHAR(50) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
    """)

    # 7. 创建工程变更 ECN 表 (ecn_records，下沉 spec_thickness)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ecn_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ecn_no VARCHAR(50) UNIQUE NOT NULL,
        product_id INTEGER NOT NULL,
        spec_thickness REAL NOT NULL,
        change_type VARCHAR(50) NOT NULL,
        change_reason TEXT NOT NULL,
        change_before TEXT NOT NULL,
        change_after TEXT NOT NULL,
        risk_assessment TEXT NOT NULL,
        status VARCHAR(50) NOT NULL,
        dingtalk_instance_id VARCHAR(100),
        creator VARCHAR(50) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
    """)

    # 8. 创建钉钉配置及调试表
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS dingtalk_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_key VARCHAR(100) DEFAULT 'ding_appkey_example_12345',
        app_secret VARCHAR(100) DEFAULT 'ding_secret_example_67890abcdef',
        agent_id VARCHAR(50) DEFAULT '100230495',
        process_code_project VARCHAR(100) DEFAULT 'PROC-PROJECT-CODE',
        process_code_ecn VARCHAR(100) DEFAULT 'PROC-ECN-CODE',
        is_mock_mode INTEGER DEFAULT 1
    )
    """)

    # 9. 创建钉钉审批日志
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS dingtalk_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instance_id VARCHAR(100) UNIQUE NOT NULL,
        related_type VARCHAR(20) NOT NULL,
        related_id INTEGER NOT NULL,
        title VARCHAR(150) NOT NULL,
        content TEXT NOT NULL,
        status VARCHAR(50) NOT NULL,
        approver VARCHAR(50),
        comment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 10. 创建 TDS 技术规格书版本管控表 (product_tds，下沉 spec_thickness)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS product_tds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        spec_thickness REAL NOT NULL,
        tds_version VARCHAR(20) NOT NULL,  -- 如 T1.0, T1.1
        status VARCHAR(20) NOT NULL DEFAULT '活动',  -- '活动' / '历史'
        tds_items TEXT NOT NULL DEFAULT '[]',  -- JSON 数组存储每行检验项
        notes TEXT DEFAULT '',  -- 版本变更说明
        updater VARCHAR(50) DEFAULT '工艺工程师',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
    """)

    # 10. 创建用户权限管理表
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(50) NOT NULL UNIQUE,
        display_name VARCHAR(50) NOT NULL,
        role VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT '启用',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 11. 创建设备开发表 (equipments)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS equipments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_code VARCHAR(50) UNIQUE NOT NULL,
        device_name VARCHAR(100) NOT NULL,
        stage_name VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT '运行中',
        oee REAL DEFAULT 85.0,
        next_maintenance DATE,
        parameters_json TEXT NOT NULL DEFAULT '{}',
        project_plan_json TEXT NOT NULL DEFAULT '{}',
        operator VARCHAR(50),
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    conn.commit()
    print("Tables created successfully.")

    # 插入初始的钉钉配置
    cursor.execute("""
    INSERT INTO dingtalk_settings (app_key, app_secret, agent_id, process_code_project, process_code_ecn, is_mock_mode)
    VALUES ('ding_appkey_example_12345', 'ding_secret_example_67890abcdef', '100230495', 'PROC-PROJECT-CODE', 'PROC-ECN-CODE', 1)
    """)

    # 插入初始用户数据
    cursor.executemany("""
    INSERT INTO users (username, display_name, role, status)
    VALUES (?, ?, ?, ?)
    """, [
        ("admin", "超级管理员", "Admin", "启用"),
        ("pm_zhang", "张经理", "Product Manager", "启用"),
        ("qe_chen", "陈品质", "Quality Engineer", "启用"),
        ("rd_li", "李建国", "R&D Engineer", "启用"),
        ("eq_zhao", "赵设备", "Equipment Engineer", "启用"),
        ("pe_wang", "王工艺", "Process Engineer", "启用")
    ])

    # 生成各设备的默认一条龙导入项目进度 JSON
    p_comp = make_default_equipment_project_plan(6)  # 全部 6 个阶段已完成
    p_active_install = make_default_equipment_project_plan(4)  # 正在安装调试阶段 (5)
    
    # 插入初始设备数据
    cursor.executemany("""
    INSERT INTO equipments (device_code, device_name, stage_name, status, oee, next_maintenance, parameters_json, project_plan_json, operator)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, [
        ("EQ-溅镀-01", "1#磁控溅镀线", "溅镀工段", "运行中", 92.4, "2026-08-01", '{"真空度(Pa)": 0.0002, "工作气压(Pa)": 0.35, "溅镀功率(kW)": 12.0, "溅镀电压(V)": 380}', p_comp, "赵工"),
        ("EQ-生箔-02", "2#生箔机阴极辊", "电镀工段", "运行中", 88.5, "2026-08-15", '{"电流密度(A/dm²)": 65.0, "阴极辊速(m/min)": 5.0, "电解液温度(℃)": 60.0, "加胶流量(L/h)": 120}', p_comp, "生箔工艺组"),
        ("EQ-PA溅镀-02", "2#磁控溅镀处理线", "PA后处理", "运行中", 90.1, "2026-08-10", '{"真空度(Pa)": 0.0003, "工作气压(Pa)": 0.30, "处理功率(kW)": 15.0}', p_comp, "表处工艺组"),
        ("EQ-PB-01", "1#高精密PB涂布机", "PB涂布", "保养中", 79.5, "2026-07-20", '{"收卷张力(N)": 220, "分切速度(m/min)": 150}', p_comp, "维保班组"),
        ("EQ-生箔-03", "3#生箔机及阴极辊(项目导入中)", "电镀工段", "导入中", 0.0, None, '{}', p_active_install, "生箔设备组")
    ])

    # 导入仿真模拟数据
    now = datetime.now()
    
    # 模拟数据大类创建时间
    db_base_time = now - timedelta(days=60)
    
    # 1. 插入三大品类产品
    cursor.execute("""
    INSERT INTO products (id, code, name, category, creator, created_at)
    VALUES (1, 'PTS-AI', 'PTS2 AI 铜箔', 'PTS2 AI 铜箔', '李建国', ?)
    """, (db_base_time.isoformat(),))
    
    cursor.execute("""
    INSERT INTO products (id, code, name, category, creator, created_at)
    VALUES (2, 'HIS-AI', 'HIS 载体铜箔', 'HIS 载体铜箔', '张小贤', ?)
    """, (db_base_time.isoformat(),))
    
    cursor.execute("""
    INSERT INTO products (id, code, name, category, creator, created_at)
    VALUES (3, 'DBJ-AI', 'DBJ 双晶铜箔', 'DBJ 双晶铜箔', '李建国', ?)
    """, (db_base_time.isoformat(),))

    # 各个厚度的时间与计划
    p1_time = now - timedelta(days=15)
    p1_plan = make_default_project_plan(p1_time, "李建国")
    
    p2_time = now - timedelta(days=30)
    p2_plan = make_default_project_plan(p2_time, "张小贤")
    
    p3_time = now - timedelta(days=60)
    p3_plan = make_default_project_plan(p3_time, "李建国")
    
    p4_time = now - timedelta(days=2)
    p4_plan = make_default_project_plan(p4_time, "王强")
    
    p5_time = now - timedelta(days=25)
    p5_plan = make_default_project_plan(p5_time, "赵立功")
    
    p6_time = now - timedelta(hours=6)
    p6_plan = make_default_project_plan(p6_time, "王小虎")

    # 2. 将厚度型号信息以 JSON 数组形式存入各产品大类行的 thickness_details_json 字段中
    import json
    
    raw_thicknesses = [
        # product_id, spec_thickness, target_roughness, target_peel, target_df, target_tensile, target_elongation, status, npi_project_plan
        (1, 12.0, 1.20, 0.75, 0.0013, 310.0, 2.5, "生箔电镀中", p1_plan),
        (1, 18.0, 1.20, 0.75, 0.0013, 310.0, 2.5, "已发布", p5_plan),
        (1, 35.0, 1.20, 0.75, 0.0013, 310.0, 2.5, "未开启", p6_plan),
        (2, 1.5, 0.80, 0.50, 0.0010, 290.0, 2.0, "测试验证中", p2_plan),
        (3, 18.0, 1.50, 0.85, 0.0015, 340.0, 3.2, "量产中", p3_plan)
    ]
    
    for pid in [1, 2, 3]:
        pid_thicknesses = []
        for r in raw_thicknesses:
            if r[0] == pid:
                pid_thicknesses.append({
                    "product_id": r[0],
                    "spec_thickness": r[1],
                    "target_roughness": r[2],
                    "target_peel": r[3],
                    "target_df": r[4],
                    "target_tensile": r[5],
                    "target_elongation": r[6],
                    "status": r[7],
                    "npi_project_plan": r[8],
                    "g1_documents": ""
                })
        js_str = json.dumps(pid_thicknesses, ensure_ascii=False)
        cursor.execute("UPDATE products SET thickness_details_json = ? WHERE id = ?", (js_str, pid))
        
    thickness_infos = raw_thicknesses

    # ================= 导入配方 BOM 模拟数据 =================
    # p1 (PTS-12)：V1.0
    cursor.execute("""
    INSERT INTO product_bom (product_id, spec_thickness, version, status, copper_wire_ratio, sulfuric_acid_ratio, additive_gel, additive_hec, additive_s, silane_type, silane_conc, bom_items, updater, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (1, 12.0, "V1.0", "活动", 99.85, 0.15, 5.2, 3.5, 8.0, "常规硅烷-201", 0.8, make_bom_items_json(99.85, 0.15, 5.2, 3.5, 8.0, "常规硅烷-201", 0.8), "李建国", p1_time.isoformat()))

    # p1-18 (PTS-18)：V1.0
    cursor.execute("""
    INSERT INTO product_bom (product_id, spec_thickness, version, status, copper_wire_ratio, sulfuric_acid_ratio, additive_gel, additive_hec, additive_s, silane_type, silane_conc, bom_items, updater, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (1, 18.0, "V1.0", "活动", 99.85, 0.15, 5.2, 3.5, 8.0, "常规硅烷-201", 0.8, make_bom_items_json(99.85, 0.15, 5.2, 3.5, 8.0, "常规硅烷-201", 0.8), "李建国", p1_time.isoformat()))

    # p1-35 (PTS-35)：V1.0
    cursor.execute("""
    INSERT INTO product_bom (product_id, spec_thickness, version, status, copper_wire_ratio, sulfuric_acid_ratio, additive_gel, additive_hec, additive_s, silane_type, silane_conc, bom_items, updater, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (1, 35.0, "V1.0", "活动", 99.85, 0.15, 5.2, 3.5, 8.0, "常规硅烷-201", 0.8, make_bom_items_json(99.85, 0.15, 5.2, 3.5, 8.0, "常规硅烷-201", 0.8), "李建国", p1_time.isoformat()))

    # p2-1.5 (HIS-1.5)：V1.0
    cursor.execute("""
    INSERT INTO product_bom (product_id, spec_thickness, version, status, copper_wire_ratio, sulfuric_acid_ratio, additive_gel, additive_hec, additive_s, silane_type, silane_conc, bom_items, updater, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (2, 1.5, "V1.0", "活动", 99.88, 0.12, 3.0, 4.0, 6.5, "环保硅烷SL-203", 0.6, make_bom_items_json(99.88, 0.12, 3.0, 4.0, 6.5, "环保硅烷SL-203", 0.6), "张小贤", p2_time.isoformat()))

    # p3 (DBJ-18)：拥有 V1.0 (历史) 和 V1.1 (活动)
    cursor.execute("""
    INSERT INTO product_bom (product_id, spec_thickness, version, status, copper_wire_ratio, sulfuric_acid_ratio, additive_gel, additive_hec, additive_s, silane_type, silane_conc, bom_items, updater, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (3, 18.0, "V1.0", "历史", 99.80, 0.20, 5.5, 3.8, 9.0, "常规硅烷-201", 1.0, make_bom_items_json(99.80, 0.20, 5.5, 3.8, 9.0, "常规硅烷-201", 1.0), "李建国", p3_time.isoformat()))
    
    cursor.execute("""
    INSERT INTO product_bom (product_id, spec_thickness, version, status, copper_wire_ratio, sulfuric_acid_ratio, additive_gel, additive_hec, additive_s, silane_type, silane_conc, bom_items, updater, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (3, 18.0, "V1.1", "活动", 99.82, 0.18, 5.5, 3.8, 9.0, "环保硅烷SL-203", 0.8, make_bom_items_json(99.82, 0.18, 5.5, 3.8, 9.0, "环保硅烷SL-203", 0.8), "李建国", (p3_time + timedelta(days=20)).isoformat()))

    # ================= 导入基准工艺路线 (Routing) 模拟数据 =================
    std_routings_4 = [
        (1, "溅镀工段", "1#磁控溅镀线", "EQ-溅镀-01", {"vacuum": 0.0002, "work_pressure": 0.35, "power": 12.0, "voltage": 380, "current": 30.0, "ar_flow": 80, "temp": 65, "speed": 15.0, "thickness": 20.0, "uniformity": 1.2, "target_life": 50}),
        (2, "电镀工段", "2#生箔机阴极辊", "EQ-生箔-02", {"current_density": 65.0, "drum_speed": 5.0, "electrolyte_temp": 60.0, "flow_rate": 120.0, "cl_conc": 35.0, "cu_conc": 85.0, "acid_conc": 110.0, "polar_gap": 10.0, "gel_flow": 120.0, "s_flow": 80.0}),
        (3, "PA后处理", "2#磁控溅镀处理线", "EQ-PA溅镀-02", {"vacuum": 0.0003, "work_pressure": 0.30, "power": 15.0, "ar_flow": 100.0, "speed": 10.0, "thickness": 30.0, "uniformity": 2.5, "target_life": 150}),
        (4, "PB涂布", "1#高精密PB涂布机", "EQ-PB-01", {"tension": 220.0, "slit_speed": 150.0})
    ]
    

    # Professional SOP/SIP templates mapping
    templates = {
        "溅镀工段": (
            "1. 【基材准备】PET/PI 载体表面除尘，张力控制在 120-150N。\n2. 【真空抽气】真空室抽至极限本底真空 ≤ 5×10^-4 Pa 后，通高纯 Ar 气至工作气压。\n3. 【溅镀作业】开启放电极，功率控制在 12-15kW，阴极溅镀电流 30-35A，溅镀线速 15m/min，确保铜层/镍层均匀致密。",
            "1. 【外观目检】基材表面不允许有打皱、漏镀、白点，铜层无氧化泛黄。\n2. 【附着力测试】用 3M-600 胶带进行百格测试，剥离残留率应 ≥ 98% (5B级)。\n3. 【厚度检测】方阻测试仪测量方阻，计算得出铜层厚度应为 20 ± 2 nm。"
        ),
        "电镀工段": (
            "1. 【配液作业】溶铜罐注入 99.99% 纯铜线，补充硫酸及纯水，维持铜浓度 85 ± 2 g/L，硫酸 105 ± 5 g/L。\n2. 【添加剂控制】连续稳定泵入明胶 5.0 ± 0.5 ppm、SPS 8.0 ± 0.5 ppm、HEC 3.5 ± 0.5 ppm，禁止间歇性大剂量加入。\n3. 【生箔电镀】开启整流器，电流密度控制在 65-70 A/dm²，槽温 65 ± 2℃，阴极辊转速 4.5-5.0 m/min。",
            "1. 【厚度与单位重】按裁切冲样称重，标称厚度 12μm 对应面密度 106.8 ± 2.0 g/m²。\n2. 【毛面粗糙度】使用粗糙度仪测试毛面 Rz，控制在 1.2 ± 0.2 μm。\n3. 【抗拉强度与延伸率】拉力机测试，常温抗拉强度 ≥ 300 MPa，常温延伸率 ≥ 2.5%。"
        ),
        "PA后处理": (
            "1. 【水洗作业】生箔进入表处线前进行二级逆流去离子水洗，电导率必须控制在 ≤ 5.0 μS/cm。\n2. 【防氧化处理】防氧化槽通电，防氧化剂工作浓度控制在 3.0-4.0 g/L，槽温控制在 45-50℃。\n3. 【烘干作业】热风温度设定为 110-120℃，出烘箱温度不超过 45℃。",
            "1. 【外观检查】防氧化膜层必须呈淡蓝色或微黄色，无发暗、无水印和氧化斑。\n2. 【抗剥离强度】层压后剥离强度测试，常态 peel strength 应 ≥ 0.8 N/mm。\n3. 【耐热氧化性】空气烘箱中 180℃ 烘烤 30min 后，铜箔表面应无明显发黑或变色。"
        ),
        "PB涂布": (
            "1. 【配料作业】按配方比例称量硅烷偶联剂及溶剂，搅拌熟化时间不得少于 2小时。\n2. 【涂布作业】高精密涂布机线速设定为 12m/min，网纹辊涂布压力控制在 0.3-0.4 MPa。\n3. 【卷取作业】控制恒定张力收卷，收卷张力设定在 80-100 N。",
            "1. 【涂覆量测定】称重法测量偶联剂干膜重，目标范围应在 15-25 mg/m²。\n2. 【介质损耗 Df】高频测试系统测得 10GHz 下 Df 必须 ≤ 0.0012。\n3. 【收卷整齐度】收卷边缘错位量应 ≤ 2.0 mm。"
        )
    }

    for row in thickness_infos:
        pid = row[0]
        thick = row[1]
        for r in std_routings_4:
            stage_name = r[1]
            sop, sip = templates.get(stage_name, ("", ""))
            cursor.execute("""
            INSERT INTO product_routing (product_id, spec_thickness, routing_version, status, step_no, stage_name, device_name, device_code, standard_params, sop, sip)
            VALUES (?, ?, 'R1.0', '活动', ?, ?, ?, ?, ?, ?, ?)
            """, (pid, thick, r[0], r[1], r[2], r[3], json.dumps(r[4]), sop, sip))

    # ================= 导入实际工艺开发中试日志 (development_logs) =================
    # PTS-12 调试日志
    cursor.execute("""
    INSERT INTO development_logs (product_id, spec_thickness, stage, device_name, device_code, parameters, operator, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        1, 12.0, "溅镀工段", "1#磁控溅镀线", "EQ-溅镀-01",
        json.dumps({"vacuum": 0.0002, "work_pressure": 0.35, "power": 12.0, "voltage": 380, "current": 30.0, "ar_flow": 80, "temp": 65, "speed": 15.0, "thickness": 20.0, "uniformity": 1.2, "target_life": 50}),
        "赵工", "溶铜液配比基本稳定。", (p1_time + timedelta(days=2)).isoformat()
    ))
    cursor.execute("""
    INSERT INTO development_logs (product_id, spec_thickness, stage, device_name, device_code, parameters, operator, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        1, 12.0, "电镀工段", "2#生箔机阴极辊", "EQ-生箔-02",
        json.dumps({"current_density": 72.0, "drum_speed": 4.9, "electrolyte_temp": 60.5, "flow_rate": 125.0, "cl_conc": 34.2, "cu_conc": 84.8, "acid_conc": 111.5, "polar_gap": 10.0, "gel_flow": 122.0, "s_flow": 81.5}),
        "孙工", "尝试加大电流密度至 72 A/dm² 提高产出效率，注意观测毛面晶粒是否粗化。", (p1_time + timedelta(days=5)).isoformat()
    ))

    # HIS-1.5 调试日志
    cursor.execute("""
    INSERT INTO development_logs (product_id, spec_thickness, stage, device_name, device_code, parameters, operator, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (2, 1.5, "溅镀工段", "2#磁控溅镀线", "EQ-溅镀-02", json.dumps({"vacuum": 0.0003, "work_pressure": 0.35, "power": 15.0, "voltage": 380, "current": 39.5, "ar_flow": 80, "temp": 120, "speed": 8.0, "thickness": 50.0, "uniformity": 3.5, "target_life": 245}), "钱工", "溅镀金属化稳定", (p2_time + timedelta(days=2)).isoformat()))
    cursor.execute("""
    INSERT INTO development_logs (product_id, spec_thickness, stage, device_name, device_code, parameters, operator, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (2, 1.5, "溅镀工段", "磁控溅射镀膜机", "EQ-溅镀-01", json.dumps({"vacuum": 0.0003, "work_pressure": 0.35, "power": 15.0, "voltage": 380, "current": 39.5, "ar_flow": 80, "temp": 120, "speed": 8.0, "thickness": 50.0, "uniformity": 3.5, "target_life": 245}), "钱工", "溅镀正常", (p2_time + timedelta(days=5)).isoformat()))
    cursor.execute("""
    INSERT INTO development_logs (product_id, spec_thickness, stage, device_name, device_code, parameters, operator, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (2, 1.5, "电镀工段", "4#超薄生箔机", "EQ-生箔-04", json.dumps({"current_density": 60.0, "drum_speed": 8.0, "electrolyte_temp": 59.8, "flow_rate": 118.0, "cl_conc": 35.1, "cu_conc": 85.2, "acid_conc": 109.8, "polar_gap": 10.0, "gel_flow": 119.0, "s_flow": 79.8}), "孙工", "生箔中试合格", (p2_time + timedelta(days=8)).isoformat()))
    cursor.execute("""
    INSERT INTO development_logs (product_id, spec_thickness, stage, device_name, device_code, parameters, operator, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (2, 1.5, "PA后处理", "3#PA后处理线", "EQ-PA-03", json.dumps({"vacuum": 0.0003, "work_pressure": 0.31, "power": 14.8, "ar_flow": 102.0, "speed": 9.8, "thickness": 29.5, "uniformity": 2.6, "target_life": 155}), "李工", "PA后处理中试正常", (p2_time + timedelta(days=12)).isoformat()))
    cursor.execute("""
    INSERT INTO development_logs (product_id, spec_thickness, stage, device_name, device_code, parameters, operator, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (2, 1.5, "PB涂布", "2#高精密PB涂布机", "EQ-PB-02", json.dumps({"tension": 150.0, "slit_speed": 100.0, "aoi_defects": 0}), "吴工", "PB涂布完成", (p2_time + timedelta(days=15)).isoformat()))

    # DBJ-18 调试日志
    cursor.execute("""
    INSERT INTO development_logs (product_id, spec_thickness, stage, device_name, device_code, parameters, operator, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (3, 18.0, "溅镀工段", "1#磁控溅镀线", "EQ-溅镀-01", json.dumps({"vacuum": 0.0002, "work_pressure": 0.35, "power": 12.0, "voltage": 380, "current": 30.0, "ar_flow": 80, "temp": 65, "speed": 15.0, "thickness": 20.0, "uniformity": 1.2, "target_life": 50}), "钱工", "溅镀正常", (p3_time + timedelta(days=2)).isoformat()))
    cursor.execute("""
    INSERT INTO development_logs (product_id, spec_thickness, stage, device_name, device_code, parameters, operator, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (3, 18.0, "电镀工段", "1#生箔机阴极辊", "EQ-生箔-01", json.dumps({"current_density": 68.0, "drum_speed": 3.8, "electrolyte_temp": 60.1, "flow_rate": 121.0, "cl_conc": 34.8, "cu_conc": 84.9, "acid_conc": 110.2, "polar_gap": 10.0, "gel_flow": 120.5, "s_flow": 80.2}), "孙工", "生箔中试", (p3_time + timedelta(days=5)).isoformat()))
    cursor.execute("""
    INSERT INTO development_logs (product_id, spec_thickness, stage, device_name, device_code, parameters, operator, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (3, 18.0, "PA后处理", "1#PA后处理线", "EQ-PA-01", json.dumps({"vacuum": 0.0003, "work_pressure": 0.29, "power": 15.2, "ar_flow": 98.0, "speed": 10.2, "thickness": 30.5, "uniformity": 2.4, "target_life": 145}), "李工", "PA后处理中试合格", (p3_time + timedelta(days=8)).isoformat()))
    cursor.execute("""
    INSERT INTO development_logs (product_id, spec_thickness, stage, device_name, device_code, parameters, operator, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (3, 18.0, "PB涂布", "1#高精密PB涂布机", "EQ-PB-01", json.dumps({"tension": 240.0, "slit_speed": 180.0, "aoi_defects": 0}), "吴工", "PB涂布就绪", (p3_time + timedelta(days=10)).isoformat()))

    # ================= 导入测试记录 (test_records) =================
    # HIS-1.5 检测通过 (合格)
    cursor.execute("""
    INSERT INTO test_records (product_id, spec_thickness, batch_no, actual_thickness, roughness_rz_m, roughness_rz_s, peel_strength, df_10ghz, tensile_strength, elongation, test_result, tester, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (2, 1.5, "TEST-HIS15-B01", 1.52, 0.76, 0.38, 0.52, 0.00095, 295.0, 2.1, "合格", "张测试", (p2_time + timedelta(days=22)).isoformat()))

    # DBJ-18 测试合格
    cursor.execute("""
    INSERT INTO test_records (product_id, spec_thickness, batch_no, actual_thickness, roughness_rz_m, roughness_rz_s, peel_strength, df_10ghz, tensile_strength, elongation, test_result, tester, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (3, 18.0, "TEST-DBJ18-B01", 18.1, 1.42, 0.65, 0.88, 0.00142, 345.0, 3.4, "合格", "张测试", (p3_time + timedelta(days=12)).isoformat()))

    # ================= 导入 ECN 设变数据 (ecn_records) =================
    # ECN-001 (DBJ-18)
    ecn1_time = now - timedelta(days=10)
    cursor.execute("""
    INSERT INTO ecn_records (ecn_no, product_id, spec_thickness, change_type, change_reason, change_before, change_after, risk_assessment, status, dingtalk_instance_id, creator, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "ECN-20260626-001", 3, 18.0, "原料变更", 
        "原硅烷偶联剂含有非环保挥发物且高频Df略有浮动，需要变更为新型无挥发环保型硅烷处理剂(型号SL-203)。",
        "使用A品牌常规硅烷，PA后处理配方中浓度1.0%。",
        "使用SL-203新型环保硅烷，配方浓度微调为0.8%，干燥烘烤温度调高5℃。",
        json.dumps({"peel_effect": "提高 5-8%", "df_effect": "降低 0.00005 (改善)", "other_risk": "环保达标无增外潜在技术与质量风险"}),
        "已批准", "MOCK-INSTANCE-ECN-001", "李建国", ecn1_time.isoformat(), (ecn1_time + timedelta(days=1)).isoformat()
    ))

    # ECN-002 (PTS-12)
    ecn2_time = now - timedelta(days=1)
    cursor.execute("""
    INSERT INTO ecn_records (ecn_no, product_id, spec_thickness, change_type, change_reason, change_before, change_after, risk_assessment, status, dingtalk_instance_id, creator, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "ECN-20260705-001", 1, 12.0, "配方微调", 
        "为改善高频PTS-12的剥离结合强度，同时防止低粗糙度表面发生铜粉剥落，生箔添加剂明胶浓度由5.2ppm降为4.2ppm，SPS活性硫提高至9.0ppm。",
        "BOM配方：明胶添加量 5.2ppm, 活性硫 8.0ppm",
        "BOM配方：明胶添加量 4.2ppm, 活性硫 9.0ppm",
        json.dumps({"peel_effect": "预测剥离力增加 0.05 N/mm", "df_effect": "可能微幅上升 0.00002", "other_risk": "由于胶度下降，需特别防范生箔毛面粗糙度偏低的风险"}),
        "钉钉审批中", "MOCK-INSTANCE-ECN-002", "李建国", ecn2_time.isoformat(), ecn2_time.isoformat()
    ))

    # ================= 导入钉钉审批模拟日志 (dingtalk_logs) =================
    # ECN-001
    cursor.execute("""
    INSERT INTO dingtalk_logs (instance_id, related_type, related_id, title, content, status, approver, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "MOCK-INSTANCE-ECN-001", "ECN", 1, "工程变更 ECN 审批：高性能DBJ 双晶铜箔(18μm) 硅烷物料切换",
        json.dumps({"ecn_no": "ECN-20260626-001", "product": "HF-DBJ-18", "type": "原料变更", "reason": "防氧化层偶联剂更换"}),
        "COMPLETED", "研发副总王世杰", "经评估，SL-203有利于损耗改善，同意切换。", (ecn1_time + timedelta(hours=4)).isoformat()
    ))

    # PRODUCT-001 (PTS-12 立项通过)
    cursor.execute("""
    INSERT INTO dingtalk_logs (instance_id, related_type, related_id, title, content, status, approver, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "MOCK-INSTANCE-PROJ-001", "PRODUCT", 1, "新品开发立项审批：高频高速PTS AI铜箔(12μm)",
        json.dumps({"code": "HF-PTS-12", "name": "高频高速PTS AI铜箔(12μm)", "category": "PTS2 AI 铜箔"}),
        "COMPLETED", "总经理林聚赫", "同意立项，请抓紧进行配方研制。", (p1_time + timedelta(hours=6)).isoformat()
    ))

    # ECN-002 (待审批)
    cursor.execute("""
    INSERT INTO dingtalk_logs (instance_id, related_type, related_id, title, content, status, approver, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "MOCK-INSTANCE-ECN-002", "ECN", 1, "工程变更 ECN 审批：高频高速PTS AI铜箔(12μm) 添加剂比例调整",
        json.dumps({"ecn_no": "ECN-20260705-001", "product": "HF-PTS-12", "type": "配方微调"}),
        "RUNNING", None, None, ecn2_time.isoformat()
    ))

    # PRODUCT-003 (HIS-1.5 待审批立项流程)
    cursor.execute("""
    INSERT INTO dingtalk_logs (instance_id, related_type, related_id, title, content, status, approver, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "MOCK-INSTANCE-PROJ-003", "PRODUCT", 2, "新品开发立项审批：极薄HIS载体铜箔(1.5μm)",
        json.dumps({"code": "HF-HIS-03", "name": "极薄HIS载体铜箔(1.5μm)", "category": "HIS 载体铜箔", "spec_thickness": 1.5, "target_roughness": 0.80, "target_peel": 0.50, "target_df": 0.0010}),
        "RUNNING", None, None, p6_time.isoformat()
    ))

    # 为所有产品和厚度组合插入 TDS 初始版本 T1.0
    default_tds_items_pts = json.dumps([
        {"item_no": 1, "name_zh": "铜箔厚度(Avg.)", "name_en": "平均厚度", "unit": "um", "spec": "12±2", "test_standard": "千分尺 (Micro Meter)", "group": ""},
        {"item_no": 2, "name_zh": "厚度(oz)", "name_en": "厚度(oz)", "unit": "oz", "spec": "1/3", "test_standard": "IPC-TM-650 2.2.12", "group": ""},
        {"item_no": 3, "name_zh": "宽幅", "name_en": "宽度", "unit": "mm", "spec": "+3,-0", "test_standard": "直辊尺", "group": ""},
        {"item_no": 4, "name_zh": "长度", "name_en": "长度", "unit": "M", "spec": "+1/-0", "test_standard": "计米器", "group": ""},
        {"item_no": 5, "name_zh": "接箔数", "name_en": "接头数", "unit": "个", "spec": "不可有", "test_standard": "***", "group": ""},
        {"item_no": 6, "name_zh": "铜纯度", "name_en": "铜含量纯度", "unit": "%", "spec": "≥99.5", "test_standard": "IPC-TM-650 2.3.15", "group": ""},
        {"item_no": 7, "name_zh": "粗糙度 Rz", "name_en": "微观粗糙度 Rz", "unit": "um", "spec": "<0.2", "test_standard": "基恩士 VK3000 激光共聚焦显微镜(50x)", "group": "Matte side"},
        {"item_no": 8, "name_zh": "粗糙度 Sa", "name_en": "平均粗糙度 Sa", "unit": "um", "spec": "<0.05", "test_standard": "基恩士 VK3000 激光共聚焦显微镜(50x)", "group": "Matte side"},
        {"item_no": 9, "name_zh": "粗糙度 Sdr", "name_en": "展开面积比 Sdr", "unit": "-", "spec": "<0.03", "test_standard": "基恩士 VK3000 激光共聚焦显微镜(50x)", "group": "Matte side"},
        {"item_no": 10, "name_zh": "粗糙度 Rz", "name_en": "微观粗糙度 Rz", "unit": "um", "spec": "<0.4", "test_standard": "基恩士 VK3000 激光共聚焦显微镜(50x)", "group": "Shiny side"},
        {"item_no": 11, "name_zh": "粗糙度 Sa", "name_en": "平均粗糙度 Sa", "unit": "um", "spec": "<0.05", "test_standard": "基恩士 VK3000 激光共聚焦显微镜(50x)", "group": "Shiny side"},
        {"item_no": 12, "name_zh": "粗糙度 Sdr", "name_en": "展开面积比 Sdr", "unit": "-", "spec": "<0.03", "test_standard": "基恩士 VK3000 激光共聚焦显微镜(50x)", "group": "Shiny side"},
        {"item_no": 13, "name_zh": "抗张强度", "name_en": "热态抗拉强度", "unit": "MPa", "spec": ">270", "test_standard": "IPC-TM-650 2.4.18", "group": ""},
        {"item_no": 14, "name_zh": "延伸率", "name_en": "热态延伸率", "unit": "%", "spec": ">4", "test_standard": "IPC-TM-650 2.4.18", "group": ""},
        {"item_no": 15, "name_zh": "抗撕强度", "name_en": "层间撕裂强度", "unit": "kgf/cm", "spec": "≥0.35", "test_standard": "IPC-TM-650 2.4.8", "group": ""},
        {"item_no": 16, "name_zh": "外观检验", "name_en": "目视外观检验", "unit": "-", "spec": "参照外观检验标准", "test_standard": "IPC-TM-650 2.1.5", "group": ""}
    ])

    default_tds_items_his = json.dumps([
        {"item_no": 1, "name_zh": "载体铜箔厚度", "name_en": "载体厚度", "unit": "um", "spec": "18±1", "test_standard": "千分尺 (Micro Meter)", "group": ""},
        {"item_no": 2, "name_zh": "超薄铜层厚度", "name_en": "极薄铜箔厚度", "unit": "um", "spec": "3±0.3", "test_standard": "X射线荧光光谱仪 (XRF)", "group": ""},
        {"item_no": 3, "name_zh": "宽幅", "name_en": "宽度规格", "unit": "mm", "spec": "+3,-0", "test_standard": "直辊尺", "group": ""},
        {"item_no": 4, "name_zh": "粗糙度 Rz (超薄层)", "name_en": "超薄层粗糙度 Rz", "unit": "um", "spec": "<0.3", "test_standard": "基恩士 VK3000 激光共聚焦显微镜", "group": ""},
        {"item_no": 5, "name_zh": "剥离强度", "name_en": "剥离层间结合力", "unit": "N/mm", "spec": "≥0.50", "test_standard": "IPC-TM-650 2.4.8", "group": ""},
        {"item_no": 6, "name_zh": "铜纯度", "name_en": "铜纯度百分比", "unit": "%", "spec": "≥99.5", "test_standard": "IPC-TM-650 2.3.15", "group": ""},
        {"item_no": 7, "name_zh": "Df 介质损耗 @10GHz", "name_en": "高频介质损耗 Df", "unit": "-", "spec": "≤0.0010", "test_standard": "IPC-TM-650 2.5.5", "group": ""}
    ])

    for row in thickness_infos:
        pid = row[0]
        thick = row[1]
        tds_items = default_tds_items_his if pid == 2 else default_tds_items_pts
        cursor.execute("""
        INSERT INTO product_tds (product_id, spec_thickness, tds_version, status, tds_items, notes, updater, created_at)
        VALUES (?, ?, 'T1.0', '活动', ?, '初始版本', '工艺工程师', ?)
        """, (pid, thick, tds_items, now.isoformat()))

    # ---- 4. 创建 MQC 物料承认表与供应商表 ----
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS mqc_materials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mat_code TEXT NOT NULL,
            mat_name TEXT,
            mat_spec TEXT,
            mat_category TEXT,
            apply_date TEXT,
            apply_by TEXT,
            status TEXT DEFAULT '需求提出',
            test_start TEXT,
            test_end TEXT,
            test_result TEXT,
            conclusion TEXT,
            conclusion_by TEXT,
            conclusion_date TEXT,
            remark TEXT,
            created_at TEXT
        )
    ''')
    cursor.execute('''
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
            status TEXT DEFAULT '活跃'
        )
    ''')

    # 插入默认物料承认数据
    mqc_materials_data = [
        ("MAT-CU-001", "高纯铜线", "99.99%级", "氧化铜粉", "2026-07-01", "MAT-CU-001_承认书.pdf", "承认通过", "2026-07-02", "2026-07-05", "纯度及导电率检测合格。", "通过", "傅总监", "2026-07-05", "BOM 主要材料导入", now.isoformat()),
        ("MAT-ACID-001", "电子级硫酸", "98%浓度", "辅料", "2026-07-01", "MAT-ACID-001_承认书.pdf", "承认通过", "2026-07-02", "2026-07-04", "杂质及浓度符合标准。", "通过", "傅总监", "2026-07-04", "BOM 主要材料导入", now.isoformat()),
        ("AD-GEL-01", "特种明胶骨胶", "生箔添加剂", "添加剂", "2026-07-05", "AD-GEL-01_承认书.pdf", "承认通过", "2026-07-06", "2026-07-08", "拉伸性能及溶解度测试合格。", "通过", "傅总监", "2026-07-09", "规格已更新为生箔添加剂", now.isoformat()),
        ("AD-HEC-01", "羟乙基纤维素", "生箔添加剂", "添加剂", "2026-07-05", "AD-HEC-01_承认书.pdf", "承认通过", "2026-07-06", "2026-07-08", "灰分及分子量测试合格。", "通过", "傅总监", "2026-07-09", "BOM 主要材料导入", now.isoformat()),
        ("AD-SPS-01", "活性硫整平剂", "生箔添加剂", "添加剂", "2026-07-05", "AD-SPS-01_承认书.pdf", "承认通过", "2026-07-06", "2026-07-08", "电化学测试及极化度合格。", "通过", "傅总监", "2026-07-09", "BOM 主要材料导入", now.isoformat()),
        ("MAT-SILANE-203", "常规硅烷偶联剂", "常规硅烷-201", "添加剂", "2026-06-15", "MAT-SILANE-203_承认书.pdf", "承认通过", "2026-06-18", "2026-06-25", "附着力与阻抗一致性合格。", "通过", "傅总监", "2026-06-26", "规格已更新为常规硅烷-201", now.isoformat()),
        ("MAT-CU-BALL-001", "高纯铜球 (阴极铜级)", "直径25mm, 纯度>=99.995%", "氧化铜粉", "2026-07-01", "张经理", "样品到达", "2026-07-02", "", "纯度及氧含量已测，溶解度指标测试中。", "", "", "", "一供、二供样品平行送测", now.isoformat())
    ]
    for row in mqc_materials_data:
        cursor.execute("""
            INSERT INTO mqc_materials (mat_code, mat_name, mat_spec, mat_category, apply_date, apply_by, status, test_start, test_end, test_result, conclusion, conclusion_by, conclusion_date, remark, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, row)

    # 为已承认的物料承认记录灌入配套已通过的钉钉流程日志
    for i, row in enumerate(mqc_materials_data[:6]):
        mat_id = i + 1
        mat_code = row[0]
        mat_name = row[1]
        instance_id = f"DING-MQC-INIT-{mat_id}"
        title = f"新物料承认审批：{mat_name}（{mat_code}）"
        content_dict = {
            "mat_id": mat_id,
            "mat_code": mat_code,
            "mat_name": mat_name,
            "submit_time": now.strftime("%Y-%m-%d %H:%M:%S"),
            "flow_type": "新物料承认"
        }
        cursor.execute("""
            INSERT OR REPLACE INTO dingtalk_logs 
                (instance_id, related_type, related_id, title, content, status, approver, comment, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (instance_id, "MQC_MATERIAL", mat_id, title, json.dumps(content_dict, ensure_ascii=False), "COMPLETED", "傅总监", "系统初始化默认承认通过", now))

    # 插入默认供应商数据
    mqc_suppliers_data = [
        # 铜箔 & 铜线
        ("MAT-CU-001", "江西铜业集团有限公司", "一供", "王业务", "138-1111-2222", "低", "产能及供应极其稳定", "2026-07-05", "活跃"),
        ("MAT-CU-001", "云南铜业股份有限公司", "二供", "李经理", "139-3333-4444", "低", "二供备选通道", "2026-07-05", "活跃"),
        ("MAT-CU-BALL-001", "江西铜业集团有限公司", "一供", "王业务", "138-1111-2222", "低", "国内首屈一指的高纯铜供应商，产能充沛", "2026-07-05", "活跃"),
        ("MAT-CU-BALL-001", "云南铜业股份有限公司", "二供", "李经理", "139-3333-4444", "低", "备选二供，运输路线较长但品质稳定", "2026-07-05", "活跃"),
        
        # 硫酸
        ("MAT-ACID-001", "巨化集团化学有限公司", "一供", "徐业务", "135-8888-9999", "低", "电子级化学品大厂", "2026-07-05", "活跃"),
        ("MAT-ACID-001", "晶瑞电子材料股份有限公司", "二供", "陈经理", "137-7777-8888", "低", "电子级硫酸优秀供应商", "2026-07-05", "活跃"),
        
        # 明胶：主供暂停，无二供
        ("AD-GEL-01", "嘉吉明胶 (Cargill) 有限公司", "一供", "Cargill sales", "400-820-8820", "高", "由于上游疯牛病环保核查，产能暂停输出", "2026-07-06", "暂停"),
        
        # HEC
        ("AD-HEC-01", "陶氏化学 (DOW)", "一供", "张经理", "186-0000-1111", "低", "原装进口，品质极其稳定", "2026-07-09", "活跃"),
        ("AD-HEC-01", "阿克苏诺贝尔 (AkzoNobel)", "二供", "王经理", "185-2222-3333", "低", "备选二供，国内仓储充足", "2026-07-09", "活跃"),
        
        # SPS
        ("AD-SPS-01", "巴斯夫 (BASF) 股份公司", "一供", "刘经理", "189-4444-5555", "低", "全球化工巨巨，质量有保障", "2026-07-09", "活跃"),
        ("AD-SPS-01", "信越化学 (Shin-Etsu)", "二供", "吴经理", "188-6666-7777", "低", "备选二供，交期较短", "2026-07-09", "活跃"),
        
        # 硅烷
        ("MAT-SILANE-203", "陶氏化学 (DOW) 贸易有限公司", "一供", "张总代", "186-5555-6666", "高", "技术垄断性强，暂无合适二供，面临地缘与关税断供风险", "2026-06-26", "活跃")
    ]
    for row in mqc_suppliers_data:
        cursor.execute("""
            INSERT INTO mqc_suppliers (mat_code, supplier_name, supplier_tier, contact, phone, risk_level, risk_note, approved_date, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, row)

    # ---- 5. 创建并初始化受控任务管控表 (tasks & task_logs) ----
    cursor.execute("""
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
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS task_logs (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id  INTEGER NOT NULL,
            log_time TEXT,
            log_by   TEXT,
            content  TEXT
        )
    """)

    # 插入默认任务数据
    default_tasks = [
        ("TASK-20260717-001", "溅镀功率参数工艺评审", 1, "法", "高", "李建国", "2026-07-15", "2026-07-18", None, "进行中", "评估大面积靶材的功率分布一致性", now.isoformat(), now.isoformat()),
        ("TASK-20260717-002", "生箔添加剂配方合规审核", 1, "料", "高", "张小贤", "2026-07-10", "2026-07-14", "2026-07-14", "已完成", "确立明胶骨胶配方体系", now.isoformat(), now.isoformat()),
        ("TASK-20260717-003", "阴极辊转速级联调试工作", 2, "机", "中", "赵设备", "2026-07-16", "2026-07-20", None, "待启动", "配合 3# 生箔机调试计划", now.isoformat(), now.isoformat())
    ]
    for row in default_tasks:
        cursor.execute("""
            INSERT INTO tasks (task_no, title, product_id, category_5m, priority, owner, plan_start, plan_end, actual_end, status, remark, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, row)

    conn.commit()
    conn.close()
    print("Database initial simulated data imported successfully.")
    return True

if __name__ == "__main__":
    import sys
    force_reset = "--force" in sys.argv or "-f" in sys.argv
    if os.path.exists(DB_PATH) and not force_reset:
        print(f"【提示】检测到 SQLite 数据库文件已存在，数据完好无损。")
        print("已自动跳过初始化灌库操作，以保护您在运行中新增/编辑的全部数据。")
        print("（若您想彻底重置系统，请手动在命令行执行: python3 init_db.py --force）")
        sys.exit(0)
    result = init_database(force_reset=force_reset)
    if result:
        print("初始化完成！")
    else:
        print("数据库已存在，未作任何修改。")
