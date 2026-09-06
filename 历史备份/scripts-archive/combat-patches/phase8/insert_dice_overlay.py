#!/usr/bin/env python3
"""Insert dice roll UI overlay into NewBattleView.vue template"""
PATH = '/root/original-project/frontend/src/views/NewBattleView.vue'

with open(PATH) as f:
    c = f.read()

overlay = '''
      <!-- Phase8: Manual Dice Roll Overlay -->
      <div v-if="diceRollState.active" class="dice-overlay" @click.self="cancelDiceRoll">
        <div class="dice-panel">
          <div class="dice-title">{{ diceRollState.skillName }}</div>
          <div class="dice-info">{{ diceRollState.diceType }} | Success: {{ diceRollState.successLine }}+</div>
          <div class="dice-result-area">
            <div v-if="diceRollState.animationPhase === \'idle\'" class="dice-prompt">
              Click dice or press <kbd>Space</kbd> to roll
            </div>
            <div v-else-if="diceRollState.animationPhase === \'rolling\'" class="dice-rolling">
              <span class="dice-number">{{ diceRollState.rollResult }}</span>
            </div>
            <div v-else class="dice-result">
              <div class="dice-number final">{{ diceRollState.rollResult }}</div>
              <div :class="diceRollState.isSuccess ? \'result-success\' : \'result-fail\'">
                {{ diceRollState.isSuccess ? \'SUCCESS\' : \'FAIL\' }}
              </div>
              <div v-if="diceRollState.isSuccess" class="bonus-info">
                +{{ diceRollState.bonusDamage }} Bonus Damage
              </div>
            </div>
          </div>
          <div class="dice-actions">
            <button v-if="diceRollState.animationPhase === \'idle\'" class="dice-btn roll" @click="startDiceRoll">Roll Dice</button>
            <button v-if="diceRollState.animationPhase === \'result\'" class="dice-btn confirm" @click="resolveDiceRoll">Confirm Attack</button>
            <button class="dice-btn cancel" @click="cancelDiceRoll">Cancel</button>
          </div>
        </div>
      </div>
'''

c = c.replace('</HexGridCanvas>', '</HexGridCanvas>' + overlay)

# Add CSS for dice overlay
dice_css = '''
/* Phase8: Dice Roll Overlay */
.dice-overlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0,0,0,0.75); z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(4px);
}
.dice-panel {
  background: linear-gradient(135deg, #0a1628, #001620);
  border: 2px solid #ffb000; border-radius: 8px;
  padding: 32px 40px; min-width: 340px; text-align: center;
  box-shadow: 0 0 40px rgba(255,176,0,0.15);
}
.dice-title { font-size: 18px; font-weight: 700; color: #ffb000; letter-spacing: 2px; margin-bottom: 8px; }
.dice-info { font-size: 11px; color: rgba(193,232,255,0.5); margin-bottom: 24px; }
.dice-result-area { min-height: 80px; margin-bottom: 20px; }
.dice-prompt { font-size: 13px; color: rgba(193,232,255,0.4); }
.dice-prompt kbd { background: rgba(255,176,0,0.15); border: 1px solid rgba(255,176,0,0.3); padding: 2px 8px; border-radius: 3px; color: #ffb000; font-family: inherit; }
.dice-number { font-size: 48px; font-weight: 700; color: #ffd597; }
.dice-number.final { animation: dicePop 0.3s ease-out; }
@keyframes dicePop { 0% { transform: scale(1.5); opacity: 0.3; } 100% { transform: scale(1); opacity: 1; } }
.dice-rolling .dice-number { animation: diceShake 0.05s infinite; }
@keyframes diceShake { 0% { transform: translateX(-3px); } 50% { transform: translateX(3px); } 100% { transform: translateX(-3px); } }
.result-success { font-size: 24px; font-weight: 900; color: #13ff43; letter-spacing: 4px; animation: dicePop 0.3s ease-out; text-shadow: 0 0 10px rgba(19,255,67,0.5); }
.result-fail { font-size: 20px; font-weight: 700; color: #ff5252; }
.bonus-info { font-size: 12px; color: #ffb000; margin-top: 4px; }
.dice-actions { display: flex; gap: 10px; justify-content: center; }
.dice-btn {
  padding: 10px 24px; font-size: 12px; font-weight: 700; letter-spacing: 1px;
  border: 1px solid rgba(159,142,120,0.3); cursor: pointer; font-family: inherit;
  transition: all 0.2s;
}
.dice-btn.roll { background: rgba(255,176,0,0.15); border-color: #ffb000; color: #ffb000; }
.dice-btn.roll:hover { background: rgba(255,176,0,0.25); box-shadow: 0 0 10px rgba(255,176,0,0.3); }
.dice-btn.confirm { background: rgba(19,255,67,0.1); border-color: #13ff43; color: #13ff43; }
.dice-btn.confirm:hover { background: rgba(19,255,67,0.2); box-shadow: 0 0 10px rgba(19,255,67,0.3); }
.dice-btn.cancel { background: rgba(0,0,0,0.2); border-color: rgba(159,142,120,0.15); color: rgba(193,232,255,0.4); }
.dice-btn.cancel:hover { border-color: rgba(255,82,82,0.3); color: #ff5252; }
'''

c = c.rstrip()
if '</style>' in c:
    c = c.replace('</style>', dice_css + '\n</style>')

with open(PATH, 'w') as f:
    f.write(c)

print('Dice overlay + CSS inserted into NewBattleView.vue')
