# Snapset

Snapset is a tool to take screenshots with predefined presets, including borders, redactions (mosaic/blackout), and resizing.

## Installation

1. Ensure you have Python installed.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

Run the script with  and the following options:

### Arguments

- `-o, --output <path>`: (Required) Output file path.
- `-r, --region <x> <y> <w> <h>`: Region to capture.
- `-b, --border <size>`: Border size in pixels.
- `-c, --border-color <color>`: Border color (e.g., , , , or ).
- `-s, --target-size <w> <h>`: Resize the final image to this size.
- `-red, --redact <type>:<x>:<y>:<w>:<h>`: Add a redaction area. 
    - Types:  or .
    - Multiple redactions can be added by using the `-red` flag multiple times.

### Examples

#### 1. Basic screenshot with a 10px black border
```bash
python ss_preset.py -o screenshot.png -b 10
```

#### 2. Screenshot of a specific region with a red border and mosaic redaction
``\bash
python ss_preset.py -o redacted.png -r 100 100 500 500 -b 5 -c red -red mosaic:150:150:100:100
```

#### 3. Screenshot with multiple redactions (mosaic and blackout) and resizing to 800x600
```bash
python ss_preset.py -o final.png -b 10 -s 800 600 -red blackout:50:50:100:100 -red mosaic:300:300:200:200
```
