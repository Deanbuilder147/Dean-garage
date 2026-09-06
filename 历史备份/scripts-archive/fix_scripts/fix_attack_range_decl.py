#!/usr/bin/env python3
"""Fix attackRangeHexes declaration in NewBattleView.vue"""
import re

with open("/root/original-project/frontend/src/views/NewBattleView.vue", "r") as f:
    content = f.read()

# Fix 1: Replace corrupted line (literal \n from bad sed)
old_bad = "// Attack range highlight preview\\n  const attackRangeHexes = new Set()"
if old_bad in content:
    content = content.replace(
        old_bad,
        "// Attack range highlight preview (Phase 16 fix)\n  const attackRangeHexes = new Set()"
    )
    print("OK: Fixed corrupted attackRangeHexes line")
else:
    # Fix 2: Add declaration if it doesn't exist at all
    if "const attackRangeHexes" not in content:
        old_pattern = "  // Skill/Tactical range preview\n  const skillRangeHexes = new Set()"
        new_pattern = """  // Attack range highlight preview (Phase 16 fix)
  const attackRangeHexes = new Set()

  // Skill/Tactical range preview
  const skillRangeHexes = new Set()"""
        if old_pattern in content:
            content = content.replace(old_pattern, new_pattern)
            print("OK: Added attackRangeHexes declaration (pattern 1)")
        else:
            # Try alternative pattern (with blank line)
            old_pattern2 = "  // Skill/Tactical range preview\n\n  const skillRangeHexes = new Set()"
            new_pattern2 = """  // Skill/Tactical range preview

  // Attack range highlight preview (Phase 16 fix)
  const attackRangeHexes = new Set()
  const skillRangeHexes = new Set()"""
            if old_pattern2 in content:
                content = content.replace(old_pattern2, new_pattern2)
                print("OK: Added attackRangeHexes declaration (pattern 2)")
            else:
                # Last resort: find skillRangeHexes declaration
                match = re.search(r'(const skillRangeHexes = new Set\(\))', content)
                if match:
                    pos = match.start()
                    # Find start of that line
                    line_start = content.rfind('\n', 0, pos) + 1
                    declaration = "const attackRangeHexes = new Set()\n  "
                    content = content[:line_start] + declaration + content[line_start:]
                    print("OK: Added attackRangeHexes declaration (pattern 3)")
                else:
                    print("ERROR: skillRangeHexes not found at all!")

with open("/root/original-project/frontend/src/views/NewBattleView.vue", "w") as f:
    f.write(content)

# Verify
with open("/root/original-project/frontend/src/views/NewBattleView.vue", "r") as f:
    verify = f.read()
count = verify.count("const attackRangeHexes")
print(f"VERIFY: attackRangeHexes declared {count} time(s)")
