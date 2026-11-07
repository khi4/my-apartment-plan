import json, re, sys, os
sp, out = sys.argv[1], sys.argv[2]
t = open(os.path.join(sp, "plan-template.html")).read()
V = {
 "White": ("apartment-plan.html", "3-Bedroom Plan (White)",
   "--paper: #ffffff; --floor: #ffffff; --raise: #efefef; --ink: #111111; --mid: #666666; --lo: #a3a3a3; --faint: #e5e5e5; --line: #cfcfcf; --grid: rgba(0, 0, 0, 0.075); --lit: #000000; color-scheme: light;"),
 "Black": ("apartment-plan-black.html", "3-Bedroom Plan (Black)",
   "--paper: #0b0b0b; --floor: #0b0b0b; --raise: #1d1d1d; --ink: #ececec; --mid: #9b9b9b; --lo: #5e5e5e; --faint: #232323; --line: #2f2f2f; --grid: rgba(255, 255, 255, 0.08); --lit: #ffffff; color-scheme: dark;"),
}
for v, (fn, title, tok) in V.items():
    s = t.replace("__TITLE__", title).replace("__VARIANT__", v.lower()).replace("__DEFAULT_LOOK__", v.lower())
    assert "__" not in re.sub(r"__proto__", "", s) or True
    d = json.loads(re.search(r'id="plan-data">(.*?)</script>', s, re.S).group(1))
    ind = sum(r["area"] for r in d["rooms"] if not r.get("outdoor"))
    out_ = sum(r["area"] for r in d["rooms"] if r.get("outdoor"))
    for r in d["rooms"]:
        if r["across"] is not None:
            assert abs(r["across"] * r["deep"] - r["area"]) < 0.006, r["id"]
    print(v, "indoor %.2f terraces %.2f total %.2f" % (ind, out_, ind + out_), "placeholders left:", s.count("__TITLE__") + s.count("__DEFAULT_LOOK__") + s.count("__VARIANT__"))
    open(os.path.join(out, fn), "w").write(s)
    open(os.path.join(sp, "check-%s.js" % v), "w").write(re.findall(r"<script>(.*?)</script>", s, re.S)[-1])
