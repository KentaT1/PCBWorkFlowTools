# PCB WorkFlow Tools

Altium Designer utilities — starting with **PDF → Pin Table** for Symbol Wizard.

**Live app:** [kentat1.github.io/PCBWorkFlowTools](https://kentat1.github.io/PCBWorkFlowTools/)  
**Repository:** [github.com/KentaT1/PCBWorkFlowTools](https://github.com/KentaT1/PCBWorkFlowTools)

Convert datasheet **pin definition** PDFs into columns for Altium Designer’s **Symbol Wizard**. Default (bold) functions are listed first; alternates use `/` instead of commas. Pin lists like `46-65` expand to one row per pin.

## Live app (GitHub Pages)

The web app runs **entirely in your browser** — your PDF is never uploaded to a server.

### Enable GitHub Pages (first time)

1. Push this repo to [PCBWorkFlowTools](https://github.com/KentaT1/PCBWorkFlowTools).
2. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**
3. After the workflow runs, open [kentat1.github.io/PCBWorkFlowTools](https://kentat1.github.io/PCBWorkFlowTools/)

### Preview locally

```powershell
cd docs
npx --yes serve .
# open http://localhost:3000
```

Or open `docs/index.html` via a local server (required for ES modules).

---

## Web app usage

1. Upload a pin-definition PDF (Espressif-style tables work best).
2. Click **Convert**.
3. Use **Copy column** for Designator, Display Name, and Electrical Type.
4. Paste each column into the matching Symbol Wizard grid column.

---

## Optional: Python CLI / GUI

Local tools remain in the repo if you prefer desktop use:

```powershell
pip install -r requirements.txt
python pdf_to_altium_pins.py "path\to\datasheet.pdf"
python run_gui.py
```

---

## Features

- Expands pin lists (`1, 2, 42, 43, 46-65` → one row per pin)
- Detects default pin functions from PDF font weight (e.g. `GPIO1` before `RTC_GPIO1`)
- Formats alternates: `GPIO1/RTC_GPIO1/TOUCH1/ADC1_CH0`
- Maps types: `P` → Power, `I/O/T` → HiZ, `I` → Input

## Example (ESP32-S3-MINI-1)

| Designator | Display Name | Electrical Type |
|------------|--------------|-----------------|
| 1 | GND | Power |
| 5 | GPIO1/RTC_GPIO1/TOUCH1/ADC1_CH0 | HiZ |
| 46 | GND | Power |

## Project layout

| Path | Purpose |
|------|---------|
| `docs/` | Static site for GitHub Pages |
| `docs/js/parser.js` | PDF parsing (PDF.js) |
| `pdf_to_altium_pins.py` | Python CLI (PyMuPDF) |
| `gui/` | Optional desktop GUI |

## Notes

- Tuned for tables like Espressif **Name / No. / Type / Function** layouts.
- EN and similar prose pins use the pin **name** as display name.
- Other vendors may need column threshold tweaks in `docs/js/parser.js` and `pdf_to_altium_pins.py`.
