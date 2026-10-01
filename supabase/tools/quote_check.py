#!/usr/bin/env python3
"""
A cheap first check on researched deals, with no web reads: does the sentence
the researcher quoted from the page actually contain the amount and currency
recorded? A deal whose quote states its figure keeps it and is marked
verified (the quote supports it); a deal whose quote does not loses the
amount, currency and basis and is loaded without them, unmarked. Nothing is
inferred or converted. The full page-by-page check remains the stronger test.

    python3 supabase/tools/quote_check.py <research dir>   # deals/ -> verified/
"""
import glob, json, os, re, sys

SYM = {"$": {"USD", "CAD", "AUD", "NZD", "SGD", "HKD"}, "us$": {"USD"}, "usd": {"USD"}, "€": {"EUR"}, "eur": {"EUR"}, "euro": {"EUR"}, "euros": {"EUR"},
       "£": {"GBP"}, "gbp": {"GBP"}, "c$": {"CAD"}, "a$": {"AUD"}, "chf": {"CHF"}, "sek": {"SEK"}, "nok": {"NOK"}, "dkk": {"DKK"}, "jpy": {"JPY"}, "¥": {"JPY", "CNY"},
       "cny": {"CNY"}, "rmb": {"CNY"}, "inr": {"INR"}, "₹": {"INR"}, "rs": {"INR"}, "pln": {"PLN"}, "zł": {"PLN"}, "sgd": {"SGD"}, "hk$": {"HKD"}, "aud": {"AUD"}, "cad": {"CAD"},
       "nzd": {"NZD"}, "brl": {"BRL"}, "r$": {"BRL"}, "krw": {"KRW"}, "₩": {"KRW"}, "aed": {"AED"}, "zar": {"ZAR"}}
MULT = {"trillion": 1e12, "tn": 1e12, "billion": 1e9, "bn": 1e9, "b": 1e9, "million": 1e6, "mm": 1e6, "mn": 1e6, "m": 1e6, "thousand": 1e3, "k": 1e3, "crore": 1e7, "lakh": 1e5}
NUM = re.compile(r"(us\$|hk\$|c\$|a\$|r\$|[$€£¥₹₩]|\b(?:usd|eur|euros?|gbp|chf|sek|nok|dkk|jpy|cny|rmb|inr|pln|sgd|aud|cad|nzd|brl|krw|aed|zar|rs)\b)?\s?(\d[\d,]*(?:\.\d+)?)\s*(trillion|billion|million|thousand|crore|lakh|tn|bn|mm|mn|[bmk])?\b(?:\s?(usd|eur|euros?|gbp|chf|sek|nok|dkk|jpy|cny|inr|pln|sgd|aud|cad|nzd|brl|krw|aed|zar))?", re.I)


def candidates(text):
    """(value, {currencies}) for every figure in the quote that carries a currency."""
    out = []
    for m in NUM.finditer(text or ""):
        pre, num, mult, post = m.group(1), m.group(2), m.group(3), m.group(4)
        cur = SYM.get((pre or "").lower()) or SYM.get((post or "").lower())
        if not cur:
            continue
        try:
            v = float(num.replace(",", ""))
        except ValueError:
            continue
        if mult:
            v *= MULT[mult.lower()]
        out.append((v, cur))
    return out


def supported(deal):
    amt, cur, q = deal.get("amount"), (deal.get("currency") or "").upper(), deal.get("evidence") or ""
    if not amt or not cur or not q:
        return False
    return any(abs(v - amt) <= max(1.0, 0.005 * amt) and cur in cs for v, cs in candidates(q))


def main():
    root = sys.argv[1]
    os.makedirs(os.path.join(root, "verified"), exist_ok=True)
    T = K = 0
    for f in sorted(glob.glob(os.path.join(root, "deals", "*.json"))):
        try:
            doc = json.load(open(f))
        except Exception:
            continue
        keep = []
        for d in doc.get("deals", []):
            if d.get("amount"):
                T += 1
                if supported(d):
                    d["verified"], d["verdict"] = True, "quote_supports_amount"
                    K += 1
                else:
                    for k in ("amount", "currency", "amount_basis"):
                        d[k] = None
                    d["verified"], d["verdict"] = None, "amount_not_in_quote"
            else:
                d["verified"], d["verdict"] = None, "no_amount"
            keep.append(d)
        doc["deals"] = keep
        json.dump(doc, open(os.path.join(root, "verified", os.path.basename(f)), "w"), ensure_ascii=False, indent=1)
    print(f"{K} of {T} amounts are stated in their quoted sentence; the rest were loaded without an amount")


if __name__ == "__main__":
    main()
