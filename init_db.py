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
        
        stage_inputs = {
            "stage1_plan": ["项目启动意向书.docx", "前期可行性研究报告.pdf"],
            "stage2_scheme": ["设备设计任务书.pdf", "工艺性能指标书.xlsx"],
            "stage3_bidding": ["技术方案评审意见书.docx", "采购请购申请表.xlsx"],
            "stage4_make": ["中标通知书.pdf", "采购合同与技术协议.pdf"],
            "stage5_install": ["出厂合格证.pdf", "设备动能供给规范.docx"],
            "stage6_accept": ["安装自检自测报告.pdf", "设备单机试运转记录.xlsx"]
        }
        plan[s_key] = {
            "title": s_title,
            "status": s_status,
            "start_date": start_date,
            "end_date": end_date,
            "owner": s_owner,
            "remark": f"{s_title}阶段正常进展" if s_status != "未开始" else "",
            "attachment_name": att_name if s_status != "未开始" else "",
            "attachment_url": att_url if s_status != "未开始" else "",
            "input_files": stage_inputs[s_key] if s_status != "未开始" else []
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
        permissions_json TEXT DEFAULT '{}',
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
        using_unit VARCHAR(100),
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

    # 生成各阶段进度的计划 JSON
    p_g1 = make_default_equipment_project_plan(0) # G1进行中
    p_g2 = make_default_equipment_project_plan(1) # G2进行中
    p_g3 = make_default_equipment_project_plan(2) # G3进行中
    p_g4 = make_default_equipment_project_plan(3) # G4进行中
    p_g5 = make_default_equipment_project_plan(4) # G5进行中
    p_g6_inprogress = make_default_equipment_project_plan(5) # G6进行中
    p_g6_completed = make_default_equipment_project_plan(6) # G6已完成
    
    # 插入初始设备数据 (各阶段均有 3 个或以上设备)
    cursor.executemany("""
    INSERT INTO equipments (device_code, device_name, stage_name, status, oee, next_maintenance, parameters_json, project_plan_json, operator, using_unit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, [
        # G1. 立项 (3个)
        ("EQ-SC-01", "1#极速生箔机", "生产设备", "导入中", 0.0, None, '{}', p_g1, "生箔设备组", None),
        ("EQ-CW-02", "2#纯水分配泵", "厂务设备", "导入中", 0.0, None, '{}', p_g1, "动力机电组", None),
        ("EQ-JC-02", "自动光学缺陷检测仪", "检测设备", "导入中", 0.0, None, '{}', p_g1, "品质检验组", None),

        # G2. 拟定技术方案 (3个)
        ("EQ-SC-02", "2#高精密磁控溅镀线", "生产设备", "导入中", 0.0, None, '{}', p_g2, "表处设备组", None),
        ("EQ-CW-03", "3#酸性尾气吸收塔", "厂务设备", "导入中", 0.0, None, '{}', p_g2, "动力机电组", None),
        ("EQ-AGV-02", "2#重载堆垛AGV", "仓储搬运设备", "导入中", 0.0, None, '{}', p_g2, "仓储物流组", None),

        # G3. 请购发包 (3个)
        ("EQ-SC-03", "1#宽幅高精度涂布机", "生产设备", "导入中", 0.0, None, '{}', p_g3, "涂布设备组", None),
        ("EQ-CW-04", "4#冷冻机组", "厂务设备", "导入中", 0.0, None, '{}', p_g3, "动力机电组", None),
        ("EQ-JC-03", "激光测厚仪A", "检测设备", "导入中", 0.0, None, '{}', p_g3, "品质检验组", None),

        # G4. 制作中 (3个)
        ("EQ-SC-04", "1#精密贴膜机", "生产设备", "导入中", 0.0, None, '{}', p_g4, "贴膜设备组", None),
        ("EQ-CW-05", "纯水除盐吸附柱", "厂务设备", "导入中", 0.0, None, '{}', p_g4, "动力机电组", None),
        ("EQ-AGV-03", "原料自动立体仓叉车", "仓储搬运设备", "导入中", 0.0, None, '{}', p_g4, "仓储物流组", None),

        # G5. 安装调试中 (3个)
        ("EQ-生箔-03", "3#生箔机及阴极辊(项目导入中)", "生产设备", "导入中", 0.0, None, '{}', p_g5, "生箔设备组", None),
        ("EQ-CW-06", "车间除湿净化空调系统", "厂务设备", "导入中", 0.0, None, '{}', p_g5, "动力机电组", None),
        ("EQ-JC-04", "拉力试验检测仪", "检测设备", "导入中", 0.0, None, '{}', p_g5, "品质检验组", None),

        # G6. 验收交付使用与运行中 (4个)
        ("EQ-SC-06", "1#高速分切收卷机", "生产设备", "导入中", 0.0, None, '{}', p_g6_inprogress, "收卷设备组", None),
        ("EQ-CW-01", "1#超纯水处理机", "厂务设备", "运行中", 95.0, "2026-09-01", '{}', p_g6_completed, "动力机电组", "动力厂务部"),
        ("EQ-JC-01", "高精度在线测厚仪", "检测设备", "运行中", 98.0, "2026-09-15", '{}', p_g6_completed, "品质检验组", "质检中心"),
        ("EQ-AGV-01", "1#自动AGV搬运车", "仓储搬运设备", "运行中", 96.5, "2026-10-01", '{}', p_g6_completed, "仓储物流组", "仓储物流部")
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





    # ================= 导入基准工艺路线 (Routing) 模拟数据 =================
    std_routings_4 = [
        (1, "溅镀工段", "1#磁控溅镀线", "EQ-溅镀-01", {"vacuum": 0.0002, "work_pressure": 0.35, "power": 12.0, "voltage": 380, "current": 30.0, "ar_flow": 80, "temp": 65, "speed": 15.0, "thickness": 20.0, "uniformity": 1.2, "target_life": 50}),
        (2, "电镀工段", "2#生箔机阴极辊", "EQ-生箔-02", {"speed": 0.24, "ph": 7.0, "conductivity": 1.5, "cu_conc": 130.0, "acid_conc": 130.0, "cl_conc": 70.0, "rf_b": 2.0, "rf_c": 20.0, "rf_l": 10.0, "temp": 23.0, "xl_conc": 700.0, "anti_ph": 6.0, "anti_temp": 20.0, "anti_time": 15.0, "filter_pressure": 0.8, "wash_temp": 30.0, "oven_temp": 70.0}),
        (3, "PA后处理", "2#磁控溅镀处理线", "EQ-PA溅镀-02", {"vacuum": 0.0003, "work_pressure": 0.30, "power": 15.0, "ar_flow": 100.0, "speed": 10.0, "thickness": 30.0, "uniformity": 2.5, "target_life": 150}),
        (4, "PB涂布", "1#高精密PB涂布机", "EQ-PB-01", {"tension": 220.0, "slit_speed": 150.0}),
        (5, "脱膜工段", "1#高速脱膜机", "EQ-脱膜-05", {"speed": 5.0, "unwind_tension": 7.0, "rewind_left_tension": 0.0, "rewind_right_tension": 6.0, "trim_left_tension": 0.1, "trim_right_tension": 0.1})
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
        ),
        "脱膜工段": (
            "1. 【放卷准备】检查来料卷材端面整齐度与外观，将电镀成品卷安装在放卷轴上，穿好基材，张力控制在 7±1 Kg (18/35um) 或 6±1 Kg (4.5um)。\n2. 【脱膜作业】设定速度 5±2 m/min (18/35um) 或 6±2 m/min (4.5um)，收卷左/右张力依据幅宽进行匹配，切边张力维持在 0.1 Kg。\n3. 【卷取作业】纠偏仪处于自动对齐状态，收卷端面对齐度控制在 ≤ 1.0 mm。",
            "1. 【外观目检】脱膜边缘平整无飞边、无毛刺、无明显丝折与刮伤。\n2. 【收卷硬度】使用硬度计测试成品卷表面硬度，硬度均匀度偏差 ≤ 5度。\n3. 【端面整齐度】端面错位量测试，脱膜成品卷边缘侧位量应 ≤ 0.5 mm。"
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
        json.dumps({"speed": 0.32, "ph": 7.1, "conductivity": 1.6, "cu_conc": 132.0, "acid_conc": 128.0, "cl_conc": 68.0, "rf_b": 2.1, "rf_c": 19.0, "rf_l": 9.5, "temp": 23.5, "xl_conc": 710.0, "anti_ph": 6.1, "anti_temp": 20.5, "anti_time": 16.0, "filter_pressure": 0.82, "wash_temp": 31.0, "oven_temp": 72.0}),
        "孙工", "尝试加大线速至 0.32 m/min 提高产出效率，注意观测毛面晶粒是否粗化。", (p1_time + timedelta(days=5)).isoformat()
    ))





    # ================= 导入测试记录 (test_records) =================




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
            supplier_name TEXT,
            status TEXT DEFAULT '需求提出',
            test_start TEXT,
            test_end TEXT,
            test_result TEXT,
            conclusion TEXT,
            conclusion_by TEXT,
            conclusion_date TEXT,
            remark TEXT,
            supplier_doc TEXT,
            tds_doc TEXT,
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
            status TEXT DEFAULT '活跃',
            approval_status TEXT DEFAULT '需求提出',
            apply_by TEXT,
            test_start TEXT,
            test_end TEXT,
            test_result TEXT
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
        ("MAT-CU-001", "江西铜业集团有限公司", "一供", "王业务", "138-1111-2222", "低", "产能及供应极其稳定", "2026-07-05", "活跃", "承认通过", "MAT-CU-001_江铜_承认书.pdf", "2026-07-02", "2026-07-05", "纯度及导电率检测合格。"),
        ("MAT-CU-001", "云南铜业股份有限公司", "二供", "李经理", "139-3333-4444", "低", "二供备选通道", "2026-07-05", "活跃", "样品到达", None, "2026-07-06", None, "样品已到达库房等待检测"),
        ("MAT-CU-BALL-001", "江西铜业集团有限公司", "一供", "王业务", "138-1111-2222", "低", "国内首屈一指的高纯铜供应商，产能充沛", "2026-07-05", "活跃", "测试中", None, "2026-07-08", None, "正在进行溶解速率与杂质含量测试"),
        ("MAT-CU-BALL-001", "云南铜业股份有限公司", "二供", "李经理", "139-3333-4444", "低", "备选二供，运输路线较长但品质稳定", "2026-07-05", "活跃", "需求提出", None, None, None, None),
        
        # 硫酸
        ("MAT-ACID-001", "巨化集团化学有限公司", "一供", "徐业务", "135-8888-9999", "低", "电子级化学品大厂", "2026-07-05", "活跃", "承认通过", "MAT-ACID-001_巨化_承认书.pdf", "2026-07-02", "2026-07-04", "杂质及浓度符合电子级标准。"),
        ("MAT-ACID-001", "晶瑞电子材料股份有限公司", "二供", "陈经理", "137-7777-8888", "低", "电子级硫酸优秀供应商", "2026-07-05", "活跃", "承认通过", "MAT-ACID-001_晶瑞_承认书.pdf", "2026-07-03", "2026-07-05", "符合主供性能指标。"),
        
        # 明胶：主供暂停，无二供
        ("AD-GEL-01", "嘉吉明胶 (Cargill) 有限公司", "一供", "Cargill sales", "400-820-8820", "高", "由于上游疯牛病环保核查，产能暂停输出", "2026-07-06", "暂停", "承认拒绝", "AD-GEL-01_Cargill_承认书.pdf", "2026-07-06", "2026-07-08", "上游核查未通过。"),
        
        # HEC
        ("AD-HEC-01", "陶氏化学 (DOW)", "一供", "张经理", "186-0000-1111", "低", "原装进口，品质极其稳定", "2026-07-09", "活跃", "承认通过", "AD-HEC-01_DOW_承认书.pdf", "2026-07-06", "2026-07-08", "灰分及粘度指标通过检测。"),
        ("AD-HEC-01", "阿克苏诺贝尔 (AkzoNobel)", "二供", "王经理", "185-2222-3333", "低", "备选二供，国内仓储充足", "2026-07-09", "活跃", "测试中", None, "2026-07-09", None, "常规物性测定中。"),
        
        # SPS
        ("AD-SPS-01", "巴斯夫 (BASF) 股份公司", "一供", "刘经理", "189-4444-5555", "低", "全球化工巨巨，质量有保障", "2026-07-09", "活跃", "承认通过", "AD-SPS-01_BASF_承认书.pdf", "2026-07-06", "2026-07-08", "极化性能测定及寿命优异。"),
        ("AD-SPS-01", "信越化学 (Shin-Etsu)", "二供", "吴经理", "188-6666-7777", "低", "备选二供，交期较短", "2026-07-09", "活跃", "需求提出", None, None, None, None),
        
        # 硅烷
        ("MAT-SILANE-203", "陶氏化学 (DOW) 贸易有限公司", "一供", "张总代", "186-5555-6666", "高", "技术垄断性强，暂无合适二供，面临地缘与关税断供风险", "2026-06-26", "活跃", "承认通过", "MAT-SILANE-203_DOW_承认书.pdf", "2026-06-18", "2026-06-25", "粘结附着力及耐热性测试合格。")
    ]
    for row in mqc_suppliers_data:
        cursor.execute("""
            INSERT INTO mqc_suppliers (mat_code, supplier_name, supplier_tier, contact, phone, risk_level, risk_note, approved_date, status, approval_status, apply_by, test_start, test_end, test_result)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

    # ---- 6. 创建并初始化 PDCA 质量持续改善表 (pdca_records) ----
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS pdca_records (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            code          TEXT NOT NULL UNIQUE,
            title         TEXT NOT NULL,
            product_id    INTEGER,
            thickness     NUMERIC,
            factor_5m1e   TEXT DEFAULT '法',
            stage         TEXT DEFAULT 'Plan',
            status        TEXT DEFAULT '进行中',
            problem_desc  TEXT,
            root_cause    TEXT,
            action_plan   TEXT,
            verify_result TEXT,
            owner         TEXT,
            target_date   TEXT,
            ecn_id        INTEGER,
            created_at    TEXT,
            updated_at    TEXT
        )
    """)

    default_pdcas = [
        ("PDCA-2026-001", "3μm 超薄铜箔剥离强度测试波动分析改善", 1, 3.0, "法", "Check", "进行中", "3μm 生箔脱膜后剥离强度极差达到 0.3 N/mm，超出研发管控上限", "后处理偶联剂涂布辊浸润不均，烘干温度梯度设定偏低导致偶联键合力不稳定", "1. 调整 2# 涂布槽液位与偶联剂温度至 45℃\n2. 优化后处理烘道三段温区为 110℃-130℃-120℃\n3. 拟发起 ECN-20260718-001 工艺参数设变", "中试线连续 5 批次测试极差降至 0.08 N/mm，剥离强度均值提升 18%", "李建国", "2026-07-28", None, now.isoformat(), now.isoformat()),
        ("PDCA-2026-002", "生箔工段 3# 阴极辊表面晶核微瑕疵归因与消除", 2, 2.0, "机", "Act", "已闭环", "生箔表面出现微米级针孔，影响后续溅镀铜层致密度", "阴极辊表面钛材钝化膜局部磨损，局部电流密度过高产生氢气泡", "1. 执行阴极辊在线抛光精磨工艺\n2. 增加槽液打循环过滤精度至 0.2μm\n3. 建立阴极辊保养标准化 SOP (DMS)", "连续 30 天生产零针孔缺陷，生箔一次合格率提高至 99.4%", "赵设备", "2026-07-15", None, now.isoformat(), now.isoformat()),
        ("PDCA-2026-003", "二供活性硫整平剂批次杂质超标防错管控", 1, 12.0, "料", "Plan", "进行中", "新入厂第二供应商 AD-SPS-01 纯度分析发现痕量氯离子超标", "供应商预处理提纯工序控温不稳，送样抽检盲区", "1. 规范 MQC 入厂检核标准，新增离子色谱必检项\n2. 发函要求供应商提交 CAPA 8D 改善报告", "待供应商提交整改报告并进行重新抽检验货", "张小贤", "2026-08-05", None, now.isoformat(), now.isoformat())
    ]

    for row in default_pdcas:
        cursor.execute("""
            INSERT INTO pdca_records (code, title, product_id, thickness, factor_5m1e, stage, status, problem_desc, root_cause, action_plan, verify_result, owner, target_date, ecn_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
