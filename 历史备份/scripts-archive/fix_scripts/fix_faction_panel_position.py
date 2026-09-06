#!/usr/bin/env python3
"""Move floating-faction-panel outside dm-main to fix canvas sizing"""
import sys

path = '/root/original-project/frontend/src/views/NewBattleView.vue'

with open(path, 'r') as f:
    content = f.read()

# Find the faction panel block start and end
fp_start_marker = '\n      <!-- ===== Phase 13: Faction Panel (Floating Draggable Collapsible) ===== -->'
fp_end_marker = '      </div><!-- end floating-card -->\n    </main>'

fp_start = content.find(fp_start_marker)
if fp_start < 0:
    print("ERROR: Faction panel start marker not found")
    sys.exit(1)

# Find the end of faction panel (right before </main>)
fp_end_search_start = fp_start + len(fp_start_marker)
fp_end_pos = content.find(fp_end_marker, fp_end_search_start)
if fp_end_pos < 0:
    print("ERROR: Faction panel end marker not found")
    sys.exit(1)

# Extract the faction panel block including its leading newlines
faction_block = content[fp_start:fp_end_pos + len(fp_end_marker)]

# The faction panel block ends with:
#       </div><!-- end floating-card -->
#     </main>
# We want to keep </main> in place and move only the faction panel

# Find where faction panel content ends (before </main>)
main_close = fp_end_pos + fp_end_marker.find('    </main>')
# faction content ends right before the newline+spaces before </main>
faction_content_end = main_close

# Get just the faction panel content (without the </main>)
faction_only = content[fp_start:main_close]

# Remove the faction panel from original position
content_before = content[:fp_start]
content_after = content[main_close:]  # starts with '\n    </main>'

content_new = content_before + content_after

# Now insert faction panel after </main>
main_close_marker = '    </main>'
insert_after = content_new.find(main_close_marker) + len(main_close_marker)

content_final = content_new[:insert_after] + '\n' + faction_only.strip() + '\n' + content_new[insert_after:]

with open(path, 'w') as f:
    f.write(content_final)

print("OK: Faction panel moved outside dm-main")

# Verify
with open(path, 'r') as f:
    verify = f.read()

# Check that faction panel comes AFTER </main>
idx_main = verify.find('    </main>')
idx_fp = verify.find('floating-card floating-faction-panel')
print(f"Main closes at: {idx_main}, Faction panel at: {idx_fp}")
print(f"Faction panel AFTER main: {idx_fp > idx_main}")
