import sqlite3
import json
import os
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "plm.db")

def make_bom_items_json(copper, acid, gel, hec, s, silane_type, silane_conc):
    items = [
        { "material_code": "MAT-CU-001", "material_name": "高纯铜线", "material_spec": "99.99%级", "ratio_value": copper, "unit": "%" },
        { "material_code": "MAT-ACID-001", "material_name": "电子级硫酸", "material_spec": "98%浓度", "ratio_value": acid, "unit": "%" },
        { "material_code": "AD-GEL-01", "material_name": "特种明胶骨胶", "material_spec": "生箔添加剂", "ratio_value": gel, "unit": "ppm" },
        { "material_code": "AD-HEC-01", "material_name": "羟乙基纤维素", "material_spec": "生箔添加剂", "ratio_value": hec, "unit": "ppm" },
        { "material_code": "AD-SPS-01", "material_name": "活性硫整平剂", "material_spec": "生箔添加剂", "ratio_value": s, "unit": "ppm" },
        { "material_code": "MAT-SILANE-203", "material_name": "常规硅烷偶联剂", "material_spec": silane_type, "ratio_value": silane_conc, "unit": "%" }
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

def init_database():
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        print("Existing database file removed.")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 1. 创建产品生命周期与 TDS 规格限值表
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        category VARCHAR(50) NOT NULL,
        spec_thickness REAL NOT NULL,
        target_roughness REAL NOT NULL,
        target_peel REAL NOT NULL,
        target_df REAL NOT NULL,
        target_tensile REAL NOT NULL,
        target_elongation REAL NOT NULL,
        status VARCHAR(50) NOT NULL,
        creator VARCHAR(50) NOT NULL,
        npi_project_plan TEXT, -- JSON 格式存储五门禁项目计划(开始、完成、负责人)
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 2. 创建产品配方 BOM 表（包含多版本控制）
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS product_bom (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        version VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL, -- '活动' / '历史' / '草稿'
        copper_wire_ratio REAL, -- 铜料配比 %
        sulfuric_acid_ratio REAL, -- 硫酸配比 %
        additive_gel REAL, -- 生箔添加剂：明胶 ppm
        additive_hec REAL, -- 生箔添加剂：HEC ppm
        additive_s REAL, -- 生箔添加剂：活性硫 ppm
        silane_type VARCHAR(50), -- 表面处理：硅烷偶联剂型号
        silane_conc REAL, -- 表面处理：硅烷涂覆浓度 %
        bom_items TEXT, -- JSON 格式存储的柔性物料配方清单
        updater VARCHAR(50) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
    """)

    # 3. 创建产品基准工艺路线表 (Routing)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS product_routing (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        routing_version VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL, -- '活动' / '历史'
        step_no INTEGER NOT NULL,
        stage_name VARCHAR(50) NOT NULL,
        device_name VARCHAR(100) NOT NULL,
        device_code VARCHAR(50) NOT NULL,
        standard_params TEXT NOT NULL, -- 以 JSON 格式存储推荐的工艺控制基准值
        custom_params TEXT DEFAULT '[]', -- 自定义参数键值对（JSON 数组）
        notes TEXT DEFAULT '', -- 版本变更说明（类似 commit message）
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
    """)

    # 4. 创建工艺开发实际录入日志表（用于和 Routing 标准规范比对）
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS development_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        stage VARCHAR(50) NOT NULL,
        device_name VARCHAR(100) NOT NULL,
        device_code VARCHAR(50) NOT NULL,
        parameters TEXT NOT NULL,
        operator VARCHAR(50) NOT NULL,
        remarks TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
    """)

    # 5. 创建产品物理与高频电性能测试数据表
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS test_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        batch_no VARCHAR(50) UNIQUE NOT NULL,
        actual_thickness REAL NOT NULL,
        roughness_rz_m REAL NOT NULL,
        roughness_rz_s REAL NOT NULL,
        peel_strength REAL NOT NULL,
        df_10ghz REAL NOT NULL,
        tensile_strength REAL NOT NULL,
        elongation REAL NOT NULL,
        test_result VARCHAR(20) NOT NULL,
        tester VARCHAR(50) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
    """)

    # 6. 创建工程变更 ECN 表
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ecn_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ecn_no VARCHAR(50) UNIQUE NOT NULL,
        product_id INTEGER NOT NULL,
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

    # 7. 创建钉钉配置及调试表
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

    # 8. 创建钉钉审批实例与操作日志表
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

    # 9. 创建 TDS 技术规格书版本管控表
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS product_tds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
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
        ("pe_li", "李工", "Process Engineer", "启用"),
        ("qe_chen", "陈工", "Quality Engineer", "启用"),
        ("guest", "访客", "Viewer", "启用")
    ])

    # 导入仿真模拟数据
    now = datetime.now()
    
    # 模拟数据 1: PTS AI 铜箔 12um (生箔中试调试阶段 - 电流超标异常案例)
    p1_time = now - timedelta(days=15)
    p1_plan = make_default_project_plan(p1_time, "李建国")
    cursor.execute("""
    INSERT INTO products (code, name, category, spec_thickness, target_roughness, target_peel, target_df, target_tensile, target_elongation, status, creator, npi_project_plan, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, ("HF-PTS-12", "高频高速PTS AI铜箔(12μm)", "PTS AI 铜箔", 12.0, 1.20, 0.75, 0.0013, 310.0, 2.5, "生箔电镀中", "李建国", p1_plan, p1_time, p1_time))
    p1_id = cursor.lastrowid

    # 模拟数据 2: HIS 载体铜箔 2um (量产送样阶段 - 完美通关案例)
    p2_time = now - timedelta(days=30)
    p2_plan = make_default_project_plan(p2_time, "张小贤")
    cursor.execute("""
    INSERT INTO products (code, name, category, spec_thickness, target_roughness, target_peel, target_df, target_tensile, target_elongation, status, creator, npi_project_plan, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, ("HF-HIS-02", "高深超薄HIS载体铜箔(2μm)", "HIS 载体铜箔", 2.0, 0.80, 0.50, 0.0010, 290.0, 2.0, "测试验证中", "张小贤", p2_plan, p2_time, p2_time))
    p2_id = cursor.lastrowid

    # 模拟数据 3: 背板双晶铜箔 18um (已发布量产阶段)
    p3_time = now - timedelta(days=60)
    p3_plan = make_default_project_plan(p3_time, "李建国")
    cursor.execute("""
    INSERT INTO products (code, name, category, spec_thickness, target_roughness, target_peel, target_df, target_tensile, target_elongation, status, creator, npi_project_plan, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, ("HF-DBJ-18", "高性能背板双晶铜箔(18μm)", "背板双晶铜箔", 18.0, 1.50, 0.85, 0.0015, 340.0, 3.2, "量产中", "李建国", p3_plan, p3_time, p3_time))
    p3_id = cursor.lastrowid

    # 模拟数据 4: PTS AI 铜箔 35um (草稿立项中)
    p4_time = now - timedelta(days=2)
    p4_plan = make_default_project_plan(p4_time, "王强")
    cursor.execute("""
    INSERT INTO products (code, name, category, spec_thickness, target_roughness, target_peel, target_df, target_tensile, target_elongation, status, creator, npi_project_plan, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, ("HF-PTS-35", "大功率高稳定PTS AI铜箔(35μm)", "PTS AI 铜箔", 35.0, 1.60, 0.90, 0.0016, 350.0, 3.5, "立项中", "王强", p4_plan, p4_time, p4_time))
    p4_id = cursor.lastrowid

    # 新增模拟数据 5: PTS AI 铜箔 18um (品质化验验证阶段 - Df超标品质拦截不合格案例)
    p5_time = now - timedelta(days=25)
    p5_plan = make_default_project_plan(p5_time, "赵立功")
    cursor.execute("""
    INSERT INTO products (code, name, category, spec_thickness, target_roughness, target_peel, target_df, target_tensile, target_elongation, status, creator, npi_project_plan, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, ("HF-PTS-18", "超低损耗PTS AI铜箔(18μm)", "PTS AI 铜箔", 18.0, 1.20, 0.80, 0.0013, 310.0, 2.5, "测试验证中", "赵立功", p5_plan, p5_time, p5_time))
    p5_id = cursor.lastrowid

    # 新增模拟数据 6: HIS 载体铜箔 1.5um (钉钉立项审批等待案例)
    p6_time = now - timedelta(hours=6)
    p6_plan = make_default_project_plan(p6_time, "王小虎")
    cursor.execute("""
    INSERT INTO products (code, name, category, spec_thickness, target_roughness, target_peel, target_df, target_tensile, target_elongation, status, creator, npi_project_plan, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, ("HF-HIS-03", "极薄HIS载体铜箔(1.5μm)", "HIS 载体铜箔", 1.5, 0.80, 0.50, 0.0010, 290.0, 2.0, "钉钉立项审批中", "王小虎", p6_plan, p6_time, p6_time))
    p6_id = cursor.lastrowid


    # ================= 导入配方 BOM 模拟数据 =================
    
    # p1 (HF-PTS-12)：V1.0
    cursor.execute("""
    INSERT INTO product_bom (product_id, version, status, copper_wire_ratio, sulfuric_acid_ratio, additive_gel, additive_hec, additive_s, silane_type, silane_conc, bom_items, updater, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (p1_id, "V1.0", "活动", 99.85, 0.15, 5.2, 3.5, 8.0, "常规硅烷-201", 0.8, make_bom_items_json(99.85, 0.15, 5.2, 3.5, 8.0, "常规硅烷-201", 0.8), "李建国", p1_time))

    # p2 (HF-HIS-02)：V1.0
    cursor.execute("""
    INSERT INTO product_bom (product_id, version, status, copper_wire_ratio, sulfuric_acid_ratio, additive_gel, additive_hec, additive_s, silane_type, silane_conc, bom_items, updater, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (p2_id, "V1.0", "活动", 99.88, 0.12, 3.0, 4.0, 6.5, "环保硅烷SL-203", 0.6, make_bom_items_json(99.88, 0.12, 3.0, 4.0, 6.5, "环保硅烷SL-203", 0.6), "张小贤", p2_time))

    # p3 (HF-DBJ-18)：拥有 V1.0 (历史) 和 V1.1 (活动)
    cursor.execute("""
    INSERT INTO product_bom (product_id, version, status, copper_wire_ratio, sulfuric_acid_ratio, additive_gel, additive_hec, additive_s, silane_type, silane_conc, bom_items, updater, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (p3_id, "V1.0", "历史", 99.80, 0.20, 5.5, 3.8, 9.0, "常规硅烷-201", 1.0, make_bom_items_json(99.80, 0.20, 5.5, 3.8, 9.0, "常规硅烷-201", 1.0), "李建国", p3_time))
    
    cursor.execute("""
    INSERT INTO product_bom (product_id, version, status, copper_wire_ratio, sulfuric_acid_ratio, additive_gel, additive_hec, additive_s, silane_type, silane_conc, bom_items, updater, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (p3_id, "V1.1", "活动", 99.82, 0.18, 5.5, 3.8, 9.0, "环保硅烷SL-203", 0.8, make_bom_items_json(99.82, 0.18, 5.5, 3.8, 9.0, "环保硅烷SL-203", 0.8), "李建国", p3_time + timedelta(days=20)))

    # p4 (HF-PTS-35)：V1.0
    cursor.execute("""
    INSERT INTO product_bom (product_id, version, status, copper_wire_ratio, sulfuric_acid_ratio, additive_gel, additive_hec, additive_s, silane_type, silane_conc, bom_items, updater, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (p4_id, "V1.0", "活动", 99.85, 0.15, 6.0, 4.0, 10.0, "常规硅烷-201", 1.0, make_bom_items_json(99.85, 0.15, 6.0, 4.0, 10.0, "常规硅烷-201", 1.0), "王强", p4_time))

    # p5 (HF-PTS-18)：V1.0
    cursor.execute("""
    INSERT INTO product_bom (product_id, version, status, copper_wire_ratio, sulfuric_acid_ratio, additive_gel, additive_hec, additive_s, silane_type, silane_conc, bom_items, updater, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (p5_id, "V1.0", "活动", 99.85, 0.15, 5.4, 3.6, 8.2, "常规硅烷-201", 0.8, make_bom_items_json(99.85, 0.15, 5.4, 3.6, 8.2, "常规硅烷-201", 0.8), "赵立功", p5_time))

    # p6 (HF-HIS-03)：V1.0
    cursor.execute("""
    INSERT INTO product_bom (product_id, version, status, copper_wire_ratio, sulfuric_acid_ratio, additive_gel, additive_hec, additive_s, silane_type, silane_conc, bom_items, updater, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (p6_id, "V1.0", "活动", 99.88, 0.12, 3.0, 4.0, 6.5, "环保硅烷SL-203", 0.6, make_bom_items_json(99.88, 0.12, 3.0, 4.0, 6.5, "环保硅烷SL-203", 0.6), "王小虎", p6_time))


    # ================= 导入基准工艺路线 (Routing) 模拟数据 =================
    
    # p1, p3, p4, p5 (普通铜箔 4 个工段)
    std_routings_4 = [
        (1, "溶铜工段", "1#溶铜罐组", "EQ-溶铜-01", {"Cu_conc": 85.0, "H2SO4_conc": 110.0, "temp": 80.0, "flow_rate": 450.0, "Cl_conc": 35.0}),
        (2, "生箔工段", "2#生箔机阴极辊", "EQ-生箔-02", {"voltage": 6.8, "current_density": 65.0, "drum_speed": 5.0}),
        (3, "表面处理工段", "2#表面处理机", "EQ-表处-02", {"line_speed": 12.0, "treat_current": 1800, "silane_conc": 0.8, "dry_temp": 130.0, "passivation_ph": 4.5}),
        (4, "分切工段", "1#高精度分切机", "EQ-分切-01", {"tension": 220.0, "slit_speed": 150.0})
    ]
    
    for pid in [p1_id, p3_id, p4_id, p5_id]:
        for r in std_routings_4:
            cursor.execute("""
            INSERT INTO product_routing (product_id, routing_version, status, step_no, stage_name, device_name, device_code, standard_params)
            VALUES (?, 'R1.0', '活动', ?, ?, ?, ?, ?)
            """, (pid, r[0], r[1], r[2], r[3], json.dumps(r[4])))

    # p2, p6 (HIS载体铜箔 5 道工段，含溅镀打底)
    std_routings_5 = [
        (1, "溶铜工段", "2#溶铜罐组", "EQ-溶铜-02", {"Cu_conc": 80.0, "H2SO4_conc": 120.0, "temp": 75.0, "flow_rate": 420.0, "Cl_conc": 30.0}),
        (2, "溅镀工段", "磁控溅射镀膜机", "EQ-溅镀-01", {"vacuum": 0.0003, "power": 15.0, "speed": 8.0, "thickness": 50.0, "target_type": "高纯铜靶-镍铬阻挡层"}),
        (3, "生箔工段", "4#超薄生箔机", "EQ-生箔-04", {"voltage": 7.0, "current_density": 60.0, "drum_speed": 8.0}),
        (4, "表面处理工段", "3#表面处理机", "EQ-表处-03", {"line_speed": 8.0, "treat_current": 1200, "silane_conc": 0.6, "dry_temp": 120.0, "passivation_ph": 4.5}),
        (5, "分切工段", "2#高精度分切机", "EQ-分切-02", {"tension": 150.0, "slit_speed": 100.0})
    ]
    
    for pid in [p2_id, p6_id]:
        for r in std_routings_5:
            cursor.execute("""
            INSERT INTO product_routing (product_id, routing_version, status, step_no, stage_name, device_name, device_code, standard_params)
            VALUES (?, 'R1.0', '活动', ?, ?, ?, ?, ?)
            """, (pid, r[0], r[1], r[2], r[3], json.dumps(r[4])))


    # ================= 导入实际工艺开发中试日志 (development_logs) =================
    
    # p1 (HF-PTS-12) 生箔段电流设定为 72.0A/dm2 (基准为 65.0) -> 触发偏差警告
    cursor.execute("""
    INSERT INTO development_logs (product_id, stage, device_name, device_code, parameters, operator, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        p1_id, "溶铜工段", "1#溶铜罐组", "EQ-溶铜-01",
        json.dumps({"Cu_conc": 84.5, "H2SO4_conc": 112.0, "temp": 79.2, "flow_rate": 460.0, "Cl_conc": 32.5}),
        "赵工", "溶铜液配比基本稳定。", p1_time + timedelta(days=2)
    ))
    cursor.execute("""
    INSERT INTO development_logs (product_id, stage, device_name, device_code, parameters, operator, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        p1_id, "生箔工段", "2#生箔机阴极辊", "EQ-生箔-02",
        json.dumps({"voltage": 6.75, "current_density": 72.0, "drum_speed": 4.9}),
        "孙工", "尝试加大电流密度至 72 A/dm² 提高产出效率，注意观测毛面晶粒是否粗化。", p1_time + timedelta(days=5)
    ))

    # p2 (HF-HIS-02) 完美通关，已录入所有工段
    cursor.execute("""
    INSERT INTO development_logs (product_id, stage, device_name, device_code, parameters, operator, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (p2_id, "溶铜工段", "2#溶铜罐组", "EQ-溶铜-02", json.dumps({"Cu_conc": 80.2, "H2SO4_conc": 120.0, "temp": 75.0, "flow_rate": 420.0, "Cl_conc": 30.0}), "赵工", "溶铜稳定", p2_time + timedelta(days=2)))
    cursor.execute("""
    INSERT INTO development_logs (product_id, stage, device_name, device_code, parameters, operator, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (p2_id, "溅镀工段", "磁控溅射镀膜机", "EQ-溅镀-01", json.dumps({"vacuum": 0.0003, "power": 15.0, "speed": 8.0, "thickness": 50.0, "target_type": "高纯铜靶-镍铬阻挡层"}), "钱工", "溅镀正常", p2_time + timedelta(days=5)))
    cursor.execute("""
    INSERT INTO development_logs (product_id, stage, device_name, device_code, parameters, operator, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (p2_id, "生箔工段", "4#超薄生箔机", "EQ-生箔-04", json.dumps({"voltage": 7.0, "current_density": 60.0, "drum_speed": 8.0}), "孙工", "生箔中试合格", p2_time + timedelta(days=8)))
    cursor.execute("""
    INSERT INTO development_logs (product_id, stage, device_name, device_code, parameters, operator, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (p2_id, "表面处理工段", "3#表面处理机", "EQ-表处-03", json.dumps({"line_speed": 8.0, "treat_current": 1200.0, "silane_conc": 0.6, "dry_temp": 120.0, "passivation_ph": 4.5}), "李工", "防氧化合格", p2_time + timedelta(days=12)))
    cursor.execute("""
    INSERT INTO development_logs (product_id, stage, device_name, device_code, parameters, operator, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (p2_id, "分切工段", "2#高精度分切机", "EQ-分切-02", json.dumps({"tension": 150.0, "slit_speed": 100.0, "aoi_defects": 0}), "吴工", "分切完成", p2_time + timedelta(days=15)))

    # p3 (HF-DBJ-18) 已进入量产
    cursor.execute("""
    INSERT INTO development_logs (product_id, stage, device_name, device_code, parameters, operator, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (p3_id, "溶铜工段", "1#溶铜罐组", "EQ-溶铜-01", json.dumps({"Cu_conc": 85.0, "H2SO4_conc": 110.0, "temp": 80.0, "flow_rate": 450.0, "Cl_conc": 35.0}), "赵工", "制液稳定", p3_time + timedelta(days=2)))
    cursor.execute("""
    INSERT INTO development_logs (product_id, stage, device_name, device_code, parameters, operator, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (p3_id, "生箔工段", "1#生箔机阴极辊", "EQ-生箔-01", json.dumps({"voltage": 6.8, "current_density": 68.0, "drum_speed": 3.8}), "孙工", "生箔中试", p3_time + timedelta(days=5)))
    cursor.execute("""
    INSERT INTO development_logs (product_id, stage, device_name, device_code, parameters, operator, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (p3_id, "表面处理工段", "1#表面处理机", "EQ-表处-01", json.dumps({"line_speed": 15.0, "treat_current": 2200.0, "silane_conc": 0.8, "dry_temp": 140.0, "passivation_ph": 4.5}), "李工", "防氧化合格", p3_time + timedelta(days=8)))
    cursor.execute("""
    INSERT INTO development_logs (product_id, stage, device_name, device_code, parameters, operator, remarks, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (p3_id, "分切工段", "1#高精度分切机", "EQ-分切-01", json.dumps({"tension": 240.0, "slit_speed": 180.0, "aoi_defects": 0}), "吴工", "分切就绪", p3_time + timedelta(days=10)))

    # p5 (HF-PTS-18) 进到了测试段，且中试日志全部填写
    for step in std_routings_4:
        # 按推荐参数录入日志
        cursor.execute("""
        INSERT INTO development_logs (product_id, stage, device_name, device_code, parameters, operator, remarks, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (p5_id, step[1], step[2], step[3], json.dumps(step[4]), "赵立功", "工序调试顺利完成", p5_time + timedelta(days=step[0]*3)))


    # ================= 导入测试记录 (test_records) =================
    
    # p2 (HF-HIS-02)：检测通过 (合格)
    cursor.execute("""
    INSERT INTO test_records (product_id, batch_no, actual_thickness, roughness_rz_m, roughness_rz_s, peel_strength, df_10ghz, tensile_strength, elongation, test_result, tester, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (p2_id, "TEST-HIS02-B02", 2.02, 0.76, 0.38, 0.52, 0.00095, 295.0, 2.1, "合格", "张测试", p2_time + timedelta(days=22)))

    # p3 (HF-DBJ-18)：测试合格
    cursor.execute("""
    INSERT INTO test_records (product_id, batch_no, actual_thickness, roughness_rz_m, roughness_rz_s, peel_strength, df_10ghz, tensile_strength, elongation, test_result, tester, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (p3_id, "TEST-DBJ18-B01", 18.1, 1.42, 0.65, 0.88, 0.00142, 345.0, 3.4, "合格", "张测试", p3_time + timedelta(days=12)))

    # p5 (HF-PTS-18)：高频损耗超标测试记录 (不合格)
    cursor.execute("""
    INSERT INTO test_records (product_id, batch_no, actual_thickness, roughness_rz_m, roughness_rz_s, peel_strength, df_10ghz, tensile_strength, elongation, test_result, tester, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (p5_id, "TEST-PTS18-B01", 18.05, 1.15, 0.52, 0.82, 0.00195, 315.0, 2.7, "不合格", "张测试", p5_time + timedelta(days=20)))


    # ================= 导入 ECN 设变数据 (ecn_records) =================
    
    # ECN-001 (DBJ-18)
    ecn1_time = now - timedelta(days=10)
    cursor.execute("""
    INSERT INTO ecn_records (ecn_no, product_id, change_type, change_reason, change_before, change_after, risk_assessment, status, dingtalk_instance_id, creator, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "ECN-20260626-001", p3_id, "原料变更", 
        "原硅烷偶联剂含有非环保挥发物且高频Df略有浮动，需要变更为新型无挥发环保型硅烷处理剂(型号SL-203)。",
        "使用A品牌常规硅烷，表面处理配方中浓度1.0%。",
        "使用SL-203新型环保硅烷，配方浓度微调为0.8%，干燥烘烤温度调高5℃。",
        json.dumps({"peel_effect": "提高 5-8%", "df_effect": "降低 0.00005 (改善)"}),
        "已批准", "MOCK-INSTANCE-ECN-001", "李建国", ecn1_time, ecn1_time + timedelta(days=1)
    ))

    # ECN-002 (PTS-12)
    ecn2_time = now - timedelta(days=1)
    cursor.execute("""
    INSERT INTO ecn_records (ecn_no, product_id, change_type, change_reason, change_before, change_after, risk_assessment, status, dingtalk_instance_id, creator, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "ECN-20260705-001", p1_id, "配方微调", 
        "为改善高频PTS-12的剥离结合强度，同时防止低粗糙度表面发生铜粉剥落，生箔添加剂明胶浓度由5.2ppm降为4.2ppm，SPS活性硫提高至9.0ppm。",
        "BOM配方：明胶添加量 5.2ppm, 活性硫 8.0ppm",
        "BOM配方：明胶添加量 4.2ppm, 活性硫 9.0ppm",
        json.dumps({"peel_effect": "预测剥离力增加 0.05 N/mm", "df_effect": "可能微幅上升 0.00002"}),
        "钉钉审批中", "MOCK-INSTANCE-ECN-002", "李建国", ecn2_time, ecn2_time
    ))


    # ================= 导入钉钉审批模拟日志 (dingtalk_logs) =================
    
    # ECN-001
    cursor.execute("""
    INSERT INTO dingtalk_logs (instance_id, related_type, related_id, title, content, status, approver, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "MOCK-INSTANCE-ECN-001", "ECN", 1, "工程变更 ECN 审批：高性能背板双晶铜箔(18μm) 硅烷物料切换",
        json.dumps({"ecn_no": "ECN-20260626-001", "product": "HF-DBJ-18", "type": "原料变更", "reason": "防氧化层偶联剂更换"}),
        "COMPLETED", "研发副总王世杰", "经评估，SL-203有利于损耗改善，同意切换。", ecn1_time + timedelta(hours=4)
    ))

    # PRODUCT-001 (PTS-12 立项通过)
    cursor.execute("""
    INSERT INTO dingtalk_logs (instance_id, related_type, related_id, title, content, status, approver, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "MOCK-INSTANCE-PROJ-001", "PRODUCT", p1_id, "新品开发立项审批：高频高速PTS AI铜箔(12μm)",
        json.dumps({"code": "HF-PTS-12", "name": "高频高速PTS AI铜箔(12μm)", "category": "PTS AI 铜箔"}),
        "COMPLETED", "总经理林聚赫", "同意立项，请抓紧进行配方研制。", p1_time + timedelta(hours=6)
    ))

    # ECN-002 (待审批)
    cursor.execute("""
    INSERT INTO dingtalk_logs (instance_id, related_type, related_id, title, content, status, approver, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "MOCK-INSTANCE-ECN-002", "ECN", 2, "工程变更 ECN 审批：高频高速PTS AI铜箔(12μm) 添加剂比例调整",
        json.dumps({"ecn_no": "ECN-20260705-001", "product": "HF-PTS-12", "type": "配方微调"}),
        "RUNNING", None, None, ecn2_time
    ))

    # PRODUCT-003 (p6 HF-HIS-03 待审批立项流程)
    cursor.execute("""
    INSERT INTO dingtalk_logs (instance_id, related_type, related_id, title, content, status, approver, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "MOCK-INSTANCE-PROJ-003", "PRODUCT", p6_id, "新品开发立项审批：极薄HIS载体铜箔(1.5μm)",
        json.dumps({"code": "HF-HIS-03", "name": "极薄HIS载体铜箔(1.5μm)", "category": "HIS 载体铜箔", "spec_thickness": 1.5, "target_roughness": 0.80, "target_peel": 0.50, "target_df": 0.0010}),
        "RUNNING", None, None, p6_time
    ))

    # 为所有产品插入 TDS 初始版本 T1.0
    default_tds_items_pts = json.dumps([
        {"item_no": 1, "name_zh": "铜箔厚度(Avg.)", "name_en": "Thickness", "unit": "um", "spec": "12±2", "test_standard": "Micro Meter", "group": ""},
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
    ])

    default_tds_items_his = json.dumps([
        {"item_no": 1, "name_zh": "载体铜箔厚度", "name_en": "Carrier Thickness", "unit": "um", "spec": "18±1", "test_standard": "Micro Meter", "group": ""},
        {"item_no": 2, "name_zh": "超薄铜层厚度", "name_en": "Ultra-thin Layer", "unit": "um", "spec": "3±0.3", "test_standard": "XRF", "group": ""},
        {"item_no": 3, "name_zh": "宽幅", "name_en": "Width", "unit": "mm", "spec": "+3,-0", "test_standard": "直辊尺", "group": ""},
        {"item_no": 4, "name_zh": "粗糙度 Rz (超薄层)", "name_en": "Roughness Rz (ultra-thin)", "unit": "um", "spec": "<0.3", "test_standard": "Keyence VK3000", "group": ""},
        {"item_no": 5, "name_zh": "剥离强度", "name_en": "Peel Strength", "unit": "N/mm", "spec": "≥0.50", "test_standard": "IPC-TM-650 2.4.8", "group": ""},
        {"item_no": 6, "name_zh": "铜纯度", "name_en": "Copper Purity", "unit": "%", "spec": "≥99.5", "test_standard": "IPC-TM-650 2.3.15", "group": ""},
        {"item_no": 7, "name_zh": "Df 介质损耗 @10GHz", "name_en": "Dielectric Loss Df", "unit": "-", "spec": "≤0.0010", "test_standard": "IPC-TM-650 2.5.5", "group": ""}
    ])

    cursor.execute("SELECT id, category FROM products ORDER BY id")
    all_products = cursor.fetchall()
    for prod in all_products:
        pid = prod['id'] if isinstance(prod, dict) else prod[0]
        cat = prod['category'] if isinstance(prod, dict) else prod[1]
        tds_items = default_tds_items_his if 'HIS' in cat else default_tds_items_pts
        cursor.execute("""
        INSERT INTO product_tds (product_id, tds_version, status, tds_items, notes, updater, created_at)
        VALUES (?, 'T1.0', '活动', ?, '初始版本', '工艺工程师', ?)
        """, (pid, tds_items, now.isoformat()))

    conn.commit()
    conn.close()
    print("Database initial simulated data imported successfully.")

if __name__ == "__main__":
    init_database()
