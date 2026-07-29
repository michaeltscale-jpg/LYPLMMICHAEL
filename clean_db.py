import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "plm.db")

BUSINESS_TABLES = [
    "products",
    "product_bom",
    "product_routing",
    "development_logs",
    "test_records",
    "ecn_records",
    "dingtalk_logs",
    "product_tds",
    "equipments",
    "mqc_materials",
    "mqc_suppliers",
    "ems_suppliers",
    "tasks",
    "task_logs",
    "pdca_records"
]

def clean_database():
    if not os.path.exists(DB_PATH):
        print("【错误】数据库文件不存在！")
        return False
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    print("正在清理所有业务模拟数据...")
    for table in BUSINESS_TABLES:
        try:
            cursor.execute(f"DELETE FROM {table}")
            print(f"  - 已清空数据表: {table}")
        except Exception as e:
            print(f"  - 清空数据表 {table} 时出现提示: {e}")
            
    # 重置自增 ID 计数器（保留 users 和 dingtalk_settings 的 ID 不变，或仅清理业务表的序列）
    try:
        for table in BUSINESS_TABLES:
            cursor.execute("DELETE FROM sqlite_sequence WHERE name = ?", (table,))
        print("  - 已重置业务表自增主键计数器 (ID 将从 1 开始)")
    except Exception as e:
        print(f"  - 重置序列提示: {e}")

    conn.commit()
    conn.close()
    print("✅ 所有模拟数据已成功清理，系统已准备就绪，可录入真实数据。")
    return True

if __name__ == "__main__":
    clean_database()
