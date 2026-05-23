import { describe, it, expectTypeOf } from 'vitest'
import type { IdevsContentResponse } from '../../src/types/export'

describe('IdevsContentResponse', () => {
  it('exposes DownloadName and (deprecated) FileName', () => {
    const res: IdevsContentResponse = { Content: '', ContentType: '' }
    expectTypeOf(res.DownloadName).toEqualTypeOf<string | undefined>()
    expectTypeOf(res.FileName).toEqualTypeOf<string | undefined>()
  })
})
