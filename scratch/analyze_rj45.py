from app.database import Database
import json

def analyze_rj45():
    db = Database.get_db()
    fields = ['RJ-45 10/100M', 'RJ-45 Gigabit', 'RJ-45 Combo', 'RJ-45 10GbE']
    
    all_docs = list(db.product_specs.find())
    total = len(all_docs)
    
    matched = []
    unmatched = []
    
    for doc in all_docs:
        hw = doc.get("hardware", {})
        has_rj45 = False
        for f in fields:
            val = str(hw.get(f, "")).strip()
            if val and val[0].isdigit() and val[0] != '0':
                has_rj45 = True
                break
        
        if has_rj45:
            matched.append(doc)
        else:
            unmatched.append(doc)
            
    print(f"Total products: {total}")
    print(f"Matched (has RJ45): {len(matched)}")
    print(f"Unmatched (no RJ45): {len(unmatched)}")
    
    print("\nSample Unmatched (first 10):")
    for doc in unmatched[:10]:
        hw = doc.get("hardware", {})
        vals = {f: hw.get(f) for f in fields}
        print(f"Model: {doc.get('model_name', 'N/A')} | Values: {vals}")

    # Check for values that might be valid but don't match ^[1-9]
    print("\nDistribution of values in RJ45 fields (unmatched docs):")
    val_counts = {}
    for doc in unmatched:
        hw = doc.get("hardware", {})
        for f in fields:
            val = hw.get(f)
            if val is not None:
                val_str = str(val)
                val_counts[val_str] = val_counts.get(val_str, 0) + 1
    
    print(json.dumps(val_counts, indent=2))

if __name__ == "__main__":
    analyze_rj45()
