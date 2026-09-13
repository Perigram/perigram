import { definePreset } from '@primeuix/themes'
import Material from '@primeuix/themes/material'
import { primeComponentTokens, primeSemanticTokens } from '../tokens/index.js'

const Re_L = definePreset(Material, {
    semantic: primeSemanticTokens,
    components: primeComponentTokens
})

export default Re_L
