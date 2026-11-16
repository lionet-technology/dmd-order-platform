"""Read the Owner-selected final (2) XLSX without altering it. No DB writes."""
import hashlib, json, pathlib, re, zipfile
import xml.etree.ElementTree as ET
from decimal import Decimal
ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/data/service-v1/net-cost-final-2.xlsx"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

def parse():
    raw = SOURCE.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == 'a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2', 'Wrong final workbook'
    z = zipfile.ZipFile(SOURCE)
    strings = ["".join(t.itertext()) for t in ET.fromstring(z.read("xl/sharedStrings.xml"))]
    names = [s.get("name") for s in ET.fromstring(z.read("xl/workbook.xml")).findall("m:sheets/m:sheet", NS)]
    assert names == ["ePacket", "Yun Express", "UPS"], names
    sheets = {}
    for i, name in enumerate(names, 1):
        cells = {}
        for c in ET.fromstring(z.read(f"xl/worksheets/sheet{i}.xml")).findall("m:sheetData/m:row/m:c", NS):
            v = c.find("m:v", NS)
            if v is None:
                continue
            assert c.find("m:f", NS) is None, f"Unreviewed formula {name}!{c.get('r')}"
            cells[c.get("r")] = strings[int(v.text)] if c.get("t") == "s" else format(Decimal(v.text), "f")
        sheets[name] = cells
    e, y, u = [sheets[n] for n in names]
    def mapping(cells, pairs, start, end):
        rows = []
        for r in range(start, end + 1):
            for country, market in pairs:
                if f"{country}{r}" in cells and f"{market}{r}" in cells:
                    rows.append({"country": cells[f"{country}{r}"], "market": cells[f"{market}{r}"], "cell": f"{country}{r}"})
        return rows
    rates = []
    def tiers(cells, sheet, weight_col, rate_cols, start, end, currency):
        for r in range(start, end + 1):
            for market, col in rate_cols.items():
                rates.append({"service": sheet, "market": market, "max_kg": cells[f"{weight_col}{r}"], "rate": cells[f"{col}{r}"], "currency": currency, "cell": f"{col}{r}"})
    tiers(e, "EPACKET_US", "A", {"STANDARD": "B", "ECO": "C"}, 6, 60, "USD")
    tiers(e, "EPACKET_EU", "E", {"UK": "F", "CA": "G", "AU": "H", "EU": "I"}, 6, 35, "VND")
    tiers(y, "YUN", "A", {"EU 1": "B", "EU 2": "C", "UK": "D", "CA": "E", "AU": "F"}, 5, 25, "VND")
    ups_rates = []
    # Locate blocks by explicit headers, including intentionally unavailable account/subservice cells.
    for r in range(1, 132):
        for offset in (0, 14, 28):
            def col(n):
                s = ""
                while n:
                    n, rem = divmod(n - 1, 26)
                    s = chr(65 + rem) + s
                return s
            if u.get(f"{col(offset+2)}{r}") != "Net Cost Service":
                continue
            service = u[f"{col(offset+3)}{r}"]
            account = u[f"{col(offset+3)}{r+1}"]
            rr = r + 5
            while f"{col(offset+1)}{rr}" in u:
                lo, hi = u[f"{col(offset+1)}{rr}"], u[f"{col(offset+2)}{rr}"]
                if not re.fullmatch(r"\d+(?:\.\d+)?", lo):
                    break
                for zone in range(1, 11):
                    cell = f"{col(offset+2+zone)}{rr}"
                    value = u[cell]
                    assert value == "o" or Decimal(value) > 0, (cell, value)
                    ups_rates.append({"sub_service": service.replace("UPS ", "").upper(), "account": account, "zone": str(zone), "min_kg": lo, "max_kg": hi, "unit": "FIXED" if Decimal(hi) <= 20 else "PER_KG", "rate": None if value == "o" else value, "cell": cell})
                rr += 1
    zones = []
    for r in range(179, 262):
        for code, name, zone in (("A", "B", "C"), ("D", "E", "F"), ("G", "H", "I")):
            if f"{code}{r}" in u:
                zones.append({"code": u[f"{code}{r}"], "country": u[f"{name}{r}"], "zone": str(int(Decimal(u[f"{zone}{r}"]))), "cell": f"{code}{r}"})
    surges = [{"account": u[f"J{r}"], "zone": str(int(Decimal(u[f"K{r}"]))), "rate": u[f"L{r}"], "discount": u.get(f"M{r}", "0"), "cell": f"L{r}"} for r in range(147, 174)]
    assert e["D72"] == "26000 VNĐ/ USD"
    assert [e[f"D{r}"] for r in (73, 74, 75)] == ["135000 vnđ/ order", "285000 vnđ/ order", "405000 vnđ/ order"]
    result = {
        "source": {"path": "docs/data/service-v1/net-cost-final-2.xlsx", "original_name": "Bảng Net Cost Dịch vụ(2).xlsx", "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw), "sheets": names},
        "rates": rates,
        "epacket_markets": mapping(e, [("L", "M"), ("N", "O")], 5, 40),
        "yun_markets": mapping(y, [("I", "J"), ("K", "L")], 6, 41),
        "ups_rates": ups_rates, "ups_zones": zones, "ups_weight_surcharges": surges,
        "fx_initial": "26000",
        "epacket_surcharges": {"over55_vnd": "135000", "over75_vnd": "285000", "noncont_vnd": "405000", "oversize_cumulative": False, "currency": "VND"},
        "markups": {"EPACKET_US": {"net_base": e["C65"], "base_retail": e["D65"]}, "EPACKET_EU": {"net_base": e["C67"], "base_retail": e["D67"]}, "YUN": {"net_base": y["D30"], "base_retail": y["E30"]}, "UPS": {"net_base": u["G138"], "base_retail": u["H138"]}},
        "ups_globals": {"fuel": u["B138"], "vat": u["B139"], "us_broker": u["B140"], "customs_per_kg_vnd": "10000"},
        "blank_tables": {"net_discount": "A147:F173", "shipment_surcharge": "P147:V173"},
        "raw_cells": sheets,
    }
    assert len(rates) == 335
    assert len(ups_rates) == 3360, len(ups_rates)
    return result

if __name__ == "__main__":
    result = parse()
    dest = ROOT / "docs/data/service-v1/net-cost-final-2.json"
    dest.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({**result["source"], "rates": len(result["rates"]), "ups_rates": len(result["ups_rates"]), "ups_zones": len(result["ups_zones"])}, ensure_ascii=False))
