from app.database import Database
import json

def check_data():
    db = Database.get_db()
    cursor = db.product_specs.find()
    
    print("Checking all products for Private VLAN field...")
    found_count = 0
    total_count = 0
    series_with_it = set()
    
    for doc in cursor:
        total_count += 1
        software = doc.get("software", {})
        for cat, feats in software.items():
            if not isinstance(feats, dict): continue
            for f_key, f_val in feats.items():
                if "PRIVATE VLAN" in f_key.upper() and f_val.lower() in ["full", "optional", "in_development"]:
                    series = doc.get("software_mapped_series", "N/A")
                    model = doc.get("model_name", "N/A")
                    print(f"Match: {series} | {model} | Value: {f_val}")
                    series_with_it.add(series)
                    found_count += 1
        
    print(f"\nTotal products: {total_count}")
    print(f"Products with Private VLAN: {found_count}")
    print(f"Series with Private VLAN: {series_with_it}")

if __name__ == "__main__":
    check_data()
