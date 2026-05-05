#!/usr/bin/env python3
"""
Generate the Karvo app icon.
Design: Dark-navy background (T.bg.page) with 5 muted zone-color bars
stacked and staggered upward from bottom-left to top-right. Palette
matches src/utils/theme.ts so the icon reads as part of the same app.
"""

from PIL import Image, ImageDraw
import json
import os

# Muted zone palette from src/utils/theme.ts
ZONE_COLORS = [
    (107, 157, 217),  # Zone 1 - slate blue   #6B9DD9 (bottom)
    (107, 194, 142),  # Zone 2 - sage green   #6BC28E
    (217, 180, 94),   # Zone 3 - warm gold    #D9B45E
    (217, 139, 94),   # Zone 4 - terracotta   #D98B5E
    (217, 110, 122),  # Zone 5 - dusty rose   #D96E7A (top)
]

BG_COLOR = (10, 13, 18)  # T.bg.page #0A0D12


def generate_icon(size=1024):
    img = Image.new('RGB', (size, size), BG_COLOR)
    draw = ImageDraw.Draw(img)

    num_bars = len(ZONE_COLORS)
    bar_height = size * 0.11
    gap = size * 0.03
    total_height = num_bars * bar_height + (num_bars - 1) * gap
    corner_radius = int(bar_height * 0.25)

    # Center the bar group vertically
    start_y = (size - total_height) / 2

    # Horizontal layout: all bars same length, left edge staggers right going down
    bar_width = size * 0.55  # Same width for all bars
    min_left = size * 0.10   # Leftmost start (top bar)
    max_left = size * 0.35   # Rightmost start (bottom bar)

    # Zone 1 (blue) at bottom, Zone 5 (red) at top
    for i, color in enumerate(reversed(ZONE_COLORS)):
        y = start_y + i * (bar_height + gap)
        # Each bar starts further left as we go down (blue bottom-left, red top-right)
        progress = i / (num_bars - 1)
        left_edge = max_left - progress * (max_left - min_left)

        # Draw rounded rectangle
        draw.rounded_rectangle(
            [int(left_edge), int(y), int(left_edge + bar_width), int(y + bar_height)],
            radius=corner_radius,
            fill=color,
        )

    return img


def main():
    output_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                              'ios', 'Zones', 'Images.xcassets', 'AppIcon.appiconset')
    os.makedirs(output_dir, exist_ok=True)

    icon = generate_icon(1024)

    icon_path = os.path.join(output_dir, 'icon_1024.png')
    icon.save(icon_path, 'PNG')
    print(f"Saved: {icon_path}")

    preview_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'app_icon_preview.png')
    icon.save(preview_path, 'PNG')
    print(f"Preview: {preview_path}")

    contents = {
        "images": [
            {"filename": "icon_1024.png", "idiom": "universal",
             "platform": "ios", "size": "1024x1024"}
        ],
        "info": {"author": "xcode", "version": 1}
    }
    with open(os.path.join(output_dir, 'Contents.json'), 'w') as f:
        json.dump(contents, f, indent=2)
    print("Saved Contents.json")


if __name__ == '__main__':
    main()
