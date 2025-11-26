"""
Generate CRM seed data from the 'Sorted' sheet in Customer Strategy.xlsx.

Usage:
  python build_customer_seed.py /path/to/Customer\ Strategy.xlsx

The script writes crm/web/data/customer-strategy-seed.json relative to the repo root.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import List

import pandas as pd


def load_sorted_rows(xlsx_path: Path) -> pd.DataFrame:
    df = pd.read_excel(xlsx_path, sheet_name="Sorted")
    mask = df["Unnamed: 1"].notna() & (df["Unnamed: 1"].astype(str).str.lower() != "parent")
    return df[mask]


def to_float(val) -> float:
    if pd.isna(val):
        return 0.0
    try:
        return float(val)
    except Exception:
        return 0.0


def extract_city(row: pd.Series) -> str:
    region_cols = ["Unnamed: 14", "Unnamed: 15", "Unnamed: 16", "Unnamed: 17", "Unnamed: 18"]
    cities: List[str] = []
    for col in region_cols:
        value = row.get(col)
        if pd.isna(value):
            continue
        parts = [part.strip() for part in str(value).split(",") if part.strip()]
        cities.extend(parts)
    return cities[0] if cities else ""


def build_seed_records(df: pd.DataFrame) -> List[dict]:
    records = []
    for _, row in df.iterrows():
        name = str(row["Unnamed: 1"]).strip()
        if not name:
            continue
        fy_val = to_float(row.get("FY"))
        projected = round(fy_val * 1.1, 2) if fy_val else 0.0
        notes_parts = []
        priority = row.get("Hunting")
        automation = row.get("(x)")
        emp = row.get("(x).1")
        hunting_owner = row.get("Unnamed: 8")
        if not pd.isna(priority):
            notes_parts.append(f"Priority: {priority}")
        if not pd.isna(automation):
            notes_parts.append(f"Automation: {automation}")
        if not pd.isna(emp):
            notes_parts.append(f"EMP: {emp}")
        if not pd.isna(hunting_owner):
            notes_parts.append(f"Hunting owner: {hunting_owner}")
        notes = " | ".join([str(part).strip() for part in notes_parts if str(part).strip()])

        record = {
            "name": name,
            "industry": "" if pd.isna(row.get("Unnamed: 5")) else str(row["Unnamed: 5"]).strip(),
            "annualPotential": round(fy_val, 2),
            "projectedValue": round(projected, 2),
            "nextStep": "" if pd.isna(row.get("(Notes on Next Steps)")) else str(row["(Notes on Next Steps)"]).strip(),
            "notes": notes,
            "city": extract_city(row),
            "state": "KS" if extract_city(row) else "",
            "accountOwner": "" if pd.isna(row.get("Unnamed: 7")) else str(row["Unnamed: 7"]).strip(),
            "huntingOwner": "" if pd.isna(hunting_owner) else str(hunting_owner).strip(),
            "priority": "" if pd.isna(priority) else str(priority).strip(),
        }
        records.append(record)
    return records


def main():
    repo_root = Path(__file__).resolve().parents[1]
    output_path = repo_root / "crm" / "web" / "data" / "customer-strategy-seed.json"
    xlsx_path = Path(sys.argv[1]) if len(sys.argv) > 1 else repo_root.parent / "Customer Strategy.xlsx"

    if not xlsx_path.exists():
        raise SystemExit(f"Could not find Excel file at {xlsx_path}")

    df = load_sorted_rows(xlsx_path)
    records = build_seed_records(df)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(records, indent=2), encoding="utf-8")
    print(f"Wrote {len(records)} records to {output_path}")


if __name__ == "__main__":
    main()

