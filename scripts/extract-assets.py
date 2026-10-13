import re, base64, sys, pathlib
src = pathlib.Path(sys.argv[1]).read_text()
out = pathlib.Path(sys.argv[2])
css = []
for fam, w, b64 in re.findall(r"@font-face\{font-family:(\w+);font-weight:(\d+);src:url\(data:font/woff2;base64,([A-Za-z0-9+/=]+)\)", src):
    name = f"{fam.lower()}-{w}.woff2"
    (out / "public/fonts" / name).write_bytes(base64.b64decode(b64))
    css.append(f"@font-face{{font-family:{fam};font-weight:{w};font-display:block;src:url(/fonts/{name}) format('woff2')}}")
(out / "src/fonts.css").write_text("\n".join(css) + "\n")
lines = src.split("\n")
m = re.search(r'<div class="sp-brand">(<svg.*?</svg>)</div>', lines[444])
(out / "src/assets").mkdir(exist_ok=True)
(out / "src/assets/brand-splash.svg").write_text(m.group(1))
m2 = re.search(r'<div class="sp-sys">(<svg.*?</svg>)</div>', src)
(out / "src/assets/sys-splash.svg").write_text(m2.group(1))
m3 = re.search(r'(<svg width="0" height="0".*?</svg>)\n\n<aside', src, re.S)
(out / "src/assets/icons.svg").write_text(m3.group(1))
start = src.index("/* Layout: guide"); end = src.index("</style>", start)
(out / "src/styles.css").write_text(src[start:end])
print(css)
