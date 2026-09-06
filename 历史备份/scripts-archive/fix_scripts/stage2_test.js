import { UNIVERSAL_TERRAIN_MAP, convertMapFormat, TERRAIN_COLORS } from "./src/utils/hexUtils.js";

// Test 1: All 16 terrain types
const keys = Object.keys(UNIVERSAL_TERRAIN_MAP);
console.log("=== Test 1: Terrain count ===");
console.log("UNIVERSAL_TERRAIN_MAP:", keys.length, "terrains =", keys.join(", "));
console.log(keys.length === 16 ? "PASS" : "FAIL (expected 16)");

// Test 2: Every UNIVERSAL_TERRAIN_MAP has name, color, cost
console.log("\n=== Test 2: Required fields ===");
let allValid = true;
for (const [id, def] of Object.entries(UNIVERSAL_TERRAIN_MAP)) {
  if (!def.name || !def.color || def.cost === undefined) {
    console.log("  FAIL:", id, JSON.stringify(def));
    allValid = false;
  }
}
console.log(allValid ? "PASS" : "FAIL");

// Test 3: convertMapFormat roundtrip
console.log("\n=== Test 3: Converter roundtrip ===");
const editorData = {"0,0": "moon", "1,2": "forest", "3,5": "wall", "7,3": "desert"};
const arr = convertMapFormat(editorData, "to-array");
const mapBack = convertMapFormat(arr, "to-map");
const roundtripOK = JSON.stringify(editorData) === JSON.stringify(mapBack);
console.log(roundtripOK ? "PASS" : "FAIL");

// Test 4: converter idempotence
console.log("\n=== Test 4: Converter idempotence ===");
const arr2 = convertMapFormat(arr, "to-array");
const mapBack2 = convertMapFormat(mapBack, "to-map");
console.log(
  JSON.stringify(arr) === JSON.stringify(arr2) && JSON.stringify(mapBack) === JSON.stringify(mapBack2)
  ? "PASS" : "FAIL"
);

// Test 5: editor derivation mimics old terrainTypes behavior
console.log("\n=== Test 5: terrainTypes derivation ===");
const terrainTypes = Object.entries(UNIVERSAL_TERRAIN_MAP).map(([id, def]) => ({
  id, name: def.name, color: def.color, moveCost: def.cost,
}));
const moonDef = terrainTypes.find(t => t.id === "moon");
console.log("moon:", JSON.stringify(moonDef));
console.log(moonDef && moonDef.name === "月面" && moonDef.color === "#888888" && moonDef.moveCost === 1 ? "PASS" : "FAIL");

// Test 6: repair_station now has correct color from hexUtils (not base green)
console.log("\n=== Test 6: repair_station color fix ===");
const repair = UNIVERSAL_TERRAIN_MAP.repair_station;
console.log("repair_station:", JSON.stringify(repair));
console.log(repair.color === "#ff9800" ? "PASS (fixed from #4caf50)" : "FAIL");

console.log("\n[ALL TESTS COMPLETE]");
