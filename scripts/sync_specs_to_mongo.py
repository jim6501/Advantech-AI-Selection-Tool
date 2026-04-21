import os
import json
import re
from pymongo import MongoClient, UpdateOne
from dotenv import load_dotenv

load_dotenv("configs/.env")

MONGO_URI = os.getenv("MONGO_URI", "")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "advantech_ind_sw_tool")

def get_db():
    if not MONGO_URI:
        print("⚠️ 尚未設定 MONGO_URI，請在 configs/.env 中加入連線字串。")
        return None
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        # Test connection
        client.admin.command('ping')
        return client[MONGO_DB_NAME]
    except Exception as e:
        print(f"❌ MongoDB 連線失敗: {e}")
        return None

def infer_series_from_pn(pn):
    """
    從 Product PN 推導對應的 Software Series
    例如：EKI-7428G-4CA-AE -> EKI-7400
    """
    if not pn:
        return ""
        
    prefix_match = re.search(r'(EKI-\d{4})', pn)
    if prefix_match:
        inferred = prefix_match.group(1)
        # 若不是以 00 結尾，則無條件捨去成百位數
        if not inferred.endswith("00"):
            try:
                num = int(inferred[4:])
                return f"EKI-{(num // 100) * 100}"
            except:
                pass
        return inferred
    return ""

def main():
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    
    # 載入原始資料
    hw_path = "data/hardware_specs_raw.json"
    sw_path = "data/software_specs_raw.json"
    
    if not os.path.exists(hw_path) or not os.path.exists(sw_path):
        print("❌ 找不到 hardware_specs_raw.json 或 software_specs_raw.json 資料。請先執行擷取腳本。")
        return
        
    with open(hw_path, "r", encoding="utf-8") as f:
        hw_raw = json.load(f)
    
    with open(sw_path, "r", encoding="utf-8") as f:
        sw_raw = json.load(f)
        
    db = get_db()
    if db is None:
        return
        
    print(f"🔌 成功連線至 MongoDB Database: {MONGO_DB_NAME}")
    
    # 1. 寫入 software_specs
    # 建立索引
    db.software_specs.create_index([("software_series", 1), ("firmware_ver", 1)], unique=True)
    
    print(f"🔄 正在同步 {len(sw_raw)} 筆軟體資料...")
    sw_updates = []
    for sw in sw_raw:
        sw_updates.append(UpdateOne(
            {"_id": sw["_id"]},
            {"$set": sw},
            upsert=True
        ))
    if sw_updates:
        db.software_specs.bulk_write(sw_updates)
        
    # 2. 寫入 hardware_specs
    # 將兩種類別（Ind. SW, Train SW）合併放進同一個 collection，透過 Application / Function 區分即可
    hw_list = hw_raw.get("industrial_sw", []) + hw_raw.get("train_sw", [])
    
    print(f"🔄 正在同步 {len(hw_list)} 筆硬體資料...")
    hw_updates = []
    product_inserts = []
    validation_report = {"success_merges": [], "failed_merges": []}
    
    for hw in hw_list:
        pn = hw.get("Product PN", "").strip()
        if not pn:
            continue
            
        hw["_id"] = pn
        hw_updates.append(UpdateOne(
            {"_id": pn},
            {"$set": hw},
            upsert=True
        ))
        
        # 3. 雙軌 Mapping (JOIN) Phase
        hw_sw_series = hw.get("Software Series", "").strip()
        # 注意：硬體表上有打字錯誤 Fiemware Version，請以這個為主抓取
        hw_fw_ver = hw.get("Fiemware Version", "").strip()
        
        # --- 測試階段自動抓最新版回退邏輯 ---
        is_inferred = False
        if not hw_sw_series or not hw_fw_ver:
            # 推導系列
            hw_sw_series = infer_series_from_pn(pn)
            
            # 檢查推導出來的系列是否存在於軟體清單中，如果沒有，依照要求預設 fallback 到 EKI-5500
            available_series = [s["software_series"] for s in sw_raw]
            if hw_sw_series not in available_series:
                hw_sw_series = "EKI-5500"
                
            if hw_sw_series:
                # 尋找這個系列所有的軟體規格
                matching_sws = [s for s in sw_raw if s["software_series"] == hw_sw_series]
                if matching_sws:
                    # 排序找到最新版做為測試配對用
                    matching_sws.sort(key=lambda x: str(x.get("firmware_ver", "")), reverse=True)
                    hw_fw_ver = matching_sws[0]["firmware_ver"]
                    is_inferred = True

        # 根據鎖定的 hw_sw_series 和 hw_fw_ver 去找規格
        matched_sw = next((s for s in sw_raw if s["software_series"] == hw_sw_series and s["firmware_ver"] == hw_fw_ver), None)
        
        if matched_sw:
            # 建立統合物件
            product_doc = {
                "_id": pn,
                "product_pn": pn,
                "model_name": hw.get("Model Name", ""),
                "software_mapped_series": hw_sw_series,
                "software_mapped_fw": hw_fw_ver,
                "is_inferred": is_inferred,
                "hardware": hw,
                "software": matched_sw.get("software", {})
            }
            product_inserts.append(UpdateOne(
                {"_id": pn},
                {"$set": product_doc},
                upsert=True
            ))
            validation_report["success_merges"].append(pn)
        else:
            validation_report["failed_merges"].append({
                "pn": pn,
                "tried_series": hw_sw_series,
                "tried_fw": hw_fw_ver,
                "reason": "SW specifications not found"
            })
            
    if hw_updates:
        db.hardware_specs.bulk_write(hw_updates)
        
    if product_inserts:
        print(f"🔄 正在寫入 {len(product_inserts)} 筆合併後的終極選型 Product Specs...")
        # 建立常用檢索索引
        db.product_specs.create_index([("product_pn", 1)])
        db.product_specs.create_index([("model_name", 1)])
        db.product_specs.bulk_write(product_inserts)
        
    # 產出 Validation Report
    report_path = "data/validation_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(validation_report, f, ensure_ascii=False, indent=2)
        
    print(f"✅ Mapping 與同步作業完成！")
    print(f"   - 成功配對: {len(validation_report['success_merges'])} 台設備")
    print(f"   - 配對失敗: {len(validation_report['failed_merges'])} 台設備")
    print(f"📁 驗證報告已輸出至: {report_path}")

if __name__ == "__main__":
    main()
