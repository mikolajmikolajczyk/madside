import { describe, expect, it } from 'vitest'
import { parseCdbFrameVars } from './z88dk-cdb'

// Real `-debug-defc` output captured from sccz80 for:
//   int add(int a, int b) { int sum = a + b; int doubled = sum * 2; return doubled; }
//   int main() { int r = add(3, 4); return r; }
// params land at positive IX offsets (above the frame), locals at negative.
const ASM = `
\tdefc\t__CDBINFO__S_3aLsrc_2fmain_2ec_2eadd_24b_24_30_5f_30_24_30_28_7b_32_7dSI_3aS_29_2cB_2c_31_2c_34 = 1
\tdefc\t__CDBINFO__S_3aLsrc_2fmain_2ec_2eadd_24a_24_30_5f_30_24_30_28_7b_32_7dSI_3aS_29_2cB_2c_31_2c_36 = 1
; S:Lsrc/main.c.add$sum$1_0$1({2}SI:S),B,1,-2
\tPUBLIC\t__CDBINFO__S_3aLsrc_2fmain_2ec_2eadd_24sum_24_31_5f_30_24_31_28_7b_32_7dSI_3aS_29_2cB_2c_31_2c_2d_32
\tdefc\t__CDBINFO__S_3aLsrc_2fmain_2ec_2eadd_24sum_24_31_5f_30_24_31_28_7b_32_7dSI_3aS_29_2cB_2c_31_2c_2d_32 = 1
\tdefc\t__CDBINFO__S_3aLsrc_2fmain_2ec_2eadd_24doubled_24_31_5f_30_24_31_28_7b_32_7dSI_3aS_29_2cB_2c_31_2c_2d_34 = 1
\tdefc\t__CDBINFO__S_3aLsrc_2fmain_2ec_2emain_24r_24_31_5f_30_24_33_28_7b_32_7dSI_3aS_29_2cB_2c_31_2c_2d_32 = 1
\tdefc\t__CDBINFO__F_3aG_24add_24_30_5f_30_24_30_28_7b_30_7dDF_2cSI_3aS_29_2cC_2c_30_2c_30_2c_30_2c_30_2c_30 = 1
`

describe('parseCdbFrameVars (#136)', () => {
  it('decodes IX-relative offsets for params + locals, skips F: records', () => {
    const vars = parseCdbFrameVars(ASM)
    const get = (func: string, name: string) => vars.find((v) => v.func === func && v.name === name)?.offset
    expect(get('add', 'b')).toBe(4)
    expect(get('add', 'a')).toBe(6)
    expect(get('add', 'sum')).toBe(-2)
    expect(get('add', 'doubled')).toBe(-4)
    expect(get('main', 'r')).toBe(-2)
    // The function (`F:`) record isn't a frame variable.
    expect(vars.some((v) => v.name === 'add' && v.func === 'add')).toBe(false)
    // sum appears as both PUBLIC and defc — deduped to one entry.
    expect(vars.filter((v) => v.func === 'add' && v.name === 'sum')).toHaveLength(1)
  })
})
